// schedules.ipc.js — 렌더러(window.rehab.schedules.*)가 그랜드라운딩 일정 보관함을 쓰는 창구.
'use strict';
const path = require('path');
const { app, ipcMain } = require('electron');
const store = require('../scheduleArchive');

function storeDir() {
  return path.join(app.getPath('userData'), 'schedules');
}

function registerSchedulesIpc() {
  ipcMain.handle('schedules:save', (event, dateKey, patients) => store.saveSchedule(storeDir(), dateKey, patients));
  ipcMain.handle('schedules:list', () => store.listSchedules(storeDir()));
  ipcMain.handle('schedules:load', (event, dateKeys) => store.loadSchedules(storeDir(), dateKeys));
  ipcMain.handle('schedules:delete', (event, dateKey) => { store.deleteSchedule(storeDir(), dateKey); return store.listSchedules(storeDir()); });
}

module.exports = { registerSchedulesIpc };
