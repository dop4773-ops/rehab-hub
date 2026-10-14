// state.ipc.js — 중요 기록 사본의 읽기(시작할 때 동기)·쓰기(비동기, 보내고 잊기). 렌더러는 window.rehab.state.* 로만 접근한다.
'use strict';
const { app, ipcMain } = require('electron');
const store = require('../stateBackup');
function registerStateIpc() {
  ipcMain.on('state:loadSync', (event) => { event.returnValue = store.load(app.getPath('userData')); }); // 셸이 설정을 읽기 전에 저장소를 되살릴 수 있게 동기
  ipcMain.on('state:save', (event, data) => { store.save(app.getPath('userData'), data); });
}
module.exports = { registerStateIpc };
