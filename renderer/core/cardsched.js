// cardsched.js — 환자 전체시간표(원본) 카드의 "기존 스케줄"과 실제 액팅을 비교하는 순수 함수(파일·화면 접근 없음).
// 카드 한 칸 = 한 시간대(35분 간격: 08:30·09:05·09:40…)의 치료. 운동·작업치료는 1:1, 기구·전기는 1:다(여러 환자 동시)로 들어 있다.
// 브라우저: <script src="../core/cardsched.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
const SLOT_MIN = 35;
// 카드 칸 글자("운동치료", "기구(ST)", "전기치료", "연하전기", "10F 통증치료"…)와 액팅 처방명("IM301 회복기재활Ⅱ 매트·이동치료", "MM010 기구치료"…)을 같은 분류로 맞춘다.
// 알 수 없으면 ''(분류 못 함 — 같은 시간대에 스케줄이 있으면 다르다고 단정하지 않는다).
function cat(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, '');
  if (!t) return '';
  if (/연하전기/.test(t)) return '연하전기';
  if (/연하/.test(t)) return '연하';
  if (/전산화인지|인지재활|CCRT|BETTER|COMCOG/i.test(t)) return '인지';
  if (/통증/.test(t)) return '통증';
  if (/기구/.test(t)) return '기구';
  if (/기능적전기자극|FES|전기/i.test(t)) return '전기';
  if (/작업|수부|특수/.test(t)) return '작업';
  if (/매트|이동치료|보행|중추신경계발달|NDT|운동/i.test(t)) return '운동';
  return '';
}
const DOW = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일/공휴일'];
// '2026-10-15' → '목요일'(카드의 요일 열 이름). 일요일은 카드에 열이 없어 ''.
function dayLabel(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
  return d === 0 ? '' : DOW[d];
}
// "0.3541666" / 0.354 / "08:30" → 분. 시간이 아닌 글자(※ 안내 등)는 null.
function slotMinutes(raw) {
  const s = String(raw == null ? '' : raw).trim(); if (!s) return null;
  const hm = /^(\d{1,2}):(\d{2})/.exec(s); if (hm) return +hm[1] * 60 + +hm[2];
  const n = Number(s); if (!Number.isFinite(n) || n <= 0 || n >= 1) return null;
  return Math.round(n * 1440);
}
// slots: 그 요일의 [{startM, text, cat}] · act: {startM, order}
// → {state:'ok'|'noSched'|'other', cat, sched:[분류]}  noSched = 그 시간대에 스케줄이 없음, other = 스케줄은 있는데 다른 종류 치료
function compare(slots, act, { slotMin = SLOT_MIN } = {}) {
  const c = cat(act.order);
  const at = (slots || []).filter(s => act.startM != null && s.startM <= act.startM && act.startM < s.startM + slotMin);
  if (!at.length) return { state: 'noSched', cat: c, sched: [], at: [] };
  const sc = at.map(s => s.cat || cat(s.text)).filter(Boolean);
  if (!c || !sc.length || sc.includes(c)) return { state: 'ok', cat: c, sched: sc, at };
  return { state: 'other', cat: c, sched: sc, at };
}
const api = { SLOT_MIN, cat, dayLabel, slotMinutes, compare };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { cardSched: api });
})(typeof window !== 'undefined' ? window : globalThis);
