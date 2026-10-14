// dailyplan.js — 그날의 물리치료시간표 · 기구시간표(기구/FES) 시트를 읽어 "환자별 그날 스케줄"을 만드는 순수 함수(파일·화면 접근 없음).
// 물리치료시간표: 치료사 열 × 시간 줄, 칸 = "환자\n침상"(1:1 운동치료). 기구시간표: 기구 칸에 환자 이름(1:다 기구), 아래 FES 칸에 환자 이름(1:다 전기).
// 격자는 g = { get(r,c)→글자(1부터), maxRow, maxCol } 로 받는다(어디서 읽었든 같은 방식으로 풀 수 있게). 브라우저: <script src="../core/dailyplan.js"> / Node: require()
'use strict';
(function (root) {
const compact = (s) => String(s == null ? '' : s).replace(/\s+/g, '');
const TIME = /^(\d{1,2}):(\d{2})/;
const WD = '월화수목금토일';

// 시트 이름에서 날짜가 맞는 시트들(예: "10.15목", "10.3토(1팀)", "10월15일") — 같은 날짜 시트가 여럿(팀별)일 수 있어 전부 돌려준다.
function sheetsForDate(names, ymd) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return [];
  const month = +m[1], day = +m[2];
  return (names || []).filter(n => {
    const name = compact(n);
    let x = /(\d{1,2})월0?(\d{1,2})일/.exec(name); if (x) return +x[1] === month && +x[2] === day;
    x = /(?:^|[^0-9])(\d{1,2})[.\-/]0?(\d{1,2})(?:[^0-9]|$)/.exec(name);
    return !!(x && +x[1] === month && +x[2] === day);
  });
}
const weekdayChar = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? WD[(new Date(+m[1], +m[2] - 1, +m[3]).getDay() + 6) % 7] : ''; };

// 치료사 머리글인지(2~4자 한글, 요일·치료 이름 아님)
function isTherapistName(v) {
  const s = compact(v);
  if (!/^[가-힣]{2,4}$/.test(s)) return false;
  if (/^(월요일|화요일|수요일|목요일|금요일|토요일|일요일|평일|점심시간|치료시간|통증|외진|오전|오후|신환|퇴원|원본)$/.test(s)) return false;
  return !/(?:치료|전기|도수|기구|운동|작업|물리|연하|인지|언어|통증|매트|테이블|구역|병동|병실|보행|로봇|워크)/.test(s);
}
const NOT_PATIENT = /CCRT|ERDT|육아휴직|휴직|휴가|출산|회의|교육|점심|치료실|빈타임|근무|VAC|OFF|FES|R-bot|모닝워크|로봇|알봇|CPM|통증|기구\d|MSK|퇴원|예정|^3F|^10F/i;
// 괄호 안이 요일뿐이면("(월수금)", "(화,목)") 그 요일에만 하는 치료
function dayLimited(lines, wdChar) {
  if (!wdChar) return false;
  for (const l of lines) for (const p of l.matchAll(/\(([^)]*)\)/g)) { const t = p[1].replace(/[\s,·]/g, ''); if (t && new RegExp(`^[${WD}]+$`).test(t) && !t.includes(wdChar)) return true; }
  return false;
}
// 칸 글자 → {name, test, outpatient} 또는 null(환자가 아닌 칸: 기구1·FES·통증·휴가·안내 글 등)
// 이름 뒤 G·M·BS·NWB·PWB·TEST 는 표시일 뿐 이름이 아니다(동명이인 구분 알파벳은 A~E만 이름에 남긴다).
function patientOf(raw, wdChar) {
  const lines = String(raw == null ? '' : raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean); if (!lines.length) return null;
  if (lines[0].startsWith('<') || NOT_PATIENT.test(lines[0])) return null;
  if (dayLimited(lines, wdChar)) return null;
  const outpatient = /외래/.test(lines[0]);
  const clean = (t) => {
    let f = t.replace(/\([^)]*\)/g, '').replace(/도수$/, '').trim();
    const test = /TEST/i.test(f);
    f = f.replace(/TEST/ig, '').replace(/\s+(?:M|G|BS|EST|NWB|PWB|Rt\.?\s*NWB|Lt\.?\s*NWB).*$/i, '').trim();
    f = f.replace(/[^가-힣A-Za-z0-9]/g, '');
    f = f.replace(/(?<=[가-힣A-E])[GM]$/, ''); // "이대양G" → 이대양, "김영옥AM" → 김영옥A (G·M 표시)
    return { f, test };
  };
  let { f, test } = clean(lines[0]);
  if (!/^[가-힣]{2,5}[A-E]?$/.test(f) && /[가-힣]\s*-\s*\d/.test(lines[0])) ({ f, test } = clean(lines[0].replace(/[가-힣A-Za-z]{1,2}\s*-\s*\d+.*$/, '')));
  if (/^(기구|통증|전기|운동|작업|도수|연하|인지|언어)\d*$/.test(f) || !/^[가-힣]{2,5}[A-E]?$/.test(f)) return null;
  return { name: f, test, outpatient };
}

