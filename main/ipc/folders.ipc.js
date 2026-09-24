// folders.ipc.js — 렌더러(window.rehab.folders.*)가 폴더 등록/스캔/읽기를 요청하는 창구.
'use strict';
const { ipcMain, BrowserWindow } = require('electron');
const store = require('../folderStore');

function registerFoldersIpc() {
  ipcMain.handle('folders:choose', async (event, label) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return store.chooseFolder(win, label);
  });
  ipcMain.handle('folders:list', () => store.listFolders());
  ipcMain.handle('folders:remove', (event, id) => { store.removeFolder(id); return store.listFolders(); });
  ipcMain.handle('folders:scanAll', () => store.scanAll());
  ipcMain.handle('folders:fileRoles', () => store.FILE_ROLES);
  // 매칭된 파일의 실제 바이트를 필요할 때만 읽어 렌더러로 넘긴다(렌더러에는 경로만 있고 fs 접근 권한이 없음).
  ipcMain.handle('folders:readFile', (event, filePath) => store.readFileBuffer(filePath));
}

module.exports = { registerFoldersIpc };
