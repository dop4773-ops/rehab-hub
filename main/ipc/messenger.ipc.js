// messenger.ipc.js — 렌더러(window.rehab.messenger.*)가 메신저의 외진·외박·외출 명단을 요청하는 창구(읽기 전용).
'use strict';
const { ipcMain, dialog, app, BrowserWindow } = require('electron');
const { findMessengerDbs } = require('../messenger/detect');
const { outingsForDate } = require('../messenger/outings');

function registerMessengerIpc() {
  ipcMain.handle('messenger:detect', () => findMessengerDbs([process.env.APPDATA, process.env.LOCALAPPDATA, process.env.PROGRAMDATA, app.getPath('documents')]));
  ipcMain.handle('messenger:chooseDb', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: '메신저 DB 파일(messenger.db) 선택', properties: ['openFile'],
      filters: [{ name: 'SQLite DB', extensions: ['db'] }, { name: '모든 파일', extensions: ['*'] }],
    });
    return canceled || !filePaths[0] ? null : filePaths[0];
  });
  ipcMain.handle('messenger:outings', (event, dbPath, date) => outingsForDate(String(dbPath || ''), date));
}

module.exports = { registerMessengerIpc };
