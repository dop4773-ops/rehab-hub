// updater.js — GitHub Releases 기반 업데이트 확인/설치. itda(main/updater/index.js)와 같은 방식
// (electron-updater + GitHub publish 설정 + update_mode 수동/자동)을 쓰되, 이 앱은 단일 창·트레이
// 없음·보호할 draft 상태가 없어서 itda의 "위젯 스냅샷/자동저장 플러시" 부분은 필요 없다.
'use strict';
const fs = require('fs');
const path = require('path');
const { readEntries, appendEntry, normalizeReleases, repoInfo } = require('./updateLog');

function settingsPath(app) { return path.join(app.getPath('userData'), 'update-settings.json'); }
function loadMode(app) {
  try { return JSON.parse(fs.readFileSync(settingsPath(app), 'utf8')).mode === 'auto' ? 'auto' : 'manual'; }
  catch (e) { return 'manual'; } // 신규 설치 기본값 — 병원 업무 중 예고 없이 재시작되는 걸 막기 위해 안전한 쪽
}
function saveMode(app, mode) {
  fs.mkdirSync(path.dirname(settingsPath(app)), { recursive: true });
  fs.writeFileSync(settingsPath(app), JSON.stringify({ mode: mode === 'auto' ? 'auto' : 'manual' }, null, 2));
}

