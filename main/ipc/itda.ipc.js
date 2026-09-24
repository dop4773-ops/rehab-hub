// itda.ipc.js — 렌더러(window.rehab.itda.*)가 잇다 Inbox로 보내기를 요청하는 창구.
'use strict';
const { ipcMain } = require('electron');
const bridge = require('../itdaBridge');

function registerItdaIpc() {
  ipcMain.handle('itda:installed', () => bridge.itdaInstalled());
  ipcMain.handle('itda:pushInboxItem', (event, content) => bridge.pushInboxItem(content));
}

module.exports = { registerItdaIpc };
