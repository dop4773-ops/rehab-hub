// backup.ipc.js — 렌더러(window.rehab.backup.*)가 백업 상태를 읽는 창구. 백업은 PowerShell이 하고, 여기서는 읽기만 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { buildStatus } = require('../backupStatus');

const DEFAULT_LOG = 'C:\\OneDriveBackup\\backup.log'; // OneDrive_Backup.ps1 의 $LogFile 과 같다
const configPath = () => path.join(app.getPath('userData'), 'backup.json');
function loadConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (e) { return {}; } }
const logPath = () => loadConfig().logPath || DEFAULT_LOG;
// 스크립트는 로그와 같은 폴더(C:\OneDriveBackup)에 있다 — StartOneDriveBackup.vbs 가 그 경로를 실행한다.
const scriptPath = () => path.join(path.dirname(logPath()), 'OneDrive_Backup.ps1');

// 끊어진 네트워크/구글 드라이브 경로에서 오래 멈추지 않게 시간 제한을 둔다.
const withTimeout = (p, ms = 3000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function readIf(file) { try { return await fs.promises.readFile(file, 'utf8'); } catch (e) { return null; } }

async function scanFolders(script) {
  const out = { schedule: null, realtime: null };
  if (script && script.scheduleRoot) {
    try {
      const names = (await withTimeout(fs.promises.readdir(script.scheduleRoot, { withFileTypes: true }))).filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map(d => d.name).sort();
      const dates = [];
      for (const n of names.slice(-10)) {
        let runs = 0; try { runs = (await withTimeout(fs.promises.readdir(path.join(script.scheduleRoot, n)))).length; } catch (e) { /* 세지 못해도 날짜는 보여준다 */ }
        dates.push({ name: n, runs });
      }
      out.schedule = { exists: true, count: names.length, dates };
    } catch (e) { out.schedule = { exists: false }; }
  }
  if (script && script.realtimeRoot) {
    try { const st = await withTimeout(fs.promises.stat(script.realtimeRoot)); out.realtime = { exists: true, mtimeMs: st.mtimeMs }; }
    catch (e) { out.realtime = { exists: false }; }
  }
  return out;
}

async function getStatus() {
  const lp = logPath();
  const logText = await readIf(lp);
  const scriptText = await readIf(scriptPath());
  let logSize = 0; try { logSize = (await fs.promises.stat(lp)).size; } catch (e) { /* 로그 없음 */ }
  const base = { logPath: lp, scriptPath: scriptPath(), logFound: logText != null, scriptFound: scriptText != null, logSize, now: Date.now() };
  if (logText == null) return { ...base, level: 'unknown', title: '백업 로그를 찾지 못했어요', detail: `${lp} 파일이 없어요. 이 PC에서 백업 프로그램이 한 번도 실행되지 않았거나 로그 위치가 달라요(아래 "로그 위치 바꾸기").` };
  const status = buildStatus({ logText, scriptText, now: base.now });
  return { ...base, ...status, folders: await scanFolders(status.script) };
}

function registerBackupIpc() {
  ipcMain.handle('backup:status', () => getStatus());
  ipcMain.handle('backup:chooseLog', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'backup.log 위치 선택', properties: ['openFile'], filters: [{ name: '로그', extensions: ['log', 'txt'] }] });
    if (canceled || !filePaths[0]) return null;
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ ...loadConfig(), logPath: filePaths[0] }, null, 2));
    return filePaths[0];
  });
  ipcMain.handle('backup:resetLog', () => { const c = loadConfig(); delete c.logPath; fs.writeFileSync(configPath(), JSON.stringify(c, null, 2)); return DEFAULT_LOG; });
  // 정해진 대상(로그/예약 폴더/실시간 폴더)만 열 수 있다 — 렌더러가 임의 경로를 열게 하지 않는다.
  ipcMain.handle('backup:open', async (event, kind) => {
    if (kind === 'log') { shell.showItemInFolder(logPath()); return true; }
    const text = await readIf(scriptPath()); if (text == null) return false;
    const sc = require('../backupStatus').parseScript(text);
    const target = kind === 'schedule' ? sc.scheduleRoot : kind === 'realtime' ? sc.realtimeRoot : null;
    if (!target) return false;
    return (await shell.openPath(target)) === '';
  });
}

module.exports = { registerBackupIpc, getStatus };
