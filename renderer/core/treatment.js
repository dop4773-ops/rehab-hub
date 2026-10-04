// treatment.js — 치료 문구(전체시간표 칸 글자) 분류 공통 모듈. 그랜드라운딩에 있던 순수 함수를 한 곳으로 옮긴 것(로직 변경 없음)과,
// 교차검증이 카드 칸에서 쓰던 정규식(언어치료·연하전기·인지치료·작업치료·연하치료)을 이름 붙여 모아 둔 것.
// 브라우저: <script src="../core/treatment.js"> 로 전역 RehabCore 사용 / Node: require() (테스트용)
// 주의: treatmentCore 는 거친 분류다(/연하/ 를 먼저 검사해 연하치료·연하전기가 모두 'swallow', 인지치료·전산화인지가 모두 'cog',
// 언어·심리가 모두 'speech'). 세분(연하전기·심리 분리 등)이 필요한 곳은 아래 TREATMENT_TEXT 의 개별 정규식을 쓴다.
'use strict';
(function (root) {
const { normalizeText } = (typeof require === 'function' && typeof module !== 'undefined') ? require('./normalize.js') : root.RehabCore;
function isTreatmentText(text){ const s=normalizeText(text); if(!s||s.length>100) return false; if(/외래\s*치료\s*안내|결석\s*3회|지각\s*2회/.test(s)) return false; if(/^\d{2,4}[.\-/]\d{1,2}/.test(s) && /~/.test(s)) return false; return /(치료|기구|연하|인지|언어|심리|도수|운동|작업|전기|ADL|통증|CPM|로봇|워크|모닝|알봇)/i.test(s); }
function treatmentCore(t){ const s=normalizeText(t); if(/연하/.test(s)) return 'swallow'; if(/인지/.test(s)) return 'cog'; if(/언어|심리/.test(s)) return 'speech'; if(/도수/.test(s)) return 'manual'; if(/작업/.test(s)) return 'ot'; if(/통증/.test(s)) return 'pain'; if(/운동/.test(s)) return 'exercise'; if(/전기/.test(s)) return 'electric'; if(/기구|CPM|워크|모닝|알봇|로봇/i.test(s)) return 'device'; return 'other'; }
function inlineLocation(treatment){ const t=normalizeText(treatment); let m; if((m=/^(?:운동치료|작업치료)\(([^)]+)\)/.exec(t))) return m[1].trim(); if((m=/^기구\(([^)]+)\)(?:-([\w가-힣]+))?/.exec(t))) return m[2]?`${m[1]}-${m[2]}`:m[1]; return ''; }
function treatmentRoom(t){ const s=normalizeText(t); if(/연하/.test(s)) return '연하치료실'; if(/인지/.test(s)) return '인지치료실'; if(/언어/.test(s)&&/심리/.test(s)) return '언어·심리실'; if(/언어/.test(s)) return '언어치료실'; if(/심리/.test(s)) return '신경심리실'; if(/도수/.test(s)) return '도수치료실'; if(/작업/.test(s)) return '작업치료실'; if(/운동/.test(s)) return '운동치료실'; if(/통증/.test(s)) return '통증치료실'; if(/전기/.test(s)) return '전기치료실'; if(/ADL/i.test(s)) return 'ADL실'; if(/기구|CPM|워크|모닝|알봇|로봇/i.test(s)) return '기구치료구역'; return '치료실'; }
function cleanTreatmentName(t){ let s=normalizeText(t); s=s.replace(/^(?:\((?:3F|10F|3층|10층)\)|(?:3F|10F|3층|10층))\s*/i,''); s=s.replace(/^(운동치료|작업치료)\([^)]+\)/,'$1'); if(/^기구(?:\([^)]+\))?(?:-[\w가-힣]+)?$/i.test(s)) s='기구치료'; if(s==='통증') s='통증치료'; return s; }

// 카드 요일칸 글자에서 치료 종류를 가리는 정규식 — 교차검증의 개수·위치·토요일 규칙이 그대로 쓰던 값
const TREATMENT_TEXT = { speech: /언어치료/, swallow_electric: /연하전기/, cog: /인지치료/, ot: /작업치료/, swallow: /연하치료/ };
function hasTreatment(kind, text) { return TREATMENT_TEXT[kind].test(text); }

const api = { isTreatmentText, treatmentCore, inlineLocation, treatmentRoom, cleanTreatmentName, TREATMENT_TEXT, hasTreatment };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
