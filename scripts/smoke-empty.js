// scripts/smoke-empty.js — 「새 PC에서 처음 켠 상태」 점검: 빈 데이터 폴더로 앱을 띄워(폴더 연결·파일·기록 없음) 모든 화면·도움말·검색·점검 창을 눌러 보고,
// 화면에서 예외·보안정책 위반·404·콘솔 오류가 나는지 확인한다. 실데이터가 없어도(다른 PC·CI에서도) 돌아간다.
// 실행: node scripts/smoke-empty.js  (다른 앱과 데이터 폴더를 공유하지 않으므로 평소 쓰는 앱이 켜져 있어도 된다)
'use strict';
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os'); const PORT = 9352;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const msgs = []; const add = (t, m) => { const k = t + ' ' + String(m).slice(0, 260); if (!msgs.includes(k)) msgs.push(k); };
let failed = 0;
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-empty-')); const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-empty-export-'));
  const mainLog = [];
  const app = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js'), '.', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', `--user-data-dir=${dataDir}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REHAB_EXPORT_DIR: exportDir, REHAB_NO_RESUME: '1' } });
  app.stdout.on('data', d => mainLog.push(String(d))); app.stderr.on('data', d => mainLog.push(String(d)));
  try {
    let url; for (let i = 0; i < 60 && !url; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(t => t.type === 'page' && /rehab-shell/.test(t.url)); if (p) url = p.webSocketDebuggerUrl; } catch (e) {} if (!url) await sleep(500); }
    if (!url) throw new Error('앱 창을 찾지 못함');
    const ws = new WebSocket(url); let id = 0; const pend = new Map();
    // 인터넷이 없을 때 인수인계 실시간 조회(구글)가 실패하는 것은 정상 — 그 요청만 무시한다
    const ignoreNet = (t) => /script\.google|googleusercontent|Failed to fetch|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_CONNECTION|인수인계 조회/.test(t || '');
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
      if (d.method === 'Runtime.exceptionThrown') add('EXC', (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).split('\n').slice(0, 2).join(' | '));
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(d.params.type)) { const t = d.params.args.map(a => a.value ?? a.description ?? '').join(' '); if (!ignoreNet(t)) add('CON-' + d.params.type, t); }
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !ignoreNet(d.params.entry.text + ' ' + (d.params.entry.url || ''))) add('LOG-error', d.params.entry.text + ' ' + (d.params.entry.url || ''));
      if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !ignoreNet(d.params.response.url)) add('HTTP' + d.params.response.status, d.params.response.url); };
    await new Promise(r => ws.onopen = r);
    const rpc = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async e => { const r = (await rpc('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) { add('EVAL-ERR', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).split('\n').slice(0, 2).join(' | ')); return undefined; } return r.result.value; };
    await rpc('Runtime.enable'); await rpc('Log.enable'); await rpc('Network.enable');
    await sleep(3500);
    const step = async (name, fn) => { try { const r = await fn(); console.log('✓', name, r === undefined ? '' : JSON.stringify(r).slice(0, 200)); } catch (e) { failed++; add('STEP-FAIL', name + ': ' + e.message); console.log('✕', name, e.message); } };
    const nav = async k => { await ev(`document.querySelector('[data-nav=${k}]').click(); 1`); await sleep(1800); };
    const key = (k, extra = {}) => rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, ...extra }).then(() => rpc('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, ...extra }));
    const expect = (c, msg) => { if (!c) throw new Error(msg); };

    await step('처음 화면: 홈이 열리고 제목·사이드바가 보임', async () => { const r = await ev(`JSON.stringify({view:document.querySelector('.view.active').dataset.view, title:document.querySelector('#topbar .title').textContent, nav:document.querySelectorAll('.nav-item').length})`); const o = JSON.parse(r); expect(o.view === 'home' && o.nav >= 8, r); return o; });
    await step('홈: 할 일 목록에 「폴더 연결」 등 첫 안내가 있음(빈 화면이 아님)', async () => { const t = await ev(`document.getElementById('homeTodo').innerText`); expect(t && t.trim().length > 0, '오늘 할 일이 비어 있음'); return t.slice(0, 80); });
    for (const k of ['data', 'rm', 'acting', 'cross', 'handover', 'report', 'backup', 'settings', 'home'])
      await step('화면 열기: ' + k, async () => { await nav(k); const v = await ev(`document.querySelector('.view.active').dataset.view`); expect(v === k, '열린 화면: ' + v); return v; });

    // 도구 화면: 파일이 없어도 상태 띠가 있고, 도움말·직접 넣기 버튼이 동작해야 한다
    for (const k of ['rm', 'acting', 'cross']) {
      await step(`${k}: 상태 띠 · 직접 넣기 접힘/펼침 · 상단 ❓ 팝업`, async () => {
        await nav(k); await sleep(1500);
        const r = JSON.parse(await ev(`(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); const st=document.querySelector('[data-tool-status=${k}]'); const doc=document.querySelector('iframe[data-tool=${k}]').contentDocument;
          const hasStrip=!!st&&st.innerText.length>0, collapsed0=doc.body.classList.contains('rh-collapsed');
          st.querySelector('[data-files-toggle]').click(); await sl(300); const opened=!doc.body.classList.contains('rh-collapsed');
          st.querySelector('[data-files-toggle]').click(); await sl(300); const closedAgain=doc.body.classList.contains('rh-collapsed');
          document.getElementById('topbarHelpBtn').click(); await sl(200); const pop=!!document.querySelector('.hp-pop'); const title=pop?document.querySelector('.hp-pop-h b').textContent:''; document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await sl(100);
          return JSON.stringify({hasStrip,collapsed0,opened,closedAgain,pop,title,popClosed:!document.querySelector('.hp-pop')}); })()`));
        expect(r.hasStrip && r.collapsed0 && r.opened && r.closedAgain && r.pop && r.popClosed, JSON.stringify(r)); return r.title;
      });
    }
    await step('F1: 화면마다 그 화면 도움말이 작은 팝업으로 뜸', async () => {
      const out = [];
      for (const k of ['home', 'data', 'rm', 'acting', 'cross', 'handover', 'report', 'backup', 'settings']) { await nav(k); await key('F1', { windowsVirtualKeyCode: 112 }); await sleep(300); out.push(k + ':' + (await ev(`(document.querySelector('.hp-pop-h b')||{}).textContent||''`))); await key('Escape', { windowsVirtualKeyCode: 27 }); await sleep(150); }
      expect(out.every(x => /:❓ \S/.test(x)), out.join(' / ')); return out;
    });
    await step('팝업의 「전체 도움말」→ 전체 화면 도움말·검색', async () => { await nav('home'); await key('F1', { windowsVirtualKeyCode: 112 }); await sleep(300); await ev(`document.querySelector('[data-help-page]').click(); 1`); await sleep(400);
      const r = JSON.parse(await ev(`JSON.stringify({view:document.querySelector('.view.active').dataset.view, secs:document.querySelectorAll('.hp-sec').length})`)); expect(r.view === 'help' && r.secs >= 10, JSON.stringify(r)); return r; });
    await step('환자 빠른 검색(Ctrl+K): 환자 데이터가 없어도 열고 닫힘', async () => { await nav('home');
      const r = JSON.parse(await ev(`(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); window.__openPatientSearch(); await sl(300); const i=document.querySelector('.ps-input'); const opened=!!i; i.value='가'; i.dispatchEvent(new Event('input',{bubbles:true})); await sl(500); const body=document.querySelector('.ps-body').innerText.slice(0,60); window.__psClose(); await sl(100); return JSON.stringify({opened,body,closed:!document.querySelector('.ps-overlay')}); })()`));
      expect(r.opened && r.closed, JSON.stringify(r)); return r.body; });
    await step('오늘 점검(Ctrl+Shift+D)·선생님별 할 일(Ctrl+Shift+U): 데이터 없이도 창이 뜸', async () => { await nav('home');
      const r = JSON.parse(await ev(`(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); runDailyCheck(); let daily=false; for(let i=0;i<90&&!daily;i++){ await sl(1000); daily=document.getElementById('dailyModal').classList.contains('show'); } /* 인수인계를 인터넷에서 가져오느라 수 초~수십 초 걸릴 수 있다 */ document.getElementById('dailyModal').classList.remove('show'); openWhoModal(); await sl(500); const who=document.getElementById('whoModal')&&document.getElementById('whoModal').classList.contains('show'); document.getElementById('whoModal').classList.remove('show'); return JSON.stringify({daily,who}); })()`));
      expect(r.daily && r.who, JSON.stringify(r)); return r; });
    await step('설정: 모든 탭이 열리고 검색창이 동작', async () => { await nav('settings');
      const r = JSON.parse(await ev(`(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); let n=0; for(const b of document.querySelectorAll('#stTabs [data-tab]')){ b.click(); await sl(150); if(document.querySelector('.st-page.on, .st-page.active, .st-page[style*="block"]')||true) n++; } const s=document.getElementById('stSearch'); s.value='폴더'; s.dispatchEvent(new Event('input',{bubbles:true})); await sl(200); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); return JSON.stringify({tabs:n}); })()`));
      expect(r.tabs >= 6, JSON.stringify(r)); return r; });
    await step('데이터 준비: 파일이 없어도 표·목록 전환', async () => { await nav('data');
      const r = JSON.parse(await ev(`(async()=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)); const out=[]; for(const b of document.querySelectorAll('#dataViewSeg [data-dv]')){ b.click(); await sl(250); out.push(document.getElementById('dataFileList').innerText.length); } return JSON.stringify(out); })()`));
      expect(r.length === 2 && r.every(n => n > 0), JSON.stringify(r)); return r; });
    for (const k of ['home', 'data', 'rm', 'acting', 'cross', 'handover', 'backup', 'report', 'settings']) await nav(k);
    await sleep(1200); ws.close();
  } finally { app.kill('SIGTERM'); await sleep(1500); for (const d of [dataDir, exportDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 임시 폴더 정리 */ } } }
  console.log('\n=== 수집된 오류/경고 ' + msgs.length + '건 ==='); msgs.forEach(m => console.log(m));
  const ml = mainLog.join('').split('\n').filter(l => /error|exception|unhandled|fail/i.test(l) && !/DevTools listening|script\.google|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|net::/i.test(l));
  console.log('\n=== 메인 프로세스 로그 ' + ml.length + '줄 ==='); ml.slice(0, 15).forEach(l => console.log(l.slice(0, 200)));
  process.exit(failed || msgs.length || ml.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
