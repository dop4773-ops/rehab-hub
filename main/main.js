'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { registerSchemePrivileges, registerProtocolHandler, shellUrl } = require('./protocol');
const { registerFoldersIpc } = require('./ipc/folders.ipc');
const { registerItdaIpc } = require('./ipc/itda.ipc');
const { registerSchedulesIpc } = require('./ipc/schedules.ipc');
const { registerBackupIpc } = require('./ipc/backup.ipc');
const { initUpdater } = require('./updater');

registerSchemePrivileges(); // app.whenReady() 전에 호출해야 함(Electron 요구사항)

// 병원 PC에서 아이콘을 여러 번 눌러도 창이 여러 개 뜨지 않도록 단일 인스턴스로 강제한다.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow;

  // 예상 못 한 오류가 나도 앱이 오류 창을 띄우며 멈추지 않게 기록만 남긴다(기록은 설정 › 데이터 폴더 열기에서 볼 수 있다). 파일이 커지면 처음부터 다시 쓴다.
  const logError = (kind, err) => {
    try {
      const fs = require('fs'), file = path.join(app.getPath('userData'), 'error.log');
      let big = false; try { big = fs.statSync(file).size > 200 * 1024; } catch (e) { /* 아직 없음 */ }
      (big ? fs.writeFileSync : fs.appendFileSync)(file, `[${new Date().toISOString()}] ${kind}: ${err && err.stack || err}\n`);
    } catch (e) { /* 기록을 못 남겨도 앱은 계속 */ }
  };
  process.on('uncaughtException', (err) => logError('uncaughtException', err));
  process.on('unhandledRejection', (err) => logError('unhandledRejection', err));

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      backgroundColor: '#f4f7fb',
      icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.setMenu(null);
    // 화면 안의 링크가 앱 창을 외부 사이트로 바꾸거나 새 창을 열지 못하게 막는다(앱은 app://rehab-shell 안에서만 움직인다).
    // 외부 주소는 업데이트 설정의 "열기" 버튼처럼 정해진 경로(shell.openExternal)로만 연다.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://rehab-shell/')) event.preventDefault(); });
    // 화면 프로세스가 죽거나 처음 불러오기에 실패하면(메모리 부족·백신 간섭 등) 흰 화면으로 두지 않고 다시 불러온다 — 10초 안에 반복되면 멈춘다.
    let lastReload = 0;
    const reloadOnce = (why) => { const now = Date.now(); if (now - lastReload < 10000 || mainWindow.isDestroyed()) return; lastReload = now; logError('reload', why); mainWindow.loadURL(shellUrl('/index.html')); };
    mainWindow.webContents.on('render-process-gone', (e, d) => reloadOnce('render-process-gone ' + d.reason));
    mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => { if (isMainFrame && code !== -3) reloadOnce('did-fail-load ' + code + ' ' + desc); }); // -3 = 사용자가 중단
    mainWindow.loadURL(shellUrl('/index.html'));
    // mainWindow.webContents.openDevTools(); // 개발 중 디버깅용
  }

  // 바로가기·작업표시줄 고정 아이콘과 실행 중인 창을 같은 앱으로 묶는다(설치기가 바로가기에 같은 ID를 넣는다 — package.json build.appId)
  if (process.platform === 'win32') app.setAppUserModelId('com.rehabteam.rehabhub');
  app.whenReady().then(() => {
    registerProtocolHandler();
    registerFoldersIpc();
    registerItdaIpc();
    registerSchedulesIpc();
    registerBackupIpc();
    ipcMain.handle('app:dataDir', () => app.getPath('userData'));
    ipcMain.handle('app:openDataDir', () => shell.openPath(app.getPath('userData')));
    createWindow();
    // mainWindow를 그대로 넘기면 안 된다 — mac은 창을 닫아도 앱이 안 죽고, dock 클릭(activate)으로
    // 새 창이 만들어지는데 그때도 이 참조는 여전히 "닫힌" 옛 창을 가리켜서 업데이트 알림이 조용히
    // 안 뜨게 된다. 항상 현재 창을 다시 찾는 함수를 넘긴다.
    initUpdater(app, ipcMain, () => mainWindow);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
