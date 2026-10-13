// ordertype.js — 치료기록 QA "액팅 종류 다름": 스케줄(시간표) 오더와 다른 종류로 액팅한 경우를 찾는 순수 함수(화면·파일 접근 없음).
// 예: 스케줄은 인지(전산화인지)인데 특수작업치료로 액팅 / 스케줄은 특수인데 연하로 액팅.
// 브라우저: <script src="../core/ordertype.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
// 스케줄 쪽 종류 이름과 같은 말로 맞춘 액팅 종류. 알 수 없는 처방명이면 ''(비교 대상에서 뺀다).
const KNOWN = ['전산화인지', '연하치료', '연하전기', '작업특수', '복잡', '평가'];
// simplify: 처방명 → 종류 이름으로 줄이는 함수(도구의 msSimplifyOrderName). 연하 중 "전기"가 든 것은 연하전기로 따로 본다.
function actType(orderName, simplify) {
  const raw = String(orderName == null ? '' : orderName), t = (simplify || ((x) => x))(raw);
  if (t === '연하치료' && /전기/.test(raw)) return '연하전기';
  return KNOWN.includes(t) ? t : '';
}
const toMin = (text) => { const m = String(text || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
// orderList: 스케줄 오더 [{type, timeSlot, ...}] · acts: 액팅 묶음(세션) [{orderName, start, ...}]
// 같은 시간대(기본 60분 안)에서 같은 종류끼리 먼저 짝을 지은 뒤(시간이 가까운 순), 남은 스케줄 오더와 남은 액팅이 같은 시간대이면 "스케줄은 A인데 B로 액팅"으로 본다.
// 짝이 안 되는 나머지는 기존 미액팅/액팅초과 계산이 그대로 다룬다. 반환: [{entry, act, schedType, actType}]
function findTypeMismatches(orderList, acts, { simplify, withinMin = 60 } = {}) {
  const S = (orderList || []).filter(e => KNOWN.includes(e.type)).map(e => ({ e, m: toMin(e.timeSlot) }));
  const A = (acts || []).map(a => ({ a, t: actType(a.orderName, simplify), m: toMin(a.start) })).filter(x => x.t);
  const sUsed = new Set(), aUsed = new Set();
  const near = (x, y) => (x == null || y == null ? Infinity : Math.abs(x - y));
  // 1) 같은 종류끼리: 같은 시간대(기본 60분 안)에서 시간 차가 작은 짝부터
  const same = [];
  S.forEach((s, i) => A.forEach((x, j) => { if (s.e.type === x.t && near(s.m, x.m) <= withinMin) same.push([near(s.m, x.m), i, j]); }));
  same.sort((p, q) => p[0] - q[0]).forEach(([, i, j]) => { if (!sUsed.has(i) && !aUsed.has(j)) { sUsed.add(i); aUsed.add(j); } });
  // 2) 남은 것끼리: 같은 시간대면 종류가 다른 액팅
  const rest = [];
  S.forEach((s, i) => { if (!sUsed.has(i)) A.forEach((x, j) => { if (!aUsed.has(j)) rest.push([near(s.m, x.m), i, j]); }); });
  const out = [];
  rest.sort((p, q) => p[0] - q[0]).forEach(([d, i, j]) => { if (d <= withinMin && !sUsed.has(i) && !aUsed.has(j)) { sUsed.add(i); aUsed.add(j); out.push({ entry: S[i].e, act: A[j].a, schedType: S[i].e.type, actType: A[j].t }); } });
  return out.sort((p, q) => (toMin(p.entry.timeSlot) || 0) - (toMin(q.entry.timeSlot) || 0));
}
// "인지(CCRT) → 특수" 같은 짧은 표시
const ABBR = { 전산화인지: '인지(CCRT)', 연하치료: '연하', 연하전기: '연하전기(ERDT)', 작업특수: '특수', 복잡: '복잡', 평가: '평가' };
const abbr = (t) => ABBR[t] || t;
const api = { KNOWN, actType, findTypeMismatches, abbr };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { orderType: api });
})(typeof window !== 'undefined' ? window : globalThis);
