'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { registerSchemePrivileges, registerProtocolHandler, shellUrl } = require('./protocol');
const { registerFoldersIpc } = require('./ipc/folders.ipc');
const { registerItdaIpc } = require('./ipc/itda.ipc');
const { initUpdater } = require('./updater');

registerSchemePrivileges(); // app.whenReady() 전에 호출해야 함(Electron 요구사항)

// 병원 PC에서 아이콘을 여러 번 눌러도 창이 여러 개 뜨지 않도록 단일 인스턴스로 강제한다.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow;

  app.on('second-instance', () => {
    if (mainWindow) {
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
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.setMenu(null);
    mainWindow.loadURL(shellUrl('/index.html'));
    // mainWindow.webContents.openDevTools(); // 개발 중 디버깅용
  }

  app.whenReady().then(() => {
    registerProtocolHandler();
    registerFoldersIpc();
    registerItdaIpc();
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
