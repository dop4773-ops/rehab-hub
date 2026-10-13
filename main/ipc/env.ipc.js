// env.ipc.js — 렌더러(window.rehab.env.check)가 "환경 점검" 재료를 요청하는 창구(읽기만).
'use strict';
const os = require('os');
const fs = require('fs');
const { app, ipcMain } = require('electron');
const store = require('../folderStore');
const { collectFiles } = require('../scan');
const { resolveDir } = require('../exportSaver');
const { probeFile, probeDirWritable } = require('../envCheck');
const { oneDriveRunning } = require('./sync.ipc');

function folderInfo(f) {
  try { return { label: f.label, dirPath: f.dirPath, exists: true, xlsx: collectFiles(f.dirPath).length, error: '' }; }
  catch (e) { return { label: f.label, dirPath: f.dirPath, exists: fs.existsSync(f.dirPath), xlsx: 0, error: String(e.message || e) }; }
}
function registerEnvIpc() {
  // files: [{role, path}] — 화면이 이미 알고 있는 인식된 파일들(엑셀만 열어 본다)
  ipcMain.handle('env:check', async (event, files) => {
    const list = (Array.isArray(files) ? files : []).filter(f => f && typeof f.path === 'string').slice(0, 40);
    const probes = [];
    for (const f of list) probes.push({ role: f.role, path: f.path, ...(await probeFile(f.path)) });
    return {
      platform: process.platform, arch: process.arch, release: os.release(),
      app: app.getVersion(), electron: process.versions.electron,
      dataDir: await probeDirWritable(app.getPath('userData')),
      exportDir: await probeDirWritable(resolveDir(app.getPath('userData'), app.getPath('downloads'))),
      folders: store.listFolders().map(folderInfo),
      files: probes,
      oneDriveRunning: await oneDriveRunning(),
    };
  });
}
module.exports = { registerEnvIpc };
