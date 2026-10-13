// envCheck.js — 설정 › 환경 점검이 쓰는 확인 함수(파일 열람·폴더 쓰기). 읽기만 하고 원본 파일은 바꾸지 않는다.
// 원본 점검 항목: 각 파일을 읽을 수 있는지 · 엑셀(zip) 형식인지 · OneDrive "온라인 전용(필요할 때 다운로드)" 상태인지 · 저장 폴더에 쓸 수 있는지.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Windows `attrib 파일` 한 줄: "A    O   P   C:\폴더\파일.xlsx" — 경로 앞의 글자가 속성이다.
// A 보관 · H 숨김 · S 시스템 · R 읽기전용 · I 색인 제외 · O 오프라인(클라우드에만 있음) · P 항상 이 기기에 보관 · U 고정 해제(온라인 전용)
function parseAttrib(out, filePath) {
  const line = String(out || '').split(/\r?\n/).find(l => l.trim());
  if (!line) return null;
  let i = filePath ? line.indexOf(filePath) : -1;
  if (i < 0) { const m = line.match(/[A-Za-z]:\\|\\\\/); i = m ? m.index : -1; }
  if (i < 0) return null;
  const flags = new Set(line.slice(0, i).replace(/\s+/g, '').toUpperCase().split(''));
  return { offline: flags.has('O'), pinned: flags.has('P'), unpinned: flags.has('U'), placeholder: flags.has('O') || flags.has('U') };
}
const attribRun = (p) => new Promise((resolve) => {
  execFile('attrib', [p], { windowsHide: true, timeout: 5000 }, (err, out) => resolve(err ? null : String(out)));
});

// 파일 하나 점검 → {readable, ms, size, zip, placeholder, error}
// 온라인 전용(placeholder) 파일은 읽는 순간 내려받기가 시작되므로 먼저 속성을 보고, 그런 파일은 열지 않는다.
async function probeFile(p, { platform = process.platform, attrib = attribRun } = {}) {
  const out = { readable: null, ms: 0, size: null, zip: null, placeholder: null, error: '' };
  if (!/\.(xlsx|xlsm)$/i.test(String(p))) { out.error = '엑셀 파일이 아니에요'; out.readable = false; return out; }
  try { out.size = (await fs.promises.stat(p)).size; } catch (e) { out.readable = false; out.error = e.code || e.message; return out; }
  if (platform === 'win32') {
    const a = parseAttrib(await attrib(p), p);
    out.placeholder = a ? a.placeholder : null;
    if (a && a.placeholder) return out;
  }
  const t0 = Date.now();
  try {
    const fh = await fs.promises.open(p, 'r');
    try { const b = Buffer.alloc(4); const { bytesRead } = await fh.read(b, 0, 4, 0); out.zip = bytesRead === 4 && b[0] === 0x50 && b[1] === 0x4b; out.readable = true; }
    finally { await fh.close(); }
  } catch (e) { out.readable = false; out.error = e.code || e.message; }
  out.ms = Date.now() - t0;
  return out;
}

// 폴더에 파일을 쓸 수 있는지(임시 파일을 만들었다가 지움)
async function probeDirWritable(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const f = path.join(dir, `.rehab-write-test-${process.pid}`);
    await fs.promises.writeFile(f, 'x'); await fs.promises.unlink(f);
    return { path: dir, writable: true, error: '' };
  } catch (e) { return { path: dir, writable: false, error: e.code || e.message }; }
}

module.exports = { parseAttrib, probeFile, probeDirWritable };
