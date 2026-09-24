// scheduleArchive.js — 그랜드라운딩의 "일정 보관함": 날짜별 환자 스냅샷(allPatients)을 JSON 파일로 저장해두고,
// 나중에 여러 날짜를 한꺼번에 불러와 팀별/언어치료 등으로 일괄 추출할 수 있게 한다.
// electron에 의존하지 않는 순수 함수라 plain Node로 테스트 가능(storeDir을 인자로 받음 — 실제 userData
// 경로는 main/ipc/schedules.ipc.js에서 계산해 넘긴다. scan.js/fileRoles.js와 같은 패턴).
'use strict';
const fs = require('fs');
const path = require('path');

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function fileFor(storeDir, dateKey) {
  return path.join(storeDir, `${dateKey}.json`);
}

function saveSchedule(storeDir, dateKey, patients) {
  if (!DATE_KEY_RE.test(dateKey)) throw new Error('날짜 형식이 올바르지 않습니다(YYYY-MM-DD).');
  if (!Array.isArray(patients)) throw new Error('환자 목록이 올바르지 않습니다.');
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(fileFor(storeDir, dateKey), JSON.stringify({ dateKey, savedAt: Date.now(), count: patients.length, patients }));
  return { dateKey, count: patients.length };
}

function listSchedules(storeDir) {
  let names;
  try { names = fs.readdirSync(storeDir); } catch (e) { return []; }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const dateKey = name.slice(0, -5);
    if (!DATE_KEY_RE.test(dateKey)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(fileFor(storeDir, dateKey), 'utf8'));
      out.push({ dateKey, count: raw.count, savedAt: raw.savedAt });
    } catch (e) { /* 손상된 파일은 목록에서 건너뛴다 */ }
  }
  return out.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// dateKeys에 해당하는 스냅샷들을 읽어 {dateKey, patients}[] 로 반환한다(합치기·중복제거는 렌더러 쪽에서).
function loadSchedules(storeDir, dateKeys) {
  const out = [];
  for (const dateKey of dateKeys || []) {
    if (!DATE_KEY_RE.test(dateKey)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(fileFor(storeDir, dateKey), 'utf8'));
      out.push({ dateKey, patients: raw.patients || [] });
    } catch (e) { /* 없거나 손상된 날짜는 건너뛴다 */ }
  }
  return out;
}

function deleteSchedule(storeDir, dateKey) {
  try { fs.unlinkSync(fileFor(storeDir, dateKey)); } catch (e) { /* 이미 없으면 조용히 무시 */ }
}

module.exports = { saveSchedule, listSchedules, loadSchedules, deleteSchedule };