// 기구·FES 칸은 한 칸에 환자가 둘 이상 줄바꿈으로 들어갈 수 있다("김영옥A\n최상희"). "("로 시작하는 줄은 바로 앞 환자의 조건((월수금), (GAIT))이다.
function patientsOfCell(raw, wdChar) {
  const lines = String(raw == null ? '' : raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean), groups = [];
  for (const l of lines) { if (l.startsWith('(') && groups.length) groups[groups.length - 1].push(l); else groups.push([l]); }
  return groups.map(g => patientOf(g.join('\n'), wdChar)).filter(Boolean);
}
// ── 물리치료시간표: 첫 칸이 "치료시간"인 표 = 치료사 열 × 시간 줄. (오른쪽 옆 표들은 자기 시간 열이 따로 있어 그 앞에서 멈춘다)
function parsePtGrid(g, wdChar) {
  const out = [];
  for (let r = 1; r <= g.maxRow; r++) {
    if (compact(g.get(r, 1)) !== '치료시간') continue;
    let first = 0; for (let q = r + 1; q <= Math.min(g.maxRow, r + 4); q++) if (TIME.test(compact(g.get(q, 1)))) { first = q; break; }
    if (!first) continue;
    let stop = g.maxCol + 1; for (let c = 2; c <= g.maxCol; c++) if (TIME.test(compact(g.get(first, c)))) { stop = c; break; }
    const cols = []; for (let c = 2; c < stop; c++) { const n = compact(g.get(r, c)); if (isTherapistName(n)) cols.push({ c, name: n }); }
    if (!cols.length) continue;
    for (let q = r + 1; q <= g.maxRow; q++) {
      const m = compact(g.get(q, 1));
      if (m === '치료시간') break;
      if (m === '점심시간') continue;
      const tm = TIME.exec(m); if (!tm) break;
      const startM = +tm[1] * 60 + +tm[2];
      for (const { c, name } of cols) { const p = patientOf(g.get(q, c), wdChar); if (p) out.push({ name: p.name, test: p.test, outpatient: p.outpatient, startM, therapist: name, row: q, col: c }); }
    }
  }
  return out;
}

// ── 기구시간표: "기구운동시간" 표(기구 칸) 와 "FES시간" 표(전기 칸). 기구 담당 치료사 열(머리글 "기구1…")과 오른쪽 청구 표는 환자가 아니다.
function parseGiGrid(g, wdChar) {
  const out = [];
  for (let r = 1; r <= g.maxRow; r++) {
    const h = compact(g.get(r, 1)), kind = h === '기구운동시간' ? '기구' : h === 'FES시간' ? '전기' : '';
    if (!kind) continue;
    let first = 0; for (let q = r + 1; q <= Math.min(g.maxRow, r + 3); q++) if (TIME.test(compact(g.get(q, 1)))) { first = q; break; }
    if (!first) continue;
    const cols = [];
    for (let c = 2; c <= g.maxCol; c++) {
      const hd = compact(g.get(r, c));
      if (kind === '기구') { if (/경사대|전동자전거|스탠딩|슬라이딩|트레드밀|WALK|MATE/i.test(hd) && !/^기구\d/.test(hd)) cols.push(c); }
      else if (hd !== '치료사') cols.push(c); // FES: 머리글은 칸 묶음의 첫 칸에만 있어 "치료사" 열만 뺀다
    }
    for (let q = first; q <= g.maxRow; q++) {
      const m = compact(g.get(q, 1));
      if (m === '점심시간') continue;
      const tm = TIME.exec(m); if (!tm) break;
      const startM = +tm[1] * 60 + +tm[2];
      for (const c of cols) for (const p of patientsOfCell(g.get(q, c), wdChar)) out.push({ name: p.name, kind, startM, row: q, col: c });
    }
  }
  return out;
}

