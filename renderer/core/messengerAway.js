// messengerAway.js — 메신저의 외출·외박 행을 홈 요약·환자 검색에서 쓰기 좋게 정리하는 순수 함수(파일·화면 접근 없음).
// 브라우저: <script src="core/messengerAway.js"> → RehabCore.messengerAway / Node: require() (테스트용)
'use strict';
(function (root) {
const KINDS = ['외박', '외진', '외출']; // 보여 주는 순서
const kindOf = (r) => { const t = String((r && r.category) || '') + ' ' + String((r && r.reason) || ''); return /외진/.test(t) ? '외진' : /외박/.test(t) ? '외박' : /외출/.test(t) ? '외출' : (String((r && r.category) || '').trim() || '외출'); };
const baseName = (n) => String(n || '').replace(/\s+/g, '').replace(/[A-Z]$/, '');
// 시간 글자: 외박은 "~종료일", 외출·외진은 "나감~돌아옴"(없으면 빈 글자)
function timeText(r, kind) {
  if (kind === '외박') { const e = String(r.endDate || '').slice(5).replace('-', '/'); return e && r.endDate !== r.date ? '~' + e : ''; }
  const a = String(r.departureText || '').trim(), b = String(r.returnText || '').trim();
  return a && b ? a + '~' + b : a ? a + '~' : '';
}
// 행 목록 → { counts:{외박,외진,외출}, items:[{name,kind,time}] }  (외박 → 외진 → 외출, 같은 종류는 이름순)
function summarize(rows) {
  const items = (rows || []).map((r) => { const kind = kindOf(r); return { name: String(r.patient || '').replace(/\s+/g, ''), kind, time: timeText(r, kind) }; }).filter((x) => x.name);
  items.sort((a, b) => (KINDS.indexOf(a.kind) + 9) % 9 - (KINDS.indexOf(b.kind) + 9) % 9 || a.name.localeCompare(b.name, 'ko'));
  const counts = {}; KINDS.forEach((k) => { counts[k] = items.filter((x) => x.kind === k).length; });
  return { counts, items };
}
// 시간표의 환자 이름("이영호A")에 맞는 항목. 이름이 같으면 정확히, 메신저가 글자(A·B)를 뺀 경우는 loose=true(동명이인일 수 있어 확인 필요)로 알려 준다.
function matchName(items, name) {
  const n = String(name || '').replace(/\s+/g, ''), out = [];
  (items || []).forEach((it) => { if (it.name === n) out.push({ ...it, loose: false }); else if (it.name !== n && baseName(n) === it.name && n !== it.name) out.push({ ...it, loose: true }); });
  return out;
}
const api = { KINDS, kindOf, timeText, summarize, matchName };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { messengerAway: api });
})(typeof window !== 'undefined' ? window : globalThis);
