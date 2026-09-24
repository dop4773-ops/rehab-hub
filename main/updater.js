// updater.js — GitHub Releases 기반 업데이트 확인/설치. itda(main/updater/index.js)와 같은 방식
// (electron-updater + GitHub publish 설정)을 쓰되, 이 앱은 단일 창·트레이 없음·보호할 draft
// 상태가 없어서 itda의 "자동 모드/위젯 스냅샷/자동저장 플러시" 부분은 필요 없다 — 그 부분만 뺐다.
'use strict';

function initUpdater(app, ipcMain, getMainWindow) {
  ipcMain.handle('updater:getVersion', () => app.getVersion());

  // 개발 모드(패키징 안 된 상태)는 배포 메타데이터가 없어 electron-updater가 항상 에러만 낸다.
  if (!app.isPackaged) {
    ipcMain.handle('updater:checkNow', () => ({
      status: 'dev-mode',
      message: '개발 모드에서는 업데이트 확인을 지원하지 않습니다. 패키징된 빌드(설치 후)에서만 동작합니다.',
    }));
    ipcMain.handle('updater:quitAndInstall', () => ({ status: 'dev-mode' }));
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;

  function sendStatus(status, extra = {}) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { status, ...extra });
    }
  }

  autoUpdater.on('checking-for-update', () => sendStatus('checking'));
  autoUpdater.on('update-available', (info) => sendStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => sendStatus('not-available'));
  autoUpdater.on('error', (err) => sendStatus('error', { message: err?.message || '알 수 없는 오류가 발생했습니다.' }));
  autoUpdater.on('download-progress', (p) => sendStatus('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => sendStatus('downloaded', { version: info.version }));

  ipcMain.handle('updater:checkNow', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { status: 'checked' };
    } catch (err) {
      return { status: 'error', message: err?.message || '업데이트 확인에 실패했습니다.' };
    }
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall(false, true); // 설치 후 자동 재실행
    return { status: 'ok' };
  });
}

module.exports = { initUpdater };