// 이름 찾기: 같은 표기 → 없으면 구분 알파벳을 뗀 이름이 하나뿐일 때만
const baseOf = (n) => String(n || '').replace(/[A-E]$/, '');
function lookup(map, name) {
  if (!map) return null;
  const n = compact(name); if (map.has(n)) return map.get(n);
  const b = baseOf(n), hit = [...map.keys()].filter(k => baseOf(k) === b);
  return hit.length === 1 ? map.get(hit[0]) : null;
}
// 항목들 → 이름별 칸 목록 Map(이름 → [{startM, cat, text, therapist?, src:'daily'}])
function toMap(entries, catOf) {
  const m = new Map();
  for (const e of entries) { const k = compact(e.name); if (!m.has(k)) m.set(k, []); m.get(k).push({ startM: e.startM, cat: catOf(e), text: catOf(e) === '운동' ? '운동치료' : catOf(e) === '기구' ? '기구' : '전기치료', therapist: e.therapist || '', test: !!e.test, src: 'daily' }); }
  return m;
}
// 이 환자에게 그날 시간표(kind: 'pt' | 'gi')를 쓸 수 있는가: 그 층의 시간표가 올라와 있거나(층을 알 때), 층을 모르는 시간표가 있거나, 시간표에 이 이름이 있으면 쓴다.
// 환자 층의 시간표가 안 올라와 있고 이름도 없으면(예: 10층 것만 올렸는데 3층 환자) 쓰지 않고 카드로 비교한다 — 안 그러면 모든 액팅이 "스케줄 없음"으로 잘못 잡힌다.
// daily = { floors: {pt:Set, gi:Set}, pt: Map, gi: Map } (날짜 시트가 있는 시간표의 층만 floors에 든다. 층을 모르는 파일은 0)
function useDaily(daily, kind, floor, name) {
  if (!daily || !daily.floors || !daily.floors[kind] || !daily.floors[kind].size) return false;
  const f = daily.floors[kind];
  return f.has(0) || !!(floor && f.has(floor)) || !!lookup(daily[kind], name);
}
// 카드 칸 목록 + 그날 시간표 → 비교에 쓸 칸 목록. 그날 시간표가 있는 종류(운동 / 기구·전기)는 카드 대신 그날 것을 쓴다(카드는 원본 틀이라 그날그날 바뀐 일정이 없다).
// daily = { useDaily: {pt:bool, gi:bool}, pt: Map, gi: Map } — 환자별로 어느 쪽을 쓸지(useDaily)는 부르는 쪽이 층·이름으로 정해서 준다.
function mergeSlots(cardSlots, name, daily) {
  const drop = new Set(); const add = [];
  if (daily && daily.useDaily && daily.useDaily.pt) { drop.add('운동'); add.push(...(lookup(daily.pt, name) || [])); }
  if (daily && daily.useDaily && daily.useDaily.gi) { drop.add('기구'); drop.add('전기'); add.push(...(lookup(daily.gi, name) || [])); }
  return (cardSlots || []).filter(s => !drop.has(s.cat)).concat(add);
}
const api = { sheetsForDate, weekdayChar, isTherapistName, patientOf, patientsOfCell, parsePtGrid, parseGiGrid, lookup, toMap, useDaily, mergeSlots, baseOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { dailyPlan: api });
})(typeof window !== 'undefined' ? window : globalThis);
