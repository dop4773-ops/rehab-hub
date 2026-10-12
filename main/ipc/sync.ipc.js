// sync.ipc.js — 렌더러(window.rehab.sync.*)가 OneDrive 프로그램이 켜져 있는지 묻는 창구(읽기만). Windows에서만 확인하고, 모르면 null.
'use strict';
const { ipcMain } = require('electron');
const { execFile } = require('child_process');

function oneDriveRunning() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq OneDrive.exe', '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve(null);
      resolve(/OneDrive\.exe/i.test(String(out)));
    });
  });
}
function registerSyncIpc() { ipcMain.handle('sync:oneDriveRunning', () => oneDriveRunning()); }
module.exports = { registerSyncIpc };
