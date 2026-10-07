// workstate.js — 업데이트·재시작 때 하던 작업을 지키는 순수 함수들(화면·저장소 접근 없음).
// 브라우저: <script src="../core/workstate.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
// 저장해 둔 "제외한 미액팅 칸"(칸 주소 + 환자·시간 확인용 정보) 중, 지금 시간표에서도 같은 칸에 같은 환자·시간이 있는 것만 다시 살린다.
// 시간표 파일이 바뀌어 행이 밀렸으면(칸 주소는 같은데 내용이 다름) 엉뚱한 칸이 제외되지 않도록 버린다.
// saved: [{key, name, timeSlot}] · entries: 시간표 칸 목록 [{source, row, col, name, timeSlot}] → 살릴 key 배열
function keepMatchingSlots(saved, entries) {
  const at = new Map((entries || []).map(e => [`${e.source}|${e.row}|${e.col}`, e]));
  return (saved || []).filter(s => { const e = at.get(s.key); return e && e.name === s.name && e.timeSlot === s.timeSlot; }).map(s => s.key);
}
// 값이 {키: …}인 저장 객체에서 지금도 유효한 키만 남긴다(고쳐서 사라진 항목의 표시는 정리)
function pruneKeyed(map, validKeys) {
  const ok = new Set(validKeys), out = {};
  for (const [k, v] of Object.entries(map || {})) if (ok.has(k)) out[k] = v;
  return out;
}
// 업데이트 직후 "하던 화면으로 돌아가기" 표식이 아직 유효한지(10분 안)
function resumeFresh(flag, now = Date.now(), maxMs = 10 * 60 * 1000) {
  return !!(flag && typeof flag === 'object' && flag.view && Number.isFinite(flag.t) && now - flag.t >= 0 && now - flag.t <= maxMs);
}
const api = { keepMatchingSlots, pruneKeyed, resumeFresh };
root.RehabCore = Object.assign(root.RehabCore || {}, { workState: api });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
