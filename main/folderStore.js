// folderStore.js — 등록된 폴더 목록을 JSON 파일로 저장하고 관리한다. 실제 파일 매칭 로직은 scan.js.
// 브라우저판(core/folder_registry.js)의 File System Access API + IndexedDB 대신
// Electron 네이티브 API(dialog.showOpenDialog + fs)를 쓴다 — 권한 프롬프트가 없어 훨씬 안정적이다.
'use strict';
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { FILE_ROLES, guessFileRole } = require('./fileRoles');
const { scanFolders } = require('./scan');

function storePath() {
  return path.join(app.getPath('userData'), 'folders.json');
}

function loadFolders() {
  try { return JSON.parse(fs.readFileSync(storePath(), 'utf8')); }
  catch (e) { return []; }
}

function saveFolders(folders) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(folders, null, 2));
}

async function chooseFolder(win, label) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '자동으로 불러올 폴더 선택',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return null;
  const folders = loadFolders();
  const entry = { id: `${Date.now()}`, label: label || path.basename(filePaths[0]), dirPath: filePaths[0] };
  folders.push(entry);
  saveFolders(folders);
  return entry;
}

function listFolders() { return loadFolders(); }

function removeFolder(id) {
  saveFolders(loadFolders().filter(f => f.id !== id));
}

function scanAll() {
  return scanFolders(loadFolders());
}

// Uint8Array로 반환한다 — Buffer는 IPC(구조화 복제)로 안전하게 전달된다는 보장이 없어서(TypedArray는 됨).
function readFileBuffer(filePath) {
  return new Uint8Array(fs.readFileSync(filePath));
}

module.exports = { FILE_ROLES, guessFileRole, chooseFolder, listFolders, removeFolder, scanAll, readFileBuffer };