function initUpdater(app, ipcMain, getMainWindow) {
  ipcMain.handle('updater:getVersion', () => app.getVersion());
  ipcMain.handle('updater:getMode', () => loadMode(app));
  ipcMain.handle('updater:setMode', (event, mode) => { saveMode(app, mode); return loadMode(app); });

  const logFile = path.join(app.getPath('userData'), 'update-log.json');
  const log = (event, extra = {}) => { try { appendEntry(logFile, { event, ...extra }); } catch (e) { /* 기록 실패가 업데이트를 막지 않게 */ } };
  let nextSource = '자동'; // 사용자가 "지금 확인"을 누른 경우만 수동으로 표시

  let info = null; try { info = repoInfo(require('../package.json')); } catch (e) { /* 정보 없음 */ }
  ipcMain.handle('updater:getInfo', () => ({ version: app.getVersion(), mode: loadMode(app), repoUrl: info && info.url, releasesUrl: info && info.releasesUrl }));
  ipcMain.handle('updater:getLog', () => readEntries(logFile));
  // GitHub 릴리즈 목록(공개 저장소 — 로그인 없이 조회). 렌더러가 아니라 메인에서 가져온다(화면 보안 정책으로 외부 통신을 막아 두었기 때문).
  let relCache = { at: 0, list: null };
  ipcMain.handle('updater:releases', async () => {
    if (!info) return { error: '저장소 정보를 찾지 못했습니다.' };
    if (relCache.list && Date.now() - relCache.at < 10 * 60 * 1000) return { list: relCache.list, cached: true };
    try {
      const { net } = require('electron');
      const res = await net.fetch(info.apiUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'rehab-hub' } });
      if (!res.ok) throw new Error('GitHub 응답 ' + res.status);
      relCache = { at: Date.now(), list: normalizeReleases(await res.json()) };
      return { list: relCache.list };
    } catch (e) { return { error: e.message || '릴리즈 목록을 가져오지 못했습니다.' }; }
  });
  // 정해진 두 주소(저장소/릴리즈 페이지)만 기본 브라우저로 연다
  ipcMain.handle('updater:openUrl', async (event, kind) => {
    const url = info && (kind === 'releases' ? info.releasesUrl : kind === 'repo' ? info.url : null);
    if (!url) return false;
    await require('electron').shell.openExternal(url); return true;
  });

  // 개발 모드(패키징 안 된 상태)는 배포 메타데이터가 없어 electron-updater가 항상 에러만 낸다.
  if (!app.isPackaged) {
    ipcMain.handle('updater:checkNow', () => {
      log('dev-mode', { source: '수동', message: '개발 모드라 확인하지 않음' });
      return {
      status: 'dev-mode',
      message: '개발 모드에서는 업데이트 확인을 지원하지 않습니다. 패키징된 빌드(설치 후)에서만 동작합니다.',
    }; });
    ipcMain.handle('updater:quitAndInstall', () => ({ status: 'dev-mode' }));
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  // 자동 모드에서 performSilentInstall이 실패하더라도(설치 파일 잠금 등), 사용자가 앱을 종료할 때
  // 대기 중인 업데이트가 마저 적용되게 하는 안전망 — itda와 동일한 이유로 켜 둔다.
  autoUpdater.autoInstallOnAppQuit = true;

  const getMode = () => loadMode(app);

  function sendStatus(status, extra = {}) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { status, ...extra });
    }
  }

  autoUpdater.on('checking-for-update', () => { log('check', { source: nextSource }); sendStatus('checking'); });
  autoUpdater.on('update-available', (u) => { log('available', { version: u.version }); sendStatus('available', { version: u.version }); });
  autoUpdater.on('update-not-available', () => { log('not-available', { version: app.getVersion() }); sendStatus('not-available'); });
  autoUpdater.on('error', (err) => { log('error', { message: err?.message || '알 수 없는 오류' }); sendStatus('error', { message: err?.message || '알 수 없는 오류가 발생했습니다.' }); });
  autoUpdater.on('download-progress', (p) => sendStatus('downloading', { percent: Math.round(p.percent) }));

  let installTriggered = false;
  // 자동 모드: 다운로드가 끝나는 즉시 사람 개입 없이 조용히 설치하고 재시작한다.
  function performSilentInstall() {
    if (installTriggered) return;
    installTriggered = true;
    log('install', { source: '자동' });
    setImmediate(() => {
      try { autoUpdater.quitAndInstall(true, true); }
      catch (e) {
        try { app.relaunch(); } catch (e2) { /* noop */ }
        app.exit(0);
      }
      // quitAndInstall이 30초 안에 프로세스를 못 끝내면(설치 파일 잠금 등) 마지막 안전장치.
      setTimeout(() => app.quit(), 30 * 1000);
    });
  }

  autoUpdater.on('update-downloaded', (u) => {
    log('downloaded', { version: u.version });
    sendStatus('downloaded', { version: u.version });
    if (getMode() === 'auto') performSilentInstall();
  });

  ipcMain.handle('updater:checkNow', async () => {
    try {
      nextSource = '수동'; await autoUpdater.checkForUpdates(); nextSource = '자동';
      return { status: 'checked' };
    } catch (err) {
      return { status: 'error', message: err?.message || '업데이트 확인에 실패했습니다.' };
    }
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    log('install', { source: '수동' });
    autoUpdater.quitAndInstall(false, true); // 설치 후 자동 재실행
    return { status: 'ok' };
  });

  // ── 자동 모드 백그라운드 확인 ───────────────────────────────
  // 시작 15초 후 1회, 이후 1시간마다 확인한다. (mac에서 창을 새로 열 때(activate)마다 걸고 싶었지만,
  // getMainWindow가 매번 최신 창을 찾아주는 이유(main.js 주석 참고)와 같은 이유로 여기서 창 인스턴스에
  // 직접 리스너를 붙이면 그 창이 닫힌 뒤엔 죽은 참조가 되므로 단순하게 시간 기반만 둔다.)
  let lastCheckAt = 0;
  function autoCheck(reason) {
    if (getMode() !== 'auto') return;
    const now = Date.now();
    if (now - lastCheckAt < 60 * 1000) return; // 1분 내 중복 호출 방지
    lastCheckAt = now;
    autoUpdater.checkForUpdates().catch((err) => {
      console.error(`[updater] 자동 확인 실패 (${reason}):`, err?.message || err);
    });
  }
  setTimeout(() => autoCheck('시작'), 15 * 1000);
  setInterval(() => autoCheck('주기(1시간)'), 60 * 60 * 1000);
}

module.exports = { initUpdater };
