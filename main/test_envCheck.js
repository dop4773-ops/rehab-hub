// test_envCheck.js — 환경 점검: attrib 해석 · 파일 점검 · 결과 목록 만들기. 실행: node main/test_envCheck.js
'use strict';
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { parseAttrib, probeFile, probeDirWritable } = require('./envCheck');
const R = require('../renderer/core/envReport.js');

// attrib 출력 해석
assert.deepStrictEqual(parseAttrib('A    O   C:\\Users\\a\\OneDrive\\현황.xlsx\r\n', 'C:\\Users\\a\\OneDrive\\현황.xlsx'), { offline: true, pinned: false, unpinned: false, placeholder: true });
assert.strictEqual(parseAttrib('A        U   C:\\x\\a.xlsx', 'C:\\x\\a.xlsx').placeholder, true);
assert.strictEqual(parseAttrib('A      P   C:\\x\\a.xlsx', 'C:\\x\\a.xlsx').placeholder, false);
assert.strictEqual(parseAttrib('A    C:\\x\\a.xlsx', 'C:\\x\\a.xlsx').placeholder, false);
assert.strictEqual(parseAttrib('', 'C:\\x'), null);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-env-'));
  const good = path.join(dir, 'good.xlsx'), bad = path.join(dir, 'bad.xlsx'), empty = path.join(dir, 'empty.xlsx');
  fs.writeFileSync(good, Buffer.from([0x50, 0x4b, 3, 4, 0, 0])); fs.writeFileSync(bad, 'hello world'); fs.writeFileSync(empty, '');
  let p = await probeFile(good, { platform: 'darwin' }); assert.ok(p.readable && p.zip && p.placeholder === null);
  p = await probeFile(bad, { platform: 'darwin' }); assert.ok(p.readable && p.zip === false);
  p = await probeFile(empty, { platform: 'darwin' }); assert.strictEqual(p.size, 0);
  p = await probeFile(path.join(dir, 'none.xlsx'), { platform: 'darwin' }); assert.strictEqual(p.readable, false);
  p = await probeFile(path.join(dir, 'a.txt'), { platform: 'darwin' }); assert.strictEqual(p.readable, false);
  // 온라인 전용 파일은 열지 않는다(읽기 시도가 내려받기를 시작하므로)
  p = await probeFile(good, { platform: 'win32', attrib: async (f) => `A    O   ${f}` }); assert.strictEqual(p.placeholder, true); assert.strictEqual(p.readable, null);
  p = await probeFile(good, { platform: 'win32', attrib: async (f) => `A        ${f}` }); assert.strictEqual(p.placeholder, false); assert.strictEqual(p.readable, true);
  assert.strictEqual((await probeDirWritable(dir)).writable, true);
  assert.strictEqual((await probeDirWritable(path.join(good, 'sub'))).writable, false); // 파일 밑에는 폴더를 못 만든다

  // 결과 목록
  const now = Date.now(), roles = [{ key: 'status', label: '작업치료현황', required: true }, { key: 'card3', label: '3F 전체시간표', required: true }, { key: 'pta', label: 'PTA', required: false }];
  const f = (n, d) => ({ path: `C:\\u\\OneDrive - 병원\\${n}`, name: n, mtimeMs: now - d * 86400000 });
  const env = { platform: 'win32', release: '10.0.19045', arch: 'x64', app: '0.24.0', electron: '22', dataDir: { path: 'D', writable: true }, exportDir: { path: 'E', writable: false, error: 'EACCES' },
    folders: [{ label: '시간표', dirPath: 'C:\\u', exists: true, xlsx: 3 }, { label: '없는폴더', dirPath: 'X:\\', exists: false }], oneDriveRunning: false,
    files: [{ path: f('현황.xlsx', 0).path, readable: null, placeholder: true }] };
  const r = R.build({ env, scan: { matched: { status: f('현황.xlsx', 0) }, unmatched: [{ name: '메모.xlsx' }], errors: [] }, roles, now });
  const has = (lv, re) => r.items.some(i => i.level === lv && re.test(i.title));
  assert.ok(has('err', /엑셀·CSV 저장 폴더에 쓸 수 없어요/)); assert.ok(has('ok', /데이터 저장 폴더에 쓸 수 있어요/));
  assert.ok(has('err', /없는폴더.*찾을 수 없어요/)); assert.ok(has('ok', /시간표.*엑셀 3개/));
  assert.ok(has('err', /3F 전체시간표: 못 찾았어요/)); assert.ok(has('info', /PTA: 못 찾았어요/));
  assert.ok(has('warn', /OneDrive에서 아직 내려받지 않은/)); assert.ok(has('err', /OneDrive가 꺼져 있어요/));
  assert.ok(has('info', /역할을 알 수 없는 엑셀 1개/));
  assert.ok(r.counts.err >= 4 && /\[환경 점검/.test(r.text));
  // 모두 정상
  const ok = R.build({ env: { ...env, exportDir: { path: 'E', writable: true }, folders: [{ label: 'a', dirPath: 'a', exists: true, xlsx: 1 }], oneDriveRunning: true, files: [{ path: f('현황.xlsx', 0).path, readable: true, size: 9, zip: true, ms: 12 }] }, scan: { matched: { status: f('현황.xlsx', 2), card3: f('전체.xlsx', 1) }, unmatched: [], errors: [] }, roles, now });
  assert.strictEqual(ok.counts.err, 0); assert.strictEqual(ok.counts.warn, 0); assert.ok(ok.items.some(i => /2일 전 수정/.test(i.detail)));
  // 읽기 실패·빈 파일·손상
  const bd = R.build({ env: { ...env, files: [{ path: f('현황.xlsx', 0).path, readable: false, error: 'EBUSY' }] }, scan: { matched: { status: f('현황.xlsx', 0) } }, roles: [roles[0]], now });
  assert.ok(bd.items.some(i => i.level === 'err' && /열 수 없어요/.test(i.title)));
  const sc = R.build({ env, scan: { matched: {}, unmatched: [], errors: [] }, roles: [], now, schedule: { files: 4, items: [{ text: '작업치료실 시간표에 오늘(10/15) 날짜 시트가 없어요' }], robot: [{ name: '김명자', left: -7 }] } });
  assert.ok(sc.items.some(i => i.group === '시간표 파일' && i.level === 'warn' && /날짜 시트가 없어요/.test(i.title))); assert.ok(sc.items.some(i => /로봇재활 종료일 확인: 김명자\(7일 지남\)/.test(i.title)));
  assert.ok(R.build({ env, scan: { matched: {}, unmatched: [], errors: [] }, roles: [], now, schedule: { files: 4, items: [], robot: [] } }).items.some(i => i.group === '시간표 파일' && i.level === 'ok'));
  console.log('envCheck: OK');
})().catch(e => { console.error(e); process.exit(1); });
