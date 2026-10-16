// itdaEvents.js — 잇다(itda)의 일정 중 카테고리가 "그랜드라운딩"인 것(오늘 이후)을 읽기 전용으로 가져온다.
// electron 모듈에 의존하지 않는다(경로는 itdaBridge.js가 넘겨줌). 잇다 DB에는 아무것도 쓰지 않는다(readonly 연결).
'use strict';
const fs = require('fs');

const CATEGORY = '그랜드라운딩';
// 병동 짝 → 그랜드라운딩 화면의 회차: 8·9병동=1회차, 5·7병동=2회차
const ROUTE_OF_WARDS = { '8,9': 'round1', '5,7': 'round2' };

// 제목·장소에서 RM과 병동을 뽑는다. 예: "RM7(5,7병동)", "그랜드라운딩(RM9_8,9병동)", "그랜드라운딩(RM9/5,7층)"
function parseGrandTitle(title, location) {
  const rmM = /RM\s*(\d+)/i.exec(String(title || ''));
  const pair = (s) => { const m = /(\d)\s*[,·ㆍ]\s*(\d)/.exec(String(s || '')); return m ? [m[1], m[2]].sort().join(',') : null; };
  const wards = pair(title) || pair(location);
  return { rm: rmM ? 'RM' + rmM[1] : null, wards, route: (wards && ROUTE_OF_WARDS[wards]) || null };
}

// today: 'YYYY-MM-DD'(이 날짜 포함, 이전 일정은 가져오지 않음)
function readGrandEvents(dbPath, today, limit = 40, category = CATEGORY) {
  if (!fs.existsSync(dbPath)) return { ok: false, message: '잇다가 설치되어 있지 않거나 아직 한 번도 실행되지 않았습니다.' };
  const Database = require('better-sqlite3');
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 3000');
    const rows = db.prepare(`SELECT e.id, e.title, e.location, substr(e.start_at,1,10) AS date
      FROM events e JOIN categories c ON c.id = e.category_id
      WHERE c.name = ? AND e.deleted_at IS NULL AND substr(e.start_at,1,10) >= ?
      ORDER BY e.start_at LIMIT ?`).all(String(category || CATEGORY), today, limit);
    return { ok: true, events: rows.map(r => ({ id: r.id, title: r.title, date: r.date, ...parseGrandTitle(r.title, r.location) })) };
  } catch (err) {
    return { ok: false, message: `잇다 일정을 읽지 못했습니다: ${err.message}` };
  } finally {
    if (db) db.close();
  }
}

// 구글캘린더(잇다가 가져온 것)의 부재 일정 제목 "정유정T연차" · "박란영T 오후반차" · "성지현T휴가" → {name, label, half}. 선생님 일정이 아니면(예: "3팀") null.
function parseLeaveTitle(title) {
  const m = /^\s*([가-힣A-Za-z]{2,6}?)\s*T\s*(.*?)\s*$/.exec(String(title || ''));
  if (!m) return null;
  const label = m[2] || '부재';
  return { name: m[1], label, half: /오전/.test(label) ? 'AM' : /오후/.test(label) ? 'PM' : '' };
}
// 잇다 "평가" 카테고리 제목 "이정홍,최병권,김순자E COSAS" → {names, test}
function parseEvalTitle(title) {
  const m = /^\s*(\S+)\s*(.*?)\s*$/.exec(String(title || ''));
  return m ? { names: m[1].split(/[,，]/).map(x => x.trim()).filter(Boolean), test: m[2] } : { names: [], test: '' };
}

// 홈 현황판용(읽기 전용): from~to 사이의 부재(구글캘린더 연차·휴가·반차)와 evalTo까지의 평가 예정
function readHomeInfo(dbPath, from, to, evalTo) {
  if (!fs.existsSync(dbPath)) return { ok: false, message: '잇다가 설치되어 있지 않거나 아직 한 번도 실행되지 않았습니다.' };
  const Database = require('better-sqlite3');
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 3000');
    let leaves = [], leaveError = '';
    try {
      const rows = db.prepare(`SELECT title, substr(start_at,1,10) AS s, substr(end_at,1,10) AS e, substr(end_at,12,8) AS et
        FROM google_calendar_events WHERE substr(start_at,1,10) <= ? AND substr(end_at,1,10) >= ? ORDER BY start_at`).all(to, from);
      const seen = new Set();
      for (const r of rows) {
        const p = parseLeaveTitle(r.title); if (!p) continue;
        const end = r.et === '00:00:00' && r.e > r.s ? new Date(new Date(r.e + 'T00:00:00').getTime() - 864e5).toLocaleDateString('sv-SE') : r.e; // 종일 일정의 끝이 다음날 0시인 경우
        const key = `${p.name}|${p.label}|${r.s}`; if (seen.has(key)) continue; seen.add(key);
        leaves.push({ ...p, from: r.s, to: end });
      }
    } catch (e) { leaveError = '구글캘린더 일정을 읽지 못했어요(잇다에서 캘린더 연동이 되어 있는지 확인).'; }
    const evals = db.prepare(`SELECT e.id, e.title, substr(e.start_at,1,10) AS date FROM events e JOIN categories c ON c.id = e.category_id
      WHERE c.name = '평가' AND e.deleted_at IS NULL AND substr(e.start_at,1,10) >= ? AND substr(e.start_at,1,10) <= ? ORDER BY e.start_at LIMIT 30`)
      .all(from, evalTo || to).map(r => ({ id: r.id, date: r.date, ...parseEvalTitle(r.title) }));
    return { ok: true, leaves, leaveError, evals };
  } catch (err) {
    return { ok: false, message: `잇다 일정을 읽지 못했습니다: ${err.message}` };
  } finally {
    if (db) db.close();
  }
}

module.exports = { parseGrandTitle, readGrandEvents, parseLeaveTitle, parseEvalTitle, readHomeInfo, CATEGORY };
