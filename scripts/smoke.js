// scripts/smoke.js — 앱을 실제로 띄워 모든 화면·버튼·필터를 눌러 보고, 화면에서 예외·보안정책 위반·404가 나는지와
// 내보내기 엑셀이 제대로 열리는지 확인하는 점검 스크립트.  실행: node scripts/smoke.js  (앱을 완전히 종료한 뒤)
// 실데이터를 읽기만 한다(원본 파일 수정 없음). 교차검증을 실행하므로 앱 보관 공간에 오늘 이력이 한 번 기록된다(실제 실행과 동일).
// 치료기록 QA는 이 PC에 액팅 기록 파일이 없을 수 있어, 아래 FAKE_ACTING_B64 자리에 가짜 파일을 넣어 확인한다(없으면 그 단계는 건너뜀).
'use strict';
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const PORT = 9351;
const R = require('../renderer/core/xlsx-reader.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const msgs = []; const add = (t, m) => { const k = t + ' ' + String(m).slice(0, 260); if (!msgs.includes(k)) msgs.push(k); };
(async () => {
  const mainLog = []; const app = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js'), '.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', d => mainLog.push(String(d))); app.stderr.on('data', d => mainLog.push(String(d)));
  try {
    let url; for (let i = 0; i < 60 && !url; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(t => t.type === 'page' && /rehab-shell/.test(t.url)); if (p) url = p.webSocketDebuggerUrl; } catch (e) {} if (!url) await sleep(500); }
    const ws = new WebSocket(url); let id = 0; const pend = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
      if (d.method === 'Runtime.exceptionThrown') add('EXC', (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).split('\n').slice(0, 2).join(' | '));
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(d.params.type)) add('CON-' + d.params.type, d.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) add('LOG-' + d.params.entry.level, d.params.entry.text + ' ' + (d.params.entry.url || ''));
      if (d.method === 'Network.loadingFailed') add('NETFAIL', (d.params.errorText || '') + ' ' + d.params.requestId);
      if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) add('HTTP' + d.params.response.status, d.params.response.url); };
    await new Promise(r => ws.onopen = r);
    const rpc = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async e => { const r = (await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) { add('EVAL-ERR', (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return undefined; } return r.result && r.result.value; };
    await rpc('Runtime.enable'); await rpc('Log.enable'); await rpc('Network.enable');
    await sleep(3000);
    const W = t => `document.querySelector('iframe[data-tool="${t}"]').contentWindow`;
    const nav = async k => { await ev(`document.querySelector('[data-nav=${k}]').click(); 1`); await sleep(1500); };
    const step = async (name, fn) => { try { const r = await fn(); console.log('✓', name, r === undefined ? '' : JSON.stringify(r).slice(0, 220)); } catch (e) { add('STEP-FAIL', name + ': ' + e.message); console.log('✕', name, e.message); } };
    // 홈/데이터/설정/보고서
    for (const k of ['home', 'data', 'settings', 'report']) await step('화면 ' + k, async () => { await nav(k); return await ev(`document.querySelector('.view.active').dataset.view`); });
    await step('홈 새로고침/스캔 버튼', async () => { await nav('home'); await ev(`document.getElementById('homeRefreshBtn')?.click(); 1`); await sleep(1500); return await ev(`document.getElementById('homeAlerts').innerText.slice(0,80)`); });
    await step('동기화 주기 변경 후 복구', async () => { await nav('settings'); await ev(`document.querySelector('input[name=syncMode][value="10"]').click(); 1`); const s = await ev(`localStorage.getItem('rehab_sync_mode')`); await ev(`document.querySelector('input[name=syncMode][value="launch"]').click(); 1`); return s; });
    // 그랜드라운딩
    await nav('rm'); await sleep(6000);
    await step('그랜드: 환자 로드·RM 선택·요일/시간 변경', async () => await ev(`(async()=>{ const w=${W('rm')}, d=w.document; const n=w.__testHooks.allPatients().length; const sel=d.getElementById('grandRmSelect'); const out=[]; for(const o of [...sel.options].slice(0,6)){ sel.value=o.value; sel.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,150)); out.push(d.querySelectorAll('table tbody tr').length); } return {n,rows:out}; })()`));
    await step('그랜드: 모든 select 옵션 순회(오류 확인)', async () => await ev(`(async()=>{ const d=${W('rm')}.document; let c=0; for(const s of d.querySelectorAll('select')){ if(s.id==='grandRmSelect') continue; for(const o of [...s.options]){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); c++; await new Promise(r=>setTimeout(r,60)); } } return c; })()`));
    await step('그랜드: 언어치료 필터/팀 메뉴/도움말 버튼', async () => await ev(`(async()=>{ const d=${W('rm')}.document; const ids=[...d.querySelectorAll('button')].map(b=>b.id).filter(Boolean); return ids.length; })()`));

    await nav('rm'); await sleep(1500);
    const exp = await ev(`(async()=>{ const w=${W('rm')}; const ps=w.__testHooks.allPatients().filter(p=>p.category!=='외래'); const rms=[...new Set(ps.map(p=>p.rm))].filter(r=>/^RM/i.test(r)).slice(0,2);
      const entries=rms.map((rm,i)=>({id:'t'+i,dateKey:'2026-10-0'+(5+i),rm,ward:'8·9병동',day:'월요일',hour:'09',routeKey:'round1',patients:ps.filter(p=>p.rm===rm),issues:{unmatched:[],notWritten:[]}}));
      const out={}; const keep=w.__schedulesApi; w.__schedulesApi={load:async()=>entries}; const keepDl=w.downloadBytes;
      w.downloadBytes=(bytes,name)=>{ let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192)); out[name]=btoa(s); };
      const notes={}; try{ notes.all=await w.grandArchiveExport(['t0','t1'],'all',null,''); notes.team=await w.grandArchiveExport(['t0','t1'],'team',null,''); notes.lang=await w.grandArchiveExport(['t0','t1'],'lang',null,''); notes.lang3=await w.grandArchiveExport(['t0','t1'],'lang',null,'3F'); }finally{ w.__schedulesApi=keep; w.downloadBytes=keepDl; }
      return {notes,files:out}; })()`);
    await step('그랜드: 보관함 내보내기 4종 엑셀 검증', async () => {
      const names = Object.keys(exp.files); if (names.length < 3) throw new Error('내보낸 파일이 ' + names.length + '개뿐');
      const res = [];
      for (const n of names) { const buf = Buffer.from(exp.files[n], 'base64'); const book = await R.readWorkbookFile({ name: n, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
        let cells = 0; for (const s of book.sheets) { const c = await R.getSheetCells(book, s.name); if (!c) throw new Error(n + ' 시트를 못 읽음: ' + s.name); cells += c.size; }
        if (!book.sheets.length || !cells) throw new Error(n + ' 비어 있음'); res.push(`${n.normalize('NFC').slice(0, 24)}: 시트 ${book.sheets.length}·셀 ${cells}`); }
      return res; });

    // 치료기록 QA: 가짜 액팅 파일 업로드
    await nav('acting'); await sleep(2500);
    const fakePath = path.join(__dirname, 'fixtures', 'fake_acting.b64'); const b64 = fs.existsSync(fakePath) ? fs.readFileSync(fakePath, 'utf8').trim() : '';
    if (b64) await step('QA: 가짜 액팅 파일 분석', async () => { await ev(`(()=>{ const d=${W('acting')}.document; const bin=atob('${b64}'); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); const f=new File([u],'테스트_기록통계.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); const dt=new DataTransfer(); dt.items.add(f); const inp=d.getElementById('fileInput'); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); return 1; })()`); await sleep(3500); return await ev(`JSON.stringify(${W('acting')}.__actingSummary||null)`); });
    await step('QA: 필터·탭 버튼 순회', async () => await ev(`(async()=>{ const d=${W('acting')}.document; let c=0; for(const b of d.querySelectorAll('.seg button, .tab, [data-filter]')){ b.click(); c++; await new Promise(r=>setTimeout(r,80)); } for(const s of d.querySelectorAll('select')){ for(const o of [...s.options]){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); c++; } } return c; })()`));
    // 교차검증
    await nav('cross'); await sleep(8000);
    await step('교차검증: 실행', async () => await ev(`(async()=>{ const w=${W('cross')}; await w.runAllVerifications(); return w.__testHooks.issues().length; })()`));
    await step('교차검증: handleRun(이력 포함)', async () => await ev(`(async()=>{ const w=${W('cross')}; await w.handleRun(); return w.document.getElementById('histBox').innerText.slice(0,60); })()`));
    await step('교차검증: 모든 이슈 상세 열기', async () => await ev(`(()=>{ const w=${W('cross')}; const bad=[]; for(const i of w.__testHooks.issues()){ try{ w.openDetail(i.id); const t=w.document.getElementById('detailPanel').innerText; if(t.length<20) bad.push(i.id+':빈상세'); if(/undefined|NaN|\\[object/.test(t)) bad.push(i.id+':'+(t.match(/.{0,20}(undefined|NaN|\\[object).{0,20}/)||[''])[0]); }catch(e){ bad.push(i.id+':'+e.message); } } return {bad:bad.slice(0,8),n:bad.length}; })()`));
    await step('교차검증: 모든 분류/세부 필터 순회', async () => await ev(`(async()=>{ const d=${W('cross')}.document; let c=0; for(const b of d.querySelectorAll('#catSeg button')){ b.click(); await new Promise(r=>setTimeout(r,50)); for(const seg of ['#fieldSeg','#locSourceSeg','#handoverSourceSeg','#roomSourceSeg','#changeSeg']){ for(const x of d.querySelectorAll(seg+' button')){ x.click(); c++; await new Promise(r=>setTimeout(r,30)); } } } for(const f of d.querySelectorAll('.floor-row2')){ f.click(); c++; } for(const v of d.querySelectorAll('#viewSeg button, #displayModeSeg button')){ v.click(); c++; await new Promise(r=>setTimeout(r,60)); } return c; })()`));
    await step('교차검증: 수정 지시서 열기·필터·복사텍스트', async () => await ev(`(async()=>{ const w=${W('cross')}, d=w.document; d.getElementById('btnFixPlan').click(); await new Promise(r=>setTimeout(r,300)); let c=0; for(const b of d.querySelectorAll('#fixGroupSeg button')){ b.click(); c++; } const sel=d.getElementById('fixWhoSel'); for(const o of [...sel.options].slice(0,5)){ sel.value=o.value; sel.dispatchEvent(new Event('change')); c++; } d.getElementById('fixHideDone').click(); d.getElementById('fixHideDone').click(); const bad=/undefined|NaN|\\[object/.test(d.getElementById('fixBody').innerText); d.getElementById('fixClose').click(); return {c,bad}; })()`));
    await step('교차검증: 이력 모달/확인함', async () => await ev(`(async()=>{ const d=${W('cross')}.document; d.getElementById('histOpen').click(); await new Promise(r=>setTimeout(r,200)); const t=d.getElementById('histModalBody').innerText; d.getElementById('histClose').click(); return {len:t.length,bad:/undefined|NaN|\\[object/.test(t)}; })()`));
    await step('교차검증: CSV/복사 버튼', async () => await ev(`(()=>{ const w=${W('cross')}; return w.summaryText().length; })()`));
    await step('교차검증: 검색', async () => await ev(`(async()=>{ const d=${W('cross')}.document; const s=d.getElementById('searchInput'); for(const q of ['501','가','zz','']){ s.value=q; s.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,80)); } return 1; })()`));
    // 인수인계/백업
    await nav('handover'); await sleep(7000);
    await step('인수인계: 목록·필터·상세·이전기록', async () => await ev(`(async()=>{ const w=${W('handover')}, d=w.document; const n=d.querySelectorAll('.row').length; for(const b of d.querySelectorAll('#typeSeg button')){ b.click(); await new Promise(r=>setTimeout(r,60)); } d.getElementById('warnChip').click(); d.getElementById('warnChip').click(); d.getElementById('modChip').click(); d.getElementById('modChip').click(); const q=d.getElementById('q'); q.value='RM'; q.dispatchEvent(new Event('input')); q.value=''; q.dispatchEvent(new Event('input')); for(const s of ['therSel','docSel','sortSel']){ const el=d.getElementById(s); for(const o of [...el.options].slice(0,4)){ el.value=o.value; el.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,40)); } el.value=el.options[0].value; el.dispatchEvent(new Event('change')); } d.querySelector('.row').click(); await new Promise(r=>setTimeout(r,200)); const hb=d.getElementById('histBtn'); if(hb){ hb.click(); await new Promise(r=>setTimeout(r,5000)); } return {n,detail:d.getElementById('detail').innerText.length}; })()`));
    await step('백업 화면', async () => { await nav('backup'); await sleep(1500); return await ev(`document.querySelector('.bk-banner .t')?.innerText`); });
    for (const k of ['home', 'data', 'rm', 'acting', 'cross', 'handover', 'backup', 'report', 'settings']) await nav(k);
    await sleep(1500); ws.close();
  } finally { app.kill('SIGTERM'); await sleep(1500); }
  console.log('\n=== 수집된 오류/경고 ' + msgs.length + '건 ==='); msgs.forEach(m => console.log(m));
  const ml = mainLog.join('').split('\n').filter(l => /error|exception|unhandled|warn|fail/i.test(l) && !/DevTools listening/.test(l)); console.log('\n=== 메인 프로세스 로그 ' + ml.length + '줄 ==='); ml.slice(0, 15).forEach(l => console.log(l.slice(0, 220)));
})();
