// scan.js — 폴더 목록을 훑어 역할별로 파일을 매칭한다. fs/path만 쓰므로 plain Node로 테스트 가능.
'use strict';
const fs = require('fs');
const path = require('path');
const { FILE_ROLES, guessFileRole, isCurrentMonthStats } = require('./fileRoles');

const MULTI_ROLES = new Set(FILE_ROLES.filter(r => r.multi).map(r => r.key));

// "2024", "2025년 일일통계" 같은 연도별 보관 폴더 — 내려가지 않는다(치료기록 QA의 일일통계 규칙과 동일).
function isArchiveFolderName(name) { return /^\d{4}/.test(name) || /년/.test(name); }

// 폴더 하나(와 하위 폴더 2단계까지 — 예: 일일통계/1팀/파일)에서 xlsx/xlsm 파일을 모두 모은다.
function collectFiles(dirPath, depth = 2) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch (e) { throw new Error(`폴더를 읽을 수 없습니다: ${e.message}`); }
  for (const entry of entries) {
    if (entry.name.startsWith('~$')) continue; // 엑셀이 열려 있을 때 생기는 임시 잠금 파일
    const full = path.join(dirPath, entry.name);
    if (entry.isFile() && /\.(xlsx|xlsm)$/i.test(entry.name)) out.push(full);
    else if (entry.isDirectory() && depth > 0 && !isArchiveFolderName(entry.name)) out = out.concat(collectFiles(full, depth - 1));
  }
  return out;
}

// folders: [{id,label,dirPath}]. 같은 역할에 파일이 여러 개면 수정일이 더 최근인 것을 쓴다.
// 단 multi 역할(일일통계)은 이번 달 파일 전부를 matchedAll에 모은다(matched에는 대표로 가장 최근 1개).
function scanFolders(folders, { now = new Date() } = {}) {
  const matched = {}, matchedAll = {}, unmatched = [], errors = [];
  for (const f of folders) {
    let files;
    try { files = collectFiles(f.dirPath); }
    catch (e) { errors.push({ folder: f.label, error: e.message }); continue; }
    for (const full of files) {
      const name = path.basename(full);
      const role = guessFileRole(name);
      if (!role) { unmatched.push({ folder: f.label, name }); continue; }
      if (role === 'dailyStats' && !isCurrentMonthStats(name, now)) continue; // 다른 달 일일통계는 조용히 건너뜀
      const stat = fs.statSync(full);
      const entry = { path: full, name, folder: f.label, mtimeMs: stat.mtimeMs, size: stat.size };
      if (MULTI_ROLES.has(role)) {
        (matchedAll[role] = matchedAll[role] || []);
        if (!matchedAll[role].some(e => e.name === name)) matchedAll[role].push(entry); // 같은 이름이면 먼저 찾은(얕은) 쪽
      }
      if (!matched[role] || stat.mtimeMs > matched[role].mtimeMs) matched[role] = entry;
    }
  }
  return { matched, matchedAll, unmatched, errors, folders: folders.map(f => f.label) };
}

// 사용자가 역할별로 직접 골라둔 파일(manual: {role: [경로...]})을 스캔 결과에 덮어쓴다 — 폴더 매칭보다 우선.
// 직접 고른 파일이 사라졌으면 그 역할은 폴더에서 찾은 결과를 그대로 쓰고 errors에 알린다.
function applyManualFiles(result, manual) {
  result.manualRoles = [];
  for (const [role, paths] of Object.entries(manual || {})) {
    const entries = [];
    for (const p of paths) {
      try {
        const st = fs.statSync(p);
        entries.push({ path: p, name: path.basename(p), folder: '직접 선택', mtimeMs: st.mtimeMs, size: st.size, manual: true });
      } catch (e) {
        result.errors.push({ folder: '직접 선택', error: `${role}: 파일을 찾을 수 없습니다(${p})` });
      }
    }
    if (!entries.length) continue;
    result.manualRoles.push(role);
    result.matched[role] = entries.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a));
    if (MULTI_ROLES.has(role)) result.matchedAll[role] = entries;
  }
  return result;
}

module.exports = { collectFiles, scanFolders, applyManualFiles, MULTI_ROLES };
