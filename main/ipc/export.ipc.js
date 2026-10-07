// export.ipc.js — 앱에서 내려받는(내보내는) 파일을 정해진 폴더에 바로 저장하고, 저장이 끝나면 화면에 알린다.
// 화면의 "열기 / 폴더 보기" 버튼은 이 앱이 방금 저장한 파일 경로만 열 수 있다(임의 경로 열기 방지).
'use strict';
const fs = require('fs');
const path = require('path');
const { app, ipcMain, dialog, shell, session, BrowserWindow } = require('electron');
const { loadDir, saveDir, resolveDir, uniquePath } = require('../exportSaver');

function registerExportIpc(getMainWindow) {
  const userData = () => app.getPath('userData'), downloads = () => app.getPath('downloads');
  const saved = []; // 최근 저장한 파일 경로(최대 30개)
  const state = () => ({ dir: resolveDir(userData(), downloads()), custom: !!loadDir(userData()) && resolveDir(userData(), downloads()) !== downloads(), defaultDir: downloads() });
  const send = (channel, payload) => { const w = getMainWindow(); if (w && !w.isDestroyed()) w.webContents.send(channel, payload); };

  session.defaultSession.on('will-download', (event, item) => {
    let dir = resolveDir(userData(), downloads());
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { dir = downloads(); }
    const file = uniquePath(dir, item.getFilename());
    item.setSavePath(file);
    item.once('done', (e, result) => {
      if (result === 'completed') { saved.push(file); if (saved.length > 30) saved.shift(); send('export:saved', { name: path.basename(file), path: file, dir: path.dirname(file) }); }
      else send('export:failed', { name: path.basename(file), reason: result });
    });
  });

  ipcMain.handle('export:getDir', () => state());
  ipcMain.handle('export:chooseDir', async () => {
    const win = getMainWindow() || BrowserWindow.getFocusedWindow();
    const r = await dialog.showOpenDialog(win, { title: '파일 저장 위치 선택', defaultPath: state().dir, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return state();
    saveDir(userData(), r.filePaths[0]); return state();
  });
  ipcMain.handle('export:resetDir', () => { saveDir(userData(), ''); return state(); });
  ipcMain.handle('export:openDir', () => { const d = state().dir; try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* 열기만 시도 */ } return shell.openPath(d); });
  ipcMain.handle('export:openFile', (event, file) => (saved.includes(file) ? shell.openPath(file) : 'not-saved-by-app'));
  ipcMain.handle('export:showInFolder', (event, file) => { if (!saved.includes(file)) return false; shell.showItemInFolder(file); return true; });
}

module.exports = { registerExportIpc };
