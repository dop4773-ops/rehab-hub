// exportSaver.js — 앱에서 파일을 내보낼 때(엑셀·CSV 등) 어디에 저장할지 정하는 순수 로직.
// 기본은 다운로드 폴더, 설정에서 폴더를 바꿀 수 있다. 같은 이름이 있으면 "이름 (1).xlsx"처럼 번호를 붙여 덮어쓰지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');

const settingsFile = (userData) => path.join(userData, 'export-settings.json');
function loadDir(userData) {
  try { const d = JSON.parse(fs.readFileSync(settingsFile(userData), 'utf8')).dir; return typeof d === 'string' ? d : ''; } catch (e) { return ''; }
}
function saveDir(userData, dir) { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(settingsFile(userData), JSON.stringify({ dir: dir || '' }, null, 2)); }
const isDir = (d) => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } };

// 저장할 폴더: (점검용 환경변수) > 설정에서 고른 폴더(지금도 있을 때) > 다운로드 폴더
function resolveDir(userData, downloads, env = process.env) {
  if (env.REHAB_EXPORT_DIR) return env.REHAB_EXPORT_DIR;
  const d = loadDir(userData);
  return d && isDir(d) ? d : downloads;
}
const safeName = (n) => String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim() || '내보내기';
function uniquePath(dir, name, exists = fs.existsSync) {
  const base = safeName(name), ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
  let p = path.join(dir, base);
  for (let i = 1; exists(p) && i < 1000; i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

module.exports = { settingsFile, loadDir, saveDir, resolveDir, uniquePath, safeName };
