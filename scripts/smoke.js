// scripts/smoke.js — 앱을 실제로 띄워 모든 화면·버튼·필터를 눌러 보고, 화면에서 예외·보안정책 위반·404가 나는지와
// 내보내기 엑셀이 제대로 열리는지 확인하는 점검 스크립트.  실행: node scripts/smoke.js  (앱을 완전히 종료한 뒤)
// 실데이터를 읽기만 한다(원본 파일 수정 없음). 교차검증을 실행하므로 앱 보관 공간에 오늘 이력이 한 번 기록된다(실제 실행과 동일).
// 치료기록 QA는 이 PC에 액팅 기록 파일이 없을 수 있어, 아래 FAKE_ACTING_B64 자리에 가짜 파일을 넣어 확인한다(없으면 그 단계는 건너뜀).
'use strict';
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const PORT = 9351;
const R = require('../renderer/core/xlsx-reader.js'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const msgs = []; const add = (t, m) => { const k = t + ' ' + String(m).slice(0, 260); if (!msgs.includes(k)) msgs.push(k); };
(async () => {
  const mainLog = []; const app = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js'), '.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
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
    await step('홈 새로고침/스캔 버튼', async () => { await nav('home'); await ev(`document.getElementById('homeScanBtn')?.click(); 1`); await sleep(1500); return await ev(`document.getElementById('homeTodo').innerText.slice(0,80)`); });
    await step('설정: 모든 탭·스위치·선택칸 순회 후 복구', async () => { await nav('settings'); return await ev(`(async()=>{ const bak=JSON.parse(JSON.stringify(settings)); let n=0; const wait=ms=>new Promise(r=>setTimeout(r,ms));
      for (const t of document.querySelectorAll('#stTabs button')) { t.click(); n++; await wait(80);
        for (const sw of t.ownerDocument.querySelectorAll('.st-page.on input[type=checkbox][data-set]')) { sw.click(); n++; sw.click(); }
        for (const b of document.querySelectorAll('.st-page.on .st-seg [data-v]')) { b.click(); n++; }
        for (const s of document.querySelectorAll('.st-page.on select[data-set]')) for (const o of s.options) { s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); n++; } }
      const mid = settings.syncMode; replaceSettings(bak); document.querySelector('#stTabs [data-tab=data]').click(); return { n, restored: JSON.stringify(settings)===JSON.stringify(bak), mid }; })()`); });
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
        const names = book.sheets.map(x => x.name), nn = n.normalize('NFC'); // 시트 순서 규칙: 팀별=전체(RM) 시트가 맨 앞, 전체=날짜순
        if (/그랜드라운딩_팀별/.test(nn)) { const i = names.findIndex(x => !/^전체/.test(x)); if (i >= 0 && names.slice(i).some(x => /^전체/.test(x))) throw new Error(nn + ' 전체 시트가 앞에 모여 있지 않음: ' + names.join('|')); }
        if (/그랜드라운딩_전체_/.test(nn)) { const d = names.filter(x => /^\d{4}-/.test(x)); if (JSON.stringify(d) !== JSON.stringify([...d].sort())) throw new Error(nn + ' 시트가 날짜순이 아님: ' + d.join('|')); }
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
    await step('교차검증: 칸 주소가 실제 원본 칸을 가리키는지(읽기만)', async () => {
      // 화면에서는 "이슈별 칸 주소와 그 칸의 실제 값"만 모아 오고, 맞는지는 여기(Node)에서 판정한다
      const items = await ev(`(async()=>{ const w=${W('cross')}, R=w.RehabCore, N=R.normalizeText, hk=w.__testHooks, st=hk.state();
        const grid=[st.mat10Book,st.table10Book,st.mt3Book].filter(Boolean);
        const read=async(book,sheet,ref)=>{ const c=book&&await R.getSheetCells(book,sheet); return c?N(c.get(ref)||''):null; };
        const out=[]; for(const i of hk.issues()){ if(!i.refs) continue; const d=i.detail||{}; const it={kind:d.kind,patient:i.patient,floor:i.floor,d:{expected:d.expected,source:d.source,statusRoom:d.statusRoom,cardRoom:d.cardRoom,vals:d.vals,loc:d.loc,cardLoc:d.cardLoc,scheduleLoc:d.scheduleLoc,gridNames:d.gridNames},refs:[]};
          for(const r of i.refs) for(const cell of r.cells){ let v=null; if(r.group==='status') v=await read(st.statusBook,r.sheet,cell); else if(r.group==='card') v=await read(i.floor===3?st.card3Book:st.card10Book,r.sheet,cell); else for(const b of grid){ v=await read(b,r.sheet,cell); if(v) break; } it.refs.push({group:r.group,sheet:r.sheet,cell,value:v,isStatusSheet:r.sheet===hk.statusSheet()}); }
          out.push(it); } return {items:out,total:hk.issues().length}; })()`);
      const nk = (v) => String(v == null ? '' : v).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g, '').toUpperCase(), first = (v) => nk(String(v).split('\n')[0]);
      const dr = (v) => String(v == null ? '' : v).match(/\d{3,4}/)?.[0] || '', dc = (v) => { const m = /(\d+)/.exec(String(v)); return m ? 'RM' + m[1] : String(v).toUpperCase(); };
      const fail = {}, bad = (k) => { fail[k] = (fail[k] || 0) + 1; }; let checked = 0;
      for (const it of items.items) for (const r of it.refs) {
        checked++; const v = r.value, nameOk = nk(v) === nk(it.patient) || first(v) === nk(it.patient);
        if (v == null) { bad(it.kind + ':칸을 읽지 못함'); continue; }
        if (r.group === 'status' && r.isStatusSheet) { // 현황판 칸
          if (it.kind === 'count' && it.d.source !== 'outpatient' && parseInt(v, 10) !== it.d.expected) bad('count:현황 횟수 칸');
          if (it.kind === 'room_mismatch' && dr(v) !== dr(it.d.statusRoom)) bad('room_mismatch:현황 병실 칸');
          if (it.kind === 'room_rm') { const x = (it.d.vals || []).find(q => q.name === '현황판'); if (x && dc(v) !== x.value) bad('room_rm:현황 진료과 칸'); }
          if (it.kind === 'discharge_stillactive' && v !== '퇴원') bad('discharge_stillactive:퇴원 칸');
          if (it.kind === 'discharge_notmarked' && !/입원|외래/.test(v)) bad('discharge_notmarked:입원 칸');
        } else if (r.group === 'status') { // 평일시간표 칸: 그 칸 첫 줄이 환자 이름으로 시작
          if (!first(v).startsWith(nk(it.patient).replace(/[A-Z0-9]+$/, '').slice(0, 3))) bad(it.kind + ':시간표 칸 이름');
        } else if (r.group === 'card') {
          if (/^A\d+$/.test(r.cell)) { if (!nameOk) bad(it.kind + ':카드 이름 칸'); }
          else if (it.kind === 'room_mismatch') { if (dr(v) !== dr(it.d.cardRoom)) bad('room_mismatch:카드 병실 칸'); }
          else if (it.kind === 'room_rm') { const x = (it.d.vals || []).find(q => q.name === '전체시간표'); if (x && dc(v) !== x.value) bad('room_rm:카드 RM 칸'); }
          else if (it.kind === 'mismatch') { if (!v) bad('mismatch:카드 치료위치 칸 비어 있음'); }
          else if (it.kind === 'sched_mismatch') { if (!v) bad('sched_mismatch:카드 치료위치 칸 비어 있음'); }
        } else if (r.group === 'grid') {
          if (it.kind === 'missing' && nk(v) !== nk(it.patient)) bad('grid:missing 이름');
          if (it.kind === 'mismatch' && !String(it.d.gridNames).split(',').map(nk).includes(nk(v))) bad('grid:mismatch 이름');
        }
      }
      if (Object.keys(fail).length) throw new Error('칸 주소가 원본과 안 맞음: ' + JSON.stringify(fail));
      return { 이슈: items.total, 칸주소_붙은_이슈: items.items.length, 확인한_칸: checked };
    });
    await step('교차검증: handleRun(이력 포함)', async () => await ev(`(async()=>{ const w=${W('cross')}; await w.handleRun(); return w.document.getElementById('histBox').innerText.slice(0,60); })()`));
    await step('교차검증: 모든 이슈 상세 열기', async () => await ev(`(()=>{ const w=${W('cross')}; const bad=[]; for(const i of w.__testHooks.issues()){ try{ w.openDetail(i.id); const t=w.document.getElementById('detailPanel').innerText; if(t.length<20) bad.push(i.id+':빈상세'); if(/undefined|NaN|\\[object/.test(t)) bad.push(i.id+':'+(t.match(/.{0,20}(undefined|NaN|\\[object).{0,20}/)||[''])[0]); }catch(e){ bad.push(i.id+':'+e.message); } } return {bad:bad.slice(0,8),n:bad.length}; })()`));
    await step('교차검증: 모든 분류/세부 필터 순회', async () => await ev(`(async()=>{ const d=${W('cross')}.document; let c=0; for(const b of d.querySelectorAll('#catSeg button')){ b.click(); await new Promise(r=>setTimeout(r,50)); for(const seg of ['#fieldSeg','#locSourceSeg','#handoverSourceSeg','#roomSourceSeg','#changeSeg']){ for(const x of d.querySelectorAll(seg+' button')){ x.click(); c++; await new Promise(r=>setTimeout(r,30)); } } } for(const f of d.querySelectorAll('.floor-row2')){ f.click(); c++; } for(const v of d.querySelectorAll('#viewSeg button, #displayModeSeg button')){ v.click(); c++; await new Promise(r=>setTimeout(r,60)); } return c; })()`));
    await step('교차검증: 수정 지시서 열기·필터·복사텍스트', async () => await ev(`(async()=>{ const w=${W('cross')}, d=w.document; d.getElementById('btnFixPlan').click(); await new Promise(r=>setTimeout(r,300)); let c=0; for(const b of d.querySelectorAll('#fixGroupSeg button')){ b.click(); c++; } const sel=d.getElementById('fixWhoSel'); for(const o of [...sel.options].slice(0,5)){ sel.value=o.value; sel.dispatchEvent(new Event('change')); c++; } d.getElementById('fixHideDone').click(); d.getElementById('fixHideDone').click(); const bad=/undefined|NaN|\\[object/.test(d.getElementById('fixBody').innerText); d.getElementById('fixClose').click(); return {c,bad}; })()`));
    await step('교차검증: 이력 모달/확인함', async () => await ev(`(async()=>{ const d=${W('cross')}.document; d.getElementById('histOpen').click(); await new Promise(r=>setTimeout(r,200)); const t=d.getElementById('histModalBody').innerText; d.getElementById('histClose').click(); return {len:t.length,bad:/undefined|NaN|\\[object/.test(t)}; })()`));
    await step('교차검증: CSV/복사 버튼', async () => await ev(`(()=>{ const w=${W('cross')}; return w.summaryText().length; })()`));
    await step('교차검증: 검색', async () => await ev(`(async()=>{ const d=${W('cross')}.document; const s=d.getElementById('searchInput'); for(const q of ['501','가','zz','']){ s.value=q; s.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,80)); } return 1; })()`));
    await step('교차검증: 제외(사유)·제외 해제·유지', async () => await ev(`(async()=>{ const w=${W('cross')}, d=w.document, sl=ms=>new Promise(r=>setTimeout(r,ms)); await w.handleRun(); const n0=w.__testHooks.issues().length, p0=d.getElementById('numProblem').textContent;
      w.openExclModal(w.__testHooks.issues()[0]); const r=d.getElementById('exclReason'); r.value='점검용'; r.dispatchEvent(new Event('input')); d.getElementById('exclOk').click(); await sl(300);
      const n1=w.__testHooks.issues().length, p1=d.getElementById('numProblem').textContent; await w.handleRun(); const n2=w.__testHooks.issues().length;
      d.getElementById('exclBtn').click(); d.querySelector('[data-restore]').click(); await sl(300); d.getElementById('exclListClose').click();
      const n3=w.__testHooks.issues().length; localStorage.removeItem('rehab_cross_exclude_v1'); if(!(n1===n0-1 && n2===n0-1 && n3===n0 && Number(p1)===Number(p0)-1)) throw new Error('제외 결과가 맞지 않음 '+[n0,n1,n2,n3,p0,p1]); return [n0,n1,n2,n3,p0,p1]; })()`));
    // 인수인계/백업
    await nav('handover'); await sleep(7000);
    // 원래 쓰던 인수인계 프로그램 그대로라 쓰기 버튼(삭제·퇴원·수정)이 있다 — 점검에서는 조회성 동작(검색·정렬·칩·상세·휴지통 목록 열기)만 누른다.
    await step('인수인계: 목록·검색·정렬·칩·상세·휴지통 보기', async () => await ev(`(async()=>{ const w=${W('handover')}, d=w.document; const sl=ms=>new Promise(r=>setTimeout(r,ms)); const n=d.querySelectorAll('#patientList > *').length; if(!n) throw new Error('목록 비어 있음'); for(const b of d.querySelectorAll('#typeChipRow button, #warnChipRow button')){ b.click(); await sl(50); b.click(); await sl(50); } const q=d.getElementById('searchName'); q.value='가'; q.dispatchEvent(new Event('input')); await sl(150); q.value=''; q.dispatchEvent(new Event('input')); const so=d.getElementById('sortOrder'); for(const o of [...so.options]){ so.value=o.value; so.dispatchEvent(new Event('change')); await sl(60); } d.querySelector('#patientList > *').click(); await sl(300); const dl=d.getElementById('detailPanel').innerText.length; d.getElementById('trashBtn').click(); await sl(500); const tr=d.getElementById('trashModal').classList.contains('open'); const fa=d.fonts.check('900 14px "Font Awesome 6 Free"'); return {n,dl,tr,fa}; })()`));
    await step('백업 화면', async () => { await nav('backup'); await sleep(1500); return await ev(`document.querySelector('.bk-banner .t')?.innerText`); });
    for (const k of ['home', 'data', 'rm', 'acting', 'cross', 'handover', 'backup', 'report', 'settings']) await nav(k);
    await sleep(1500); ws.close();
  } finally { app.kill('SIGTERM'); await sleep(1500); }
  console.log('\n=== 수집된 오류/경고 ' + msgs.length + '건 ==='); msgs.forEach(m => console.log(m));
  const ml = mainLog.join('').split('\n').filter(l => /error|exception|unhandled|warn|fail/i.test(l) && !/DevTools listening/.test(l)); console.log('\n=== 메인 프로세스 로그 ' + ml.length + '줄 ==='); ml.slice(0, 15).forEach(l => console.log(l.slice(0, 220)));
})();
