// issuehistory.js — 교차검증 불일치 이력 추적(순수 함수). 저장은 호출하는 쪽(localStorage 등)이 한다.
// 날마다 마지막 검증 결과를 스냅샷으로 남기고, 새 결과를 "이전 날짜의 가장 최근 스냅샷"과 비교해서
//  · 새로 생김 / 계속(며칠째) / 해결됨 을 알려준다. 원본 파일과는 무관하다(검증 결과만 다룸).
// 자료 구성이 다르면(예: 오늘은 PTA 파일이 없음) 그 분류는 비교하지 않는다 — 파일이 빠졌다고 "해결"로 오해하지 않게.
// 브라우저: <script src="../core/issuehistory.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
const normKey = (n) => String(n == null ? '' : n).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g, '').toUpperCase();
// 분류별로 그 분류를 판단하는 데 필요한 파일(전부 있어야 "그 분류를 검사했다"고 본다)
const CAT_SOURCES = {
  count: ['statusBook', 'cards'],
  location: ['cards', 'grids'],
  therapist: ['statusBook', 'cards'],
  handover: ['statusBook', 'cards', 'handover'],
  eval: ['statusBook'],
  room: ['statusBook', 'cards', 'ptaBook'],
};
const CATS = Object.keys(CAT_SOURCES);
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// 불일치 하나를 실행이 바뀌어도 같은 값으로 알아볼 수 있는 키로 만든다(숫자는 빼서 "현황 3→4회"처럼 변해도 같은 건으로 본다)
function issueKey(i) {
  const d = i.detail || {};
  return [i.category, i.source || i.field || '', d.kind || '', normKey(i.patient), String(i.title || '').replace(/\d+/g, '#'), i.time || d.time || '', d.loc || d.type || d.sheet || d.field || '', d.day || ''].join('|');
}
function keyIssues(issues) {
  const seen = new Map(), out = [];
  for (const i of issues) { let k = issueKey(i); const n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n > 1) k += '#' + n; out.push([k, i]); }
  return out;
}
// sources: {statusBook:bool, cards:bool, grids:bool, handover:bool, ptaBook:bool}
function evaluatedCats(sources) { return CATS.filter(c => CAT_SOURCES[c].every(s => sources[s])); }

// whoOf(issue)가 있으면 그 불일치를 고치거나 작성해야 할 사람들(배열)을 7번째 칸에 함께 남긴다 — "담당자별 반복" 요약용(비교 로직은 이 칸을 쓰지 않는다)
function makeSnapshot(issues, sources, now = Date.now(), whoOf = null) {
  const keys = {}, counts = {};
  for (const [k, i] of keyIssues(issues)) { keys[k] = [i.category, i.title || '', i.patient || '', i.room || '', i.floor || '', i.line || '', (whoOf && whoOf(i)) || []]; counts[i.category] = (counts[i.category] || 0) + 1; }
  return { day: dayOf(now), t: now, cats: evaluatedCats(sources), counts, keys };
}
// 같은 날짜 스냅샷은 마지막 것으로 바꿔 끼우고, 오래된 것은 maxDays개만 남긴다
function addSnapshot(history, snap, maxDays = 90) {
  const snaps = (history && history.snaps ? history.snaps : []).filter(s => s.day !== snap.day).concat(snap).sort((a, b) => a.day.localeCompare(b.day));
  return { v: 1, snaps: snaps.slice(-maxDays) };
}
// 오늘 스냅샷을 만들기 전에(=아직 history에 오늘 것이 없거나, 있어도 무시하고) 이전 날짜의 가장 최근 것과 비교한다.
function compare(history, snap) {
  const prior = ((history && history.snaps) || []).filter(s => s.day < snap.day);
  const base = prior[prior.length - 1] || null;
  const res = { baseline: base && { day: base.day, t: base.t }, comparable: [], skipped: [], isNew: new Set(), resolved: [], streak: new Map(), changed: new Set() };
  if (!base) return res;
  res.comparable = snap.cats.filter(c => base.cats.includes(c));
  res.skipped = CATS.filter(c => snap.cats.includes(c) !== base.cats.includes(c)); // 한쪽에서만 검사한 분류(자료 구성이 달랐음)
  for (const [k, v] of Object.entries(snap.keys)) {
    if (!res.comparable.includes(v[0])) continue;
    if (!base.keys[k]) res.isNew.add(k); else if (base.keys[k][5] !== v[5]) res.changed.add(k);
  }
  for (const [k, v] of Object.entries(base.keys)) if (res.comparable.includes(v[0]) && !snap.keys[k]) res.resolved.push({ key: k, cat: v[0], title: v[1], patient: v[2], room: v[3], floor: v[4], line: v[5] });
  // 연속 일수: 그 분류를 검사한 스냅샷만 보며, 마지막으로 "없었던" 검사 다음 날부터 오늘까지(달력 일수)
  const all = prior.concat(snap);
  for (const k of Object.keys(snap.keys)) {
    const cat = snap.keys[k][0]; let first = snap.day;
    for (let n = all.length - 2; n >= 0; n--) {
      const s = all[n]; if (!s.cats.includes(cat)) continue;
      if (s.keys[k]) first = s.day; else break;
    }
    res.streak.set(k, dayDiff(first, snap.day) + 1);
  }
  return res;
}
// 최근 N일(오늘 포함) 스냅샷에서 담당자별로: 서로 다른 불일치 수, 이틀 이상 이어서가 아니라 "서로 다른 3일 이상 나온" 반복 수, 분류별 수.
// 담당자 칸이 없는 옛 스냅샷은 건너뛴다. 반환: [{who, issues, repeated, days, cats}] — 반복 많은 순.
function summarizeByWho(history, { days = 30, today = dayOf(Date.now()) } = {}) {
  const snaps = ((history && history.snaps) || []).filter(s => dayDiff(s.day, today) < days && s.day <= today);
  const by = new Map();
  for (const s of snaps) for (const [k, v] of Object.entries(s.keys)) {
    for (const w of (Array.isArray(v[6]) ? v[6] : [])) {
      if (!by.has(w)) by.set(w, new Map()); const m = by.get(w); if (!m.has(k)) m.set(k, { cat: v[0], days: new Set() }); m.get(k).days.add(s.day);
    }
  }
  return [...by.entries()].map(([who, m]) => {
    const cats = {}, allDays = new Set(); let repeated = 0;
    for (const x of m.values()) { cats[x.cat] = (cats[x.cat] || 0) + 1; if (x.days.size >= 3) repeated++; x.days.forEach(d => allDays.add(d)); }
    return { who, issues: m.size, repeated, days: allDays.size, cats };
  }).sort((a, b) => b.repeated - a.repeated || b.issues - a.issues || a.who.localeCompare(b.who, 'ko'));
}
// 확인함 표시는 그 불일치가 해결되면(검사한 분류에서 사라지면) 자동으로 지운다
function pruneAck(ack, snap) {
  const out = {};
  for (const [k, v] of Object.entries(ack || {})) { const cat = k.split('|')[0]; if (!snap.cats.includes(cat) || snap.keys[k]) out[k] = v; }
  return out;
}
const api = { issueKey, keyIssues, evaluatedCats, makeSnapshot, addSnapshot, compareIssueHistory: compare, summarizeByWho, pruneAck, ISSUE_HISTORY_CATS: CATS };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
