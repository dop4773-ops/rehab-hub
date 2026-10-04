// scripts/golden.js — 리팩터링 전후에 3개 도구의 실제 데이터 출력이 같은지 비교하는 "골든 스냅샷" 도구.
//   node scripts/golden.js save <이름>      앱을 띄워 현재 출력을 저장
//   node scripts/golden.js compare <이름>   다시 띄워 저장본과 비교(차이 건수·요약만 출력)
// 환자 이름이 들어 있는 결과는 저장소 밖(기본 ~/.rehab-hub-golden)에만 저장하고, 화면에는 개수·해시만 보여준다.
// 실행 전에 재활치료부 앱을 완전히 종료해 둘 것(같은 데이터 폴더를 쓰는 앱이 이미 떠 있으면 안 됨).
// 인수인계는 실시간 연동이라 사람이 고치면 값이 달라질 수 있다 → 'handover' 분류 차이는 따로 표시한다.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.REHAB_GOLDEN_DIR || path.join(os.homedir(), '.rehab-hub-golden');
const PORT = 9341;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === 'page' && /rehab-shell/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 앱이 아직 뜨는 중 */ }
    await sleep(1000);
  }
  throw new Error('앱에 연결하지 못했습니다(이미 실행 중인 앱이 있으면 종료 후 다시).');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const opened = new Promise(r => { ws.onopen = r; });
  const ev = async (expression, awaitPromise = true) => {
    await opened;
    const res = await new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise } })); });
    const r = res.result || {};
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result && r.result.value;
  };
  return { ev, close: () => ws.close() };
}
const toolWin = (tool) => `document.querySelector('iframe[data-tool="${tool}"]').contentWindow`;
async function waitFor(ev, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* 아직 준비 전 */ } await sleep(500); } return false; }

async function capture() {
  const app = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js'), '.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  try {
    const c = cdp(await connect()); const { ev } = c; const out = {};
    await sleep(4000);
    // 그랜드라운딩: 자동으로 채워진 환자 목록
    await ev("document.querySelector('[data-nav=rm]').click(); 1");
    const okG = await waitFor(ev, `${toolWin('rm')}.__testHooks&&${toolWin('rm')}.__testHooks.allPatients().length>0`, 60000);
    out.grand = okG ? await ev(`(function(){const w=${toolWin('rm')}; const ps=w.__testHooks.allPatients();
      return {patients:ps.map(p=>[p.name,p.reg,p.room,p.floor,p.category,p.rm,p.label,JSON.stringify(p.schedule),JSON.stringify(p.therapists||{})]),
        language:ps.filter(p=>w.grandIsLanguagePatient(p)).map(p=>p.name+'|'+p.floor)};})()`) : null;
    // 교차검증: 전체 실행 결과
    await ev("document.querySelector('[data-nav=cross]').click(); 1");
    await waitFor(ev, `typeof ${toolWin('cross')}.handleRun==='function'`, 30000);
    await sleep(6000); // 파일 자동 채움·읽기 대기
    out.cross = await ev(`(async function(){const w=${toolWin('cross')}; await w.handleRun(); await new Promise(r=>setTimeout(r,500));
      return {stats:w.__lastStats, issues:w.__testHooks.issues().map(i=>[i.category,i.source||i.field||'',i.title,i.patient,i.room||'',i.time||'',i.line])};})()`);
    // 치료기록 QA: 요약 카운트와 화면 결과 텍스트(내부 변수가 IIFE라 직접 못 읽음)
    await ev("document.querySelector('[data-nav=acting]').click(); 1");
    const okA = await waitFor(ev, `!!${toolWin('acting')}.__actingSummary`, 60000);
    out.acting = okA ? await ev(`(function(){const w=${toolWin('acting')}; return {summary:w.__actingSummary, text:w.document.body.innerText.replace(/\\s+/g,' ')};})()`) : null;
    c.close(); return out;
  } finally { app.kill('SIGKILL'); }
}

// 도구별로 {count, hash, rows}로 줄인다. rows는 비교용(저장본에만), 화면엔 안 찍는다.
function summarize(out) {
  const res = {};
  if (out.grand) { res.grand = { count: out.grand.patients.length, hash: sha(out.grand.patients), rows: out.grand.patients.map(r => r.join('|')) }; res.grandLanguage = { count: out.grand.language.length, hash: sha(out.grand.language), rows: out.grand.language }; }
  if (out.cross) {
    const rows = out.cross.issues.map(r => r.join('|'));
    res.cross = { count: rows.length, hash: sha(rows.filter((r, i) => out.cross.issues[i][0] !== 'handover')), rows, stats: out.cross.stats };
    const h = rows.filter((r, i) => out.cross.issues[i][0] === 'handover'); res.crossHandover = { count: h.length, hash: sha(h), rows: h };
  }
  if (out.acting) res.acting = { count: out.acting.summary.totalCount, hash: sha([out.acting.summary, out.acting.text]), rows: [JSON.stringify(out.acting.summary), 'text:' + out.acting.text.length], summary: out.acting.summary };
  return res;
}

(async () => {
  const [cmd, name] = process.argv.slice(2);
  if (!['save', 'compare'].includes(cmd) || !name) { console.log('사용법: node scripts/golden.js save|compare <이름>'); process.exit(2); }
  const file = path.join(DIR, `${name}.json`);
  const cur = summarize(await capture());
  if (cmd === 'save') {
    fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(cur));
    for (const [k, v] of Object.entries(cur)) console.log(`저장 ${k}: ${v.count}건 #${v.hash}`);
    console.log(`→ ${file}`); return;
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf8')); let bad = 0;
  for (const k of new Set([...Object.keys(base), ...Object.keys(cur)])) {
    const a = base[k], b = cur[k];
    if (!a || !b) { console.log(`✕ ${k}: ${a ? '이번에 수집 못함' : '저장본에 없음'}`); bad++; continue; }
    if (a.hash === b.hash && a.count === b.count) { console.log(`✓ ${k}: ${b.count}건 일치`); continue; }
    const sa = new Set(a.rows), sb = new Set(b.rows);
    const lost = a.rows.filter(r => !sb.has(r)).length, added = b.rows.filter(r => !sa.has(r)).length;
    console.log(`${k === 'crossHandover' ? '△' : '✕'} ${k}: ${a.count}→${b.count}건 (사라짐 ${lost} · 새로 생김 ${added})`);
    if (k !== 'crossHandover') bad++;
  }
  console.log(bad ? `\n차이 있음 ${bad}곳` : '\n전부 일치(인수인계 실시간 항목 제외)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
