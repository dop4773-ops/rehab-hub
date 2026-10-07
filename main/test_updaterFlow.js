// 실행: node main/test_updaterFlow.js
// 설치본(패키징된 앱)에서 업데이트 흐름이 의도대로 흐르는지를 가짜 electron-updater·가짜 화면으로 확인한다:
//   자동 모드 → 켜고 15초 뒤 확인 → 받기 → 10초 안내 → (저장 안 된 작업이 없으면) 하던 화면 저장 → 조용히 설치·재시작
//             → 저장 안 된 작업(직접 올린 파일 등)이 있으면 설치를 미루고 끌 때 설치 / "나중에" → 설치 안 함
//   수동 모드 → 켤 때 한 번 확인하고 안내만(저절로 설치·재시작 없음), 설치 버튼은 하던 화면을 저장한 뒤 조용히 설치
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), EventEmitter = require('events');

const realImmediate = global.setImmediate;
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => realImmediate(r)); }; // 화면 흉내의 답(다음 순서)과 await 연쇄가 끝나길 기다린다

async function run(mode, scenario, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-')); fs.writeFileSync(path.join(dir, 'update-settings.json'), JSON.stringify({ mode }));
  const au = new EventEmitter(), calls = [];
  au.checkForUpdates = async () => { calls.push('check'); au.emit('checking-for-update'); au.emit('update-available', { version: '9.9.9', releaseNotes: 'x' }); au.emit('download-progress', { percent: 50 }); au.emit('update-downloaded', { version: '9.9.9' }); };
  au.quitAndInstall = (silent, runAfter) => calls.push(`install(silent=${silent},run=${runAfter})`);
  const origLoad = Module._load; Module._load = function (req, ...a) { return req === 'electron-updater' ? { autoUpdater: au } : origLoad.call(this, req, ...a); };
  const timers = [], realST = global.setTimeout, realSI = global.setInterval, realCT = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; };
  global.setInterval = (fn, ms) => { timers.push({ fn, ms, every: true }); return {}; };
  global.setImmediate = (fn) => fn(); global.clearTimeout = (t) => { if (t) t.done = true; };
  const sent = [], handlers = {}, onceH = {};
  const app = { isPackaged: true, getPath: () => dir, getVersion: () => '0.0.1', quit: () => calls.push('quit'), exit: () => calls.push('exit'), relaunch: () => {} };
  const ipc = { handle: (n, f) => { handlers[n] = f; }, once: (n, f) => { onceH[n] = f; }, removeAllListeners: (n) => { delete onceH[n]; } };
  // 화면(렌더러) 흉내: 저장 요청엔 바로 답하고, 저장 안 된 작업 확인엔 opts.unsaved를 답한다(답은 실제 비동기로 돌아온다)
  const win = { isDestroyed: () => false, webContents: { send: (c, p) => {
    if (c === 'app:prepare-quit') { calls.push('prepare'); if (!opts.silent) realImmediate(() => onceH['app:prepared'] && onceH['app:prepared']({})); }
    else if (c === 'app:check-unsaved') realImmediate(() => onceH['app:unsaved'] && onceH['app:unsaved']({}, opts.unsaved || []));
    else sent.push(p.status === 'downloaded' && p.busy ? 'downloaded-busy' : p.status);
  } } };
  delete require.cache[require.resolve('./updater')];
  try {
    require('./updater').initUpdater(app, ipc, () => win);
    return await scenario({ calls, timers, sent, handlers, fire: (ms) => { for (const t of timers.filter(x => x.ms === ms && !x.done)) { t.done = !t.every; t.fn(); } } });
  } finally { Module._load = origLoad; global.setTimeout = realST; global.setInterval = realSI; global.setImmediate = realImmediate; global.clearTimeout = realCT; fs.rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  // ① 자동 모드: 15초 뒤 확인 → 받음 → 10초 안내 → 하던 화면 저장 → 조용히 설치(재실행)
  await run('auto', async (c) => {
    assert.ok(c.timers.some(t => t.ms === 15000), '시작 15초 뒤 확인이 예약돼야 해요'); assert.ok(c.timers.some(t => t.every && t.ms === 3600000), '1시간마다 확인이 예약돼야 해요');
    c.fire(15000); await settle(); assert.deepStrictEqual(c.calls, ['check']);
    assert.deepStrictEqual(c.sent.filter(s => ['checking', 'available', 'downloading', 'auto-install-pending'].includes(s)), ['checking', 'available', 'downloading', 'auto-install-pending']);
    assert.ok(!c.calls.some(x => x.startsWith('install')), '10초 안내 전에는 설치하면 안 돼요');
    c.fire(10000); await settle();
    assert.deepStrictEqual(c.calls, ['check', 'prepare', 'install(silent=true,run=true)'], '안내 뒤에는 하던 화면을 저장(prepare)한 다음 조용히 설치하고 다시 실행해야 해요');
  });
  // ② 자동 모드 + 저장 안 된 작업(직접 올린 파일): 설치하지 않고 끌 때 설치로 미룬다
  await run('auto', async (c) => {
    c.fire(15000); await settle(); c.fire(10000); await settle();
    assert.ok(!c.calls.some(x => x.startsWith('install')), '작업 중이면 설치하면 안 돼요'); assert.ok(!c.calls.includes('prepare'), '설치 안 하니 저장 요청도 필요 없어요');
    assert.ok(c.sent.includes('downloaded-busy'), '작업 중이라 미뤘다고 화면에 알려야 해요');
  }, { unsaved: ['직접 올린 파일(치료기록 QA)은 업데이트 뒤 다시 올려야 해요'] });
  // ③ 자동 모드 "나중에": 10초 안내 중 미루면 설치하지 않고 종료 때 설치로 남긴다
  await run('auto', async (c) => {
    c.fire(15000); await settle(); const r = await c.handlers['updater:postpone'](); assert.strictEqual(r.status, 'ok');
    c.fire(10000); await settle(); assert.ok(!c.calls.some(x => x.startsWith('install')), '미뤘는데 설치되면 안 돼요'); assert.ok(c.sent.includes('downloaded'));
  });
  // ④ 수동 모드: 켤 때 한 번 확인·안내, 저절로 설치하지 않고, 설치 버튼은 저장 뒤 조용히 설치
  await run('manual', async (c) => {
    c.fire(3600000); await settle(); assert.deepStrictEqual(c.calls, [], '수동 모드는 1시간마다 확인하지 않아요');
    c.fire(15000); await settle(); assert.deepStrictEqual(c.calls, ['check'], '수동 모드도 시작할 때 한 번은 확인해요');
    assert.ok(c.sent.includes('downloaded') && !c.sent.includes('auto-install-pending'), '받으면 안내만 해요');
    c.fire(10000); c.fire(30000); await settle(); assert.ok(!c.calls.some(x => x.startsWith('install')), '수동 모드는 저절로 설치하면 안 돼요');
    await c.handlers['updater:quitAndInstall'](); await settle();
    assert.deepStrictEqual(c.calls.slice(-2), ['prepare', 'install(silent=true,run=true)'], '설치 버튼은 하던 화면을 저장한 뒤 설치 창 없이 조용히 설치하고 다시 실행해야 해요');
  });
  // ⑤ 화면이 저장 요청에 답이 없어도(멈춤 등) 업데이트는 멈추지 않는다 — 1.5초 시간 초과 뒤 그대로 설치
  await run('auto', async (c) => {
    c.fire(15000); await settle(); c.fire(10000); await settle();
    assert.ok(c.calls.includes('prepare') && !c.calls.some(x => x.startsWith('install')), '답을 기다리는 동안은 아직 설치 전이에요');
    c.fire(1500); await settle(); assert.ok(c.calls.includes('install(silent=true,run=true)'), '시간이 지나면 설치는 계속 진행돼야 해요');
  }, { silent: true });
  console.log('updaterFlow: OK');
})().catch((e) => { console.error(e); process.exit(1); });
