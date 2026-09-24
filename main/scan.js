// scan.js — 폴더 목록을 훑어 역할별로 파일을 매칭한다. fs/path만 쓰므로 plain Node로 테스트 가능.
'use strict';
const fs = require('fs');
const path = require('path');
const { guessFileRole } = require('./fileRoles');

// 폴더 하나(와 하위 폴더 1단계)에서 xlsx/xlsm 파일을 모두 모은다.
function collectFiles(dirPath, depth = 1) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch (e) { throw new Error(`폴더를 읽을 수 없습니다: ${e.message}`); }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isFile() && /\.(xlsx|xlsm)$/i.test(entry.name)) out.push(full);
    else if (entry.isDirectory() && depth > 0) out = out.concat(collectFiles(full, depth - 1));
  }
  return out;
}

// folders: [{id,label,dirPath}]. 같은 역할에 파일이 여러 개면 수정일이 더 최근인 것을 쓴다.
function scanFolders(folders) {
  const matched = {}, unmatched = [], errors = [];
  for (const f of folders) {
    let files;
    try { files = collectFiles(f.dirPath); }
    catch (e) { errors.push({ folder: f.label, error: e.message }); continue; }
    for (const full of files) {
      const name = path.basename(full);
      const role = guessFileRole(name);
      const stat = fs.statSync(full);
      if (!role) { unmatched.push({ folder: f.label, name }); continue; }
      if (!matched[role] || stat.mtimeMs > matched[role].mtimeMs) {
        matched[role] = { path: full, name, folder: f.label, mtimeMs: stat.mtimeMs };
      }
    }
  }
  return { matched, unmatched, errors, folders: folders.map(f => f.label) };
}

module.exports = { collectFiles, scanFolders };
