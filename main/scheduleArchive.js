// scheduleArchive.js — 그랜드라운딩의 "보관함": 날짜+RM 단위 환자 스냅샷을 JSON 파일로 저장해두고,
// 목록에서 항목별로 바로 Excel 추출할 수 있게 한다(팀별/언어 등 실제 추출 로직은 렌더러가 재사용).
// electron에 의존하지 않는 순수 함수라 plain Node로 테스트 가능(storeDir을 인자로 받음 — 실제 userData
// 경로는 main/ipc/schedules.ipc.js에서 계산해 넘긴다. scan.js/fileRoles.js와 같은 패턴).
'use strict';
const fs = require('fs');
const path = require('path');

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function slugRm(rm) {
  return String(rm || 'ALL').replace(/[\\/:*?"<>|\s]+/g, '_');
}
function entryId(dateKey, rm) {
  return `${dateKey}__${slugRm(rm)}`;
}
function fileFor(storeDir, id) {
  return path.join(storeDir, `${id}.json`);
}

// entry: { dateKey, rm, ward, day, hour, routeKey, patients, issues }
function saveSchedule(storeDir, entry) {
  const { dateKey, rm, patients } = entry || {};
  if (!DATE_KEY_RE.test(dateKey)) throw new Error('날짜 형식이 올바르지 않습니다(YYYY-MM-DD).');
  if (!rm) throw new Error('RM이 지정되지 않았습니다.');
  if (!Array.isArray(patients)) throw new Error('환자 목록이 올바르지 않습니다.');
  const id = entryId(dateKey, rm);
  const data = {
    id, dateKey, rm, ward: entry.ward || '', day: entry.day || '', hour: entry.hour || '',
    routeKey: entry.routeKey || 'round1', savedAt: Date.now(), count: patients.length,
    patients, issues: entry.issues || { unmatched: [], notWritten: [] },
  };
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(fileFor(storeDir, id), JSON.stringify(data));
  return { id, dateKey, rm, ward: data.ward, count: data.count, savedAt: data.savedAt, issues: data.issues };
}

function listSchedules(storeDir) {
  let names;
  try { names = fs.readdirSync(storeDir); } catch (e) { return []; }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(storeDir, name), 'utf8'));
      if (!raw.id || !DATE_KEY_RE.test(raw.dateKey)) continue;
      out.push({
        id: raw.id, dateKey: raw.dateKey, rm: raw.rm, ward: raw.ward || '',
        count: raw.count, savedAt: raw.savedAt, issues: raw.issues || { unmatched: [], notWritten: [] },
      });
    } catch (e) { /* 손상된 파일은 목록에서 건너뛴다 */ }
  }
  return out.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || (b.savedAt - a.savedAt));
}

// ids에 해당하는 스냅샷 전체(환자 목록 포함)를 반환한다 — 항목별 Excel 추출에 사용.
function loadSchedules(storeDir, ids) {
  const out = [];
  for (const id of ids || []) {
    try {
      const raw = JSON.parse(fs.readFileSync(fileFor(storeDir, id), 'utf8'));
      out.push(raw);
    } catch (e) { /* 없거나 손상된 항목은 건너뛴다 */ }
  }
  return out;
}

function deleteSchedule(storeDir, id) {
  try { fs.unlinkSync(fileFor(storeDir, id)); } catch (e) { /* 이미 없으면 조용히 무시 */ }
}

module.exports = { saveSchedule, listSchedules, loadSchedules, deleteSchedule, entryId };
