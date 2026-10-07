// 실행: node main/test_updaterFlow.js
// 설치본(패키징된 앱)에서 업데이트 흐름이 의도대로 흐르는지를 가짜 electron-updater로 확인한다:
//   자동 모드 → 켜고 15초 뒤 확인 → 받기 → 10초 안내 → 조용히 설치·재시작 / "나중에" → 설치 안 함
//   수동 모드 → 켤 때 한 번 확인하고 안내만(저절로 설치·재시작 없음), 1시간마다 확인 없음
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), EventEmitter = require('events');

async function run(mode, scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-')); fs.writeFileSync(path.join(dir, 'update-settings.json'), JSON.stringify({ mode }));
  const au = new EventEmitter(); const calls = []; au.checkForUpdates = async () => { calls.push('check'); au.emit('checking-for-update'); au.emit('update-available', { version: '9.9.9', releaseNotes: 'x' }); au.emit('download-progress', { percent: 50 }); au.emit('update-downloaded', { version: '9.9.9' }); };
  au.quitAndInstall = (silent, run) => calls.push(`install(silent=${silent},run=${run})`);
  const origLoad = Module._load; Module._load = function (req, ...a) { return req === 'electron-updater' ? { autoUpdater: au } : origLoad.call(this, req, ...a); };
  const timers = [], realST = global.setTimeout, realSI = global.setInterval, realSIm = global.setImmediate, realCT = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; }; global.setInterval = (fn, ms) => { timers.push({ fn, ms, every: true }); return {}; }; global.setImmediate = (fn) => fn(); global.clearTimeout = (t) => { if (t) t.done = true; };
  const sent = [], handlers = {}, app = { isPackaged: true, getPath: () => dir, getVersion: () => '0.0.1', quit: () => calls.push('quit'), exit: () => calls.push('exit'), relaunch: () => {} };
  const ipc = { handle: (n, f) => { handlers[n] = f; } }, win = { isDestroyed: () => false, webContents: { send: (c, p) => sent.push(p.status) } };
  delete require.cache[require.resolve('./updater')];
  try { require('./updater').initUpdater(app, ipc, () => win); return await scenario({ au, calls, timers, sent, handlers, fire: (ms) => { for (const t of timers.filter(x => x.ms === ms && !x.done)) { t.done = !t.every; t.fn(); } } }); }
  finally { Module._load = origLoad; global.setTimeout = realST; global.setInterval = realSI; global.setImmediate = realSIm; global.clearTimeout = realCT; fs.rmSync(dir, { recursive: true, force: true }); }
}
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  // ① 자동 모드: 15초 뒤 확인 → 받음 → 10초 안내 → 조용히 설치(재실행)
  await run('auto', async (c) => {
    assert.ok(c.timers.some(t => t.ms === 15000), '시작 15초 뒤 확인이 예약돼야 해요'); assert.ok(c.timers.some(t => t.every && t.ms === 3600000), '1시간마다 확인이 예약돼야 해요');
    c.fire(15000); await tick(); assert.deepStrictEqual(c.calls, ['check']);
    assert.deepStrictEqual(c.sent.filter(s => ['checking', 'available', 'downloading', 'auto-install-pending'].includes(s)), ['checking', 'available', 'downloading', 'auto-install-pending']);
    assert.ok(!c.calls.some(x => x.startsWith('install')), '10초 안내 전에는 설치하면 안 돼요');
    c.fire(10000); await tick(); assert.ok(c.calls.includes('install(silent=true,run=true)'), '안내 뒤에는 조용히 설치하고 다시 실행해야 해요');
  });
  // ② 자동 모드 "나중에": 10초 안내 중 미루면 설치하지 않고 종료 때 설치로 남긴다
  await run('auto', async (c) => {
    c.fire(15000); await tick(); const r = await c.handlers['updater:postpone'](); assert.strictEqual(r.status, 'ok');
    c.fire(10000); await tick(); assert.ok(!c.calls.some(x => x.startsWith('install')), '미뤘는데 설치되면 안 돼요'); assert.ok(c.sent.includes('downloaded'));
  });
  // ③ 수동 모드: 켤 때 한 번 확인·안내, 설치는 사용자가 버튼을 눌러야 함
  await run('manual', async (c) => {
    c.fire(3600000); await tick(); assert.deepStrictEqual(c.calls, [], '수동 모드는 1시간마다 확인하지 않아요');
    c.fire(15000); await tick(); assert.deepStrictEqual(c.calls, ['check'], '수동 모드도 시작할 때 한 번은 확인해요');
    assert.ok(c.sent.includes('downloaded') && !c.sent.includes('auto-install-pending'), '받으면 안내만 해요');
    c.fire(10000); c.fire(30000); await tick(); assert.ok(!c.calls.some(x => x.startsWith('install')), '수동 모드는 저절로 설치하면 안 돼요');
    await c.handlers['updater:quitAndInstall'](); assert.ok(c.calls.includes('install(silent=true,run=true)'), '설치 버튼은 설치 창 없이 조용히 설치하고 다시 실행해야 해요');
  });
  console.log('updaterFlow: OK');
})().catch((e) => { console.error(e); process.exit(1); });
