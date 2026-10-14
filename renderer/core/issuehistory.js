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
function makeSnapshot(issues, sources, now = Date.now(), whoOf = null, inputs = null) {
  const keys = {}, counts = {};
  for (const [k, i] of keyIssues(issues)) { keys[k] = [i.category, i.title || '', i.patient || '', i.room || '', i.floor || '', i.line || '', (whoOf && whoOf(i)) || []]; counts[i.category] = (counts[i.category] || 0) + 1; }
  return { day: dayOf(now), t: now, cats: evaluatedCats(sources), counts, keys, ...(inputs ? { inputs } : {}) };
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
// 읽어 들인 자료의 규모(환자 줄 수 등)가 최근 며칠과 크게 다르면 알린다 — 파일이 일부만 읽혔거나 엑셀 양식이 바뀌었을 때 검사 결과가 조용히 틀어지는 것을 막으려는 경고.
// 자료 규모가 저장된 이전 스냅샷(최대 lookback일)의 중앙값과 비교한다. 기준이 작으면(5~10 미만) 흔들림이 커서 비교하지 않는다.
const INPUT_LABELS = { statusRows: '현황판 환자 줄', statusActive: '현황판 입원·재입원 환자', cards10: '10F 전체시간표 카드', cards3: '3F 전체시간표 카드', schedOcc: '평일시간표 배정 칸', handover: '인수인계 기록', pta: 'PTA 재원현황 환자' };
const INPUT_UNITS = { statusRows: '줄', statusActive: '명', pta: '명', cards10: '장', cards3: '장', schedOcc: '칸', handover: '건' };
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function detectAnomalies(history, snap, { lookback = 5 } = {}) {
  const prior = ((history && history.snaps) || []).filter(s => s.day < snap.day).slice(-lookback), out = [];
  const withIn = prior.filter(s => s.inputs);
  if (snap.inputs) for (const [k, v] of Object.entries(snap.inputs)) {
    if (typeof v !== 'number') continue;
    const vals = withIn.map(s => s.inputs[k]).filter(x => typeof x === 'number'); if (!vals.length) continue;
    const b = median(vals), label = INPUT_LABELS[k] || k, u = INPUT_UNITS[k] || '개';
    if (b >= 5 && v === 0) out.push({ key: k, kind: 'zero', label, value: v, base: b, text: `${label}이(가) 0${u}예요(평소 ${Math.round(b)}${u}) — 파일을 못 읽었을 수 있어요` });
    else if (b >= 10 && v < b * 0.6) out.push({ key: k, kind: 'drop', label, value: v, base: b, text: `${label} ${v}${u} (평소 ${Math.round(b)}${u}) — 파일이 일부만 읽혔거나 양식이 바뀌었을 수 있어요` });
    else if (b >= 10 && v > b * 1.7) out.push({ key: k, kind: 'jump', label, value: v, base: b, text: `${label} ${v}${u} (평소 ${Math.round(b)}${u}) — 파일이 중복되거나 양식이 바뀌었을 수 있어요` });
  }
  // 검사 결과 건수: 이번에도 검사했고 그날도 검사했던 분류만 합쳐서 본다
  const sums = prior.map(s => snap.cats.filter(c => s.cats.includes(c)).reduce((n, c) => n + (s.counts[c] || 0), 0)).filter((_, i) => snap.cats.some(c => prior[i].cats.includes(c)));
  if (sums.length) {
    const b = median(sums), v = snap.cats.reduce((n, c) => n + (snap.counts[c] || 0), 0);
    if (b >= 10 && v >= b * 2.5) out.push({ key: 'issues', kind: 'jump', label: '검사 결과', value: v, base: b, text: `불일치가 ${v}건 (평소 ${Math.round(b)}건) — 평소보다 크게 늘었어요. 파일 양식이 바뀐 것은 아닌지 확인하세요` });
    else if (b >= 10 && v === 0) out.push({ key: 'issues', kind: 'zero', label: '검사 결과', value: v, base: b, text: `불일치가 0건이에요(평소 ${Math.round(b)}건) — 모두 고친 것이 아니라면 파일이 일부만 읽혔을 수 있어요` });
  }
  return out;
}
// 검사별 정확도 현황(실사용 기준): 최근 days일 동안 (분류|세부 검사)별로 — 지금 열려 있는 건, 3일 이상 계속되는 건, 새로 생긴 건, 해결된 건(과 해결까지 걸린 날 중앙값), 사용자가 「제외」·「확인함」한 횟수와 제외 사유 TOP3.
// 해결 비율 = 해결 / (해결 + 3일 이상 계속 중) — 낮고 계속 건이 많으면 현장에서 안 고치는 규칙이거나 노이즈일 가능성이 크다는 신호다(진짜 오탐 여부는 제외 사유로 판단).
// history = {snaps:[...]} · feedback = [{t, type:'exclude'|'restore'|'ack'|'unack', cat, src, reason}]
function summarizeQuality(history, feedback, { today = dayOf(Date.now()), days = 30 } = {}) {
  const snaps = ((history && history.snaps) || []).filter(s => dayDiff(s.day, today) < days && s.day <= today);
  const groups = new Map(), gk = (key) => { const p = String(key).split('|'); return p[0] + '|' + (p[1] || ''); };
  const get = (g) => { if (!groups.has(g)) groups.set(g, { group: g, cat: g.split('|')[0], src: g.split('|')[1] || '', openNow: 0, chronicOpen: 0, newCount: 0, resolved: 0, resolveDays: [], fbExclude: 0, fbAck: 0, reasons: new Map() }); return groups.get(g); };
  // 분류마다 "그 분류를 마지막으로 검사한 날"의 결과와 비교한다(검사 안 한 날은 건너뛴다 — 파일이 빠진 날을 해결로 오해하지 않게)
  const run = new Map(), lastKeys = new Map();
  for (const s of snaps) {
    const byCat = new Map(); for (const k of Object.keys(s.keys)) { const c = s.keys[k][0]; if (!byCat.has(c)) byCat.set(c, new Set()); byCat.get(c).add(k); }
    for (const c of s.cats) {
      const cur = byCat.get(c) || new Set(), prevSet = lastKeys.get(c);
      if (prevSet) {
        for (const k of cur) { if (!prevSet.has(k)) { get(gk(k)).newCount++; run.set(k, { len: 1 }); } else { const r = run.get(k) || { len: 1 }; r.len++; run.set(k, r); } }
        for (const k of prevSet) if (!cur.has(k)) { const r = run.get(k) || { len: 1 }, g = get(gk(k)); g.resolved++; g.resolveDays.push(r.len); run.delete(k); }
      } else for (const k of cur) run.set(k, { len: 1 });
      lastKeys.set(c, cur);
    }
  }
  const last = snaps[snaps.length - 1];
  if (last) for (const k of Object.keys(last.keys)) { const g = get(gk(k)); g.openNow++; if ((run.get(k) || { len: 1 }).len >= 3) g.chronicOpen++; }
  for (const f of feedback || []) {
    if (!f || !f.t || dayDiff(dayOf(f.t), today) >= days) continue;
    const g = get((f.cat || '?') + '|' + (f.src || ''));
    if (f.type === 'exclude') { g.fbExclude++; const r = String(f.reason || '').split(' · ')[0].trim(); if (r) g.reasons.set(r, (g.reasons.get(r) || 0) + 1); } else if (f.type === 'ack') g.fbAck++;
  }
  return [...groups.values()].map(g => ({ ...g, resolveMedian: g.resolveDays.length ? median(g.resolveDays) : null, reasons: [...g.reasons].sort((a, b) => b[1] - a[1]).slice(0, 3), resolveRate: g.resolved + g.chronicOpen ? g.resolved / (g.resolved + g.chronicOpen) : null }))
    .sort((a, b) => b.openNow - a.openNow || b.resolved - a.resolved || a.group.localeCompare(b.group));
}
// 확인함 표시는 그 불일치가 해결되면(검사한 분류에서 사라지면) 자동으로 지운다
function pruneAck(ack, snap) {
  const out = {};
  for (const [k, v] of Object.entries(ack || {})) { const cat = k.split('|')[0]; if (!snap.cats.includes(cat) || snap.keys[k]) out[k] = v; }
  return out;
}
const api = { issueKey, keyIssues, evaluatedCats, makeSnapshot, addSnapshot, compareIssueHistory: compare, summarizeByWho, summarizeQuality, pruneAck, detectAnomalies, ISSUE_HISTORY_CATS: CATS };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
