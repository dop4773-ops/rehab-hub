// messengerAway.js — 메신저의 외출·외박 행을 홈 요약·환자 검색에서 쓰기 좋게 정리하는 순수 함수(파일·화면 접근 없음).
// 브라우저: <script src="core/messengerAway.js"> → RehabCore.messengerAway / Node: require() (테스트용)
'use strict';
(function (root) {
const KINDS = ['외박', '외진', '외출']; // 보여 주는 순서
const kindOf = (r) => { const t = String((r && r.category) || '') + ' ' + String((r && r.reason) || ''); return /외진/.test(t) ? '외진' : /외박/.test(t) ? '외박' : /외출/.test(t) ? '외출' : (String((r && r.category) || '').trim() || '외출'); };
const baseName = (n) => String(n || '').replace(/\s+/g, '').replace(/[A-Z]$/, '');
const md = (iso) => String(iso || '').slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
// 메신저 시각 글자("13:00" · "1300" · "오후 1시 30분") → 분. 읽을 수 없으면 null
function clock(text) {
  const t = String(text || '').trim(); let m = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m) return +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  m = t.match(/^(\d{2})(\d{2})$/); if (m) return +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  m = t.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/); if (m) return ((+m[2] % 12) + (m[1] === '오후' ? 12 : 0)) * 60 + (+m[3] || 0);
  return null;
}
// 한 줄로 읽히는 설명 — 「언제 나가서 언제 오는지」와 치료에 미치는 영향(대체치료 규칙과 같음: 귀원 미정이면 나간 오전/오후 치료만)
function describe(r, kind) {
  kind = kind || kindOf(r);
  if (kind === '외박') return r.endDate && r.endDate !== r.date ? `${md(r.date)}~${md(r.endDate)} 외박 (${md(r.endDate)} 귀원)` : '하루 외박(종일)';
  const dep = String(r.departureText || '').trim(), ret = String(r.returnText || '').trim(), a = clock(dep), b = clock(ret), pm = (m) => m >= 12 * 60 + 30;
  if (a != null && b != null) return `${dep.replace(/^(\d):/, '0$1:')}~${ret.replace(/^(\d):/, '0$1:')}`.replace(/\s+/g, '');
  if (a != null) return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')} 나감 · 귀원 미정 → ${pm(a) ? '오후' : '오전'} 치료만`;
  if (/오전/.test(dep)) return '오전 (시간 미정) → 오전 치료만';
  if (/오후/.test(dep)) return '오후 (시간 미정) → 오후 치료만';
  return dep || ret ? [dep, ret].filter(Boolean).join(' · ') : '시간 미정 · 종일';
}
// 행 목록 → { counts:{외박,외진,외출}, items:[{name,kind,time,room,ward}] }  (외박 → 외진 → 외출, 같은 종류는 이름순)
function summarize(rows) {
  const items = (rows || []).map((r) => { const kind = kindOf(r); return { name: String(r.patient || '').replace(/\s+/g, ''), kind, time: describe(r, kind), room: String(r.room || '').replace(/호$/, ''), ward: String(r.ward || '') }; }).filter((x) => x.name);
  items.sort((a, b) => (KINDS.indexOf(a.kind) + 9) % 9 - (KINDS.indexOf(b.kind) + 9) % 9 || a.name.localeCompare(b.name, 'ko'));
  const counts = {}; KINDS.forEach((k) => { counts[k] = items.filter((x) => x.kind === k).length; });
  return { counts, items };
}
// 시간표의 환자 이름("이영호A")에 맞는 항목. 이름이 같으면 정확히, 메신저가 글자(A·B)를 뺀 경우는 loose=true(동명이인일 수 있어 확인 필요)로 알려 준다.
function matchName(items, name) {
  const n = String(name || '').replace(/\s+/g, ''), out = [];
  (items || []).forEach((it) => { if (it.name === n) out.push({ ...it, loose: false }); else if (baseName(n) === it.name && n !== it.name) out.push({ ...it, loose: true }); });
  return out;
}
const api = { KINDS, kindOf, describe, clock, md, summarize, matchName };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { messengerAway: api });
})(typeof window !== 'undefined' ? window : globalThis);
