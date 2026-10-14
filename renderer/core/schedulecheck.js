// schedulecheck.js — 날마다 사람이 복사해서 만드는 시간표 파일(물리치료·기구·작업치료실 시간표)의 관리 상태를 점검하는 순수 함수(파일·화면 접근 없음).
// ① 오늘 날짜 시트가 있는지 ② 오늘 시트의 제목에 적힌 날짜가 낡은 날짜로 남아 있지 않은지 ③ 로봇재활 표의 종료일이 임박했는지/지났는지.
// 격자는 g = { get(r,c)→글자(1부터), maxRow, maxCol }. 브라우저: <script src="core/schedulecheck.js"> → RehabCore.scheduleCheck / Node: require()
'use strict';
(function (root) {
const compact = (s) => String(s == null ? '' : s).replace(/\s+/g, '');
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 글자 속 "10월 15일" → {m, d} (없으면 null). "2026년 월 일 요일"처럼 숫자가 비어 있으면 null — 아직 안 적은 것이지 낡은 게 아니다.
function titleDate(text) { const m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(String(text || '')); return m ? { m: +m[1], d: +m[2] } : null; }
// 엑셀 일련번호(46155) → 'YYYY-MM-DD'
function excelDate(serial) { const n = Number(serial); if (!Number.isFinite(n) || n < 30000 || n > 80000) return ''; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// files: [{label, sheetNames:[…], titlesBySheet:{시트이름: ['제목 글자', …]}}] · today: 'YYYY-MM-DD' · hour: 0~23 · sheetsForDate: dailyplan의 같은 이름 함수(시트 이름으로 날짜 찾기)
// → [{level:'warn', file, kind:'nosheet'|'stale-title', text}]
function checkSheets({ files, today, hour = 12, sheetsForDate }) {
  const out = [], dow = new Date(today + 'T00:00:00').getDay(), weekday = dow >= 1 && dow <= 5, [, , tm, td] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today) || [];
  for (const f of files || []) {
    const names = sheetsForDate(f.sheetNames || [], today);
    if (!names.length) { if (weekday && hour >= 9) out.push({ level: 'warn', file: f.label, kind: 'nosheet', text: `${f.label}에 오늘(${+tm}/${+td}) 날짜 시트가 없어요 — 시트를 안 만들었으면 오늘 시간표 기준 검사가 어긋나요(공휴일이면 무시)` }); continue; }
    for (const n of names) for (const t of (f.titlesBySheet && f.titlesBySheet[n]) || []) {
      const d = titleDate(t); if (!d || (d.m === +tm && d.d === +td)) continue;
      out.push({ level: 'warn', file: f.label, kind: 'stale-title', text: `${f.label} ${n} 시트 제목에 ${d.m}월 ${d.d}일이 그대로 남아 있어요(「${compact(t).slice(0, 24)}」) — 오늘은 ${+tm}월 ${+td}일` });
    }
  }
  return out;
}

// 로봇재활 표: 머리글 줄에 "성함"과 "종료일"(그리고 "시작일")이 있고, 그 아래 줄들에 이름과 엑셀 날짜(일련번호)가 있다. 같은 시트에 표가 둘(대기 명단 / 대상자)일 수 있어 머리글마다 읽는다.
function parseRobot(g) {
  const rows = [];
  for (let r = 1; r <= g.maxRow; r++) for (let c = 1; c <= g.maxCol; c++) {
    if (compact(g.get(r, c)) !== '성함') continue;
    let cs = 0, ce = 0; for (let k = c + 1; k <= Math.min(g.maxCol, c + 8); k++) { const h = compact(g.get(r, k)); if (h === '시작일') cs = k; if (h === '종료일') ce = k; }
    if (!ce) continue;
    let dc = false; for (let a = Math.max(1, r - 3); a < r && !dc; a++) for (let b = Math.max(1, c - 1); b <= Math.min(g.maxCol, c + 3); b++) if (/D\/?C/i.test(compact(g.get(a, b)))) { dc = true; break; } // 「로봇 재활 D/C」 표는 이미 끝난 사람들이라 건너뜀
    if (dc) continue;
    for (let q = r + 1; q <= g.maxRow; q++) {
      const name = compact(g.get(q, c)); if (!name) break;
      if (/로봇|담당주치의|성함|D\/C/.test(name)) break;
      rows.push({ name: name.replace(/\(.*?\)|\d+병동|3F$/g, '').replace(/[^가-힣A-Z]/g, ''), start: cs ? excelDate(g.get(q, cs)) : '', end: excelDate(g.get(q, ce)) });
    }
  }
  return rows.filter(x => x.name && x.end);
}
// 오늘 기준 종료가 withinDays일 안이거나 이미 지난 사람. 종료일이 시작일보다 빠르면(입력 실수·자리표시) 건너뛴다.
function robotAlerts(rows, today, withinDays = 3) {
  return (rows || []).filter(x => !(x.start && x.end < x.start)).map(x => ({ ...x, left: dayDiff(today, x.end) })).filter(x => x.left <= withinDays).sort((a, b) => a.left - b.left || a.name.localeCompare(b.name, 'ko'));
}
const api = { titleDate, excelDate, checkSheets, parseRobot, robotAlerts, ymdOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { scheduleCheck: api });
})(typeof window !== 'undefined' ? window : globalThis);
