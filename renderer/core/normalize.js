// normalize.js — 이름·시간·병실·주치의 정규화 공통 함수. 교차검증/그랜드라운딩에 들어 있던 동일 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/normalize.js"> 로 전역 RehabCore 사용 / Node: require() (테스트용)
'use strict';
(function (root) {
function normalizeText(v){ return (v==null?'':String(v)).replace(/\r/g,'').trim(); }
function excelTimeToHHMM(v){ const n=Number(v); if(!Number.isFinite(n)) return ''; let mins=Math.round((n-Math.floor(n))*1440); mins=((mins%1440)+1440)%1440; return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`; }
function normKey(name){ return normalizeText(name).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g,'').toUpperCase(); }
function normDoctor(raw){
  // "주치의" 값이 문자("RM6")로 저장된 경우와 서식(표시형식)만 RM#으로 보이고 실제 값은 숫자(6)로 저장된
  // 경우가 섞여 있어서, 숫자만 뽑아 "RM"+숫자 형태로 통일해서 비교한다.
  const s=normalizeText(raw); if(!s) return '';
  const m=/(\d+)/.exec(s);
  return m ? 'RM'+m[1] : s.toUpperCase();
}
function roomDigits(v){ const m=String(v==null?'':v).match(/\d{3,4}/); return m?m[0]:''; }
function regDigits(v){ return String(v==null?'':v).replace(/\D/g,'').replace(/^0+/,''); }

// 날짜 칸 → "YYYY-MM-DD". 엑셀 날짜 일련번호(45398), "2026-06-26", "2026.6.26", "2026/6/26" 형식을 읽고 못 읽으면 ''.
function toIsoDate(v){
  const s=String(v==null?'':v).trim(); if(!s) return '';
  if(/^\d{5}(?:\.\d+)?$/.test(s)){ const n=Math.floor(Number(s)); if(n<20000||n>100000) return ''; const d=new Date(Date.UTC(1899,11,30)+n*86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
  const m=/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s); return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';
}
const api = { normalizeText, excelTimeToHHMM, normKey, normDoctor, roomDigits, regDigits, toIsoDate };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
