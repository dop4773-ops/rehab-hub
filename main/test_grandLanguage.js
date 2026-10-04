// 실행: node main/test_grandLanguage.js
// 그랜드라운딩 언어치료 판단(전체시간표 치료명에서 직접·층 판단)과 담당 치료사 단일 기준을 가짜 환자로 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../renderer/tools/그랜드라운딩_통합.html'), 'utf8');
const grab = (startMarker, endMarker) => { const i = html.indexOf(startMarker), j = html.indexOf(endMarker, i); assert(i >= 0 && j > i, `marker 없음: ${startMarker}`); return html.slice(i, j); };
const ctx = { console, ...require('../renderer/core/normalize.js') }; vm.createContext(ctx); // 공통 정규화는 core에서 그대로 가져온다
vm.runInContext([
  grab('const DAY_ORDER', '\n') + '\n',
  'let grandOtTherapistMap=new Map(), grandSwallowTherapistMap=new Map(), grandCogTherapistMap=new Map();',
  grab('function normalizeGrandOtPatientKey', '\n') + '\n',
  grab('function treatmentCore', '\n') + '\n',
  grab('function grandPrimaryFloorNum', 'function grandPatientLanguageDays'),
  grab('function grandOtTherapistText', 'function grandSwallowTherapistText'),
  grab('function grandSwallowTherapistText', 'function grandCogTherapistText'),
  grab('function grandCogTherapistText', '\n\nfunction'),
  grab('function grandTherapistKinds', '// updateGrandHandoverStatus()'),
  'this.info=grandLanguageInfo; this.who=grandWhoLabel; this.sum=grandWhoSummary; this.maps={ot:grandOtTherapistMap,sw:grandSwallowTherapistMap,cg:grandCogTherapistMap};',
].join('\n'), ctx);

const pt = (floor, primary, treatments) => ({ floor, primary, schedule: { 월요일: Object.fromEntries(treatments.map((t, i) => [`0${i}:00`, { treatment: t, floor }])) } });
const floors = (p) => JSON.stringify(ctx.info(p).floors);

// ① 언어치료 판단은 치료명에서 직접 — 심리 단독은 제외
assert.strictEqual(floors(pt(10, '10층 치료실', ['언어치료'])), '["10F"]');
assert.strictEqual(floors(pt(10, '10층 치료실', ['임상심리'])), '[]', '심리 단독은 언어치료가 아니다');
assert.strictEqual(floors(pt(10, '10층 치료실', ['작업치료(T-3)', '운동치료'])), '[]');
console.log('OK ① 언어치료 판단(심리 단독 제외)');

// ② 층: 치료명에 층이 적혀 있으면 그 층 → 없으면 주 치료실 층 → 없으면 시간표 파일 층
assert.strictEqual(floors(pt(10, '10층 치료실', ['(3층)언어치료'])), '["3F"]', '10F 시간표라도 "(3층)"이면 3F');
assert.strictEqual(floors(pt(10, '10층 치료실', ['3F 언어치료'])), '["3F"]');
assert.strictEqual(floors(pt(3, '3층 치료실', ['언어치료(10F)'])), '["10F"]', '층이 뒤에 붙은 표기도 인식');
assert.strictEqual(floors(pt(10, '3층 치료실', ['언어치료'])), '["3F"]', '층 표기가 없으면 주 치료실 층');
assert.strictEqual(floors(pt(10, '', ['언어치료'])), '["10F"]', '주 치료실도 없으면 시간표 파일 층');
assert.strictEqual(floors(pt(10, '10층 치료실', ['(3층)언어치료', '언어치료(10F)'])), '["10F","3F"]', '두 층 모두면 둘 다(레거시와 같은 문자열 정렬)');
console.log('OK ② 층 판단 순서');

// ③ 작성 확인 필요 치료사: 항목에서 작성에 문제가 있는 치료사만(환자 담당 전원 아님)
ctx.maps.ot.set('홍길동', ['김가나', '이다라']);
ctx.maps.sw.set('홍길동', ['박마바']);
ctx.maps.ot.set('최작업', ['정사아']);
assert.strictEqual(ctx.who('홍길동', { writers: ['엄주용'], treatment: 'RDT' }), '엄주용', '미작성 행을 쓴 치료사만 — 환자 담당 전원이 아니다');
assert.strictEqual(ctx.who('홍길동', { writers: ['엄주용 / 하승유'] }), '엄주용 / 하승유');
assert.strictEqual(ctx.who('홍길동', { writers: ['엄주용 (인수인계 기재)'] }), '엄주용', '예전 보조 표시는 떼어낸다');
assert.strictEqual(ctx.who('홍길동', { writers: [''], treatment: '연하치료' }), '박마바', '쓴 사람이 없으면 그 치료 종류의 치료사만');
assert.strictEqual(ctx.who('홍길동', { writers: [''], treatment: 'SOT' }), '김가나 / 이다라');
assert.strictEqual(ctx.who('홍길동'), '작업 김가나 / 이다라 · 연하 박마바', '미등록: 아무도 안 썼으므로 치료 종류별 치료사 전원');
assert.strictEqual(ctx.who('최작업'), '정사아', '치료 종류가 하나뿐이면 종류 표시 없이');
assert.strictEqual(ctx.who('없는환자', { writers: ['-'] }), '확인 필요');
console.log('OK ③ 작성 확인 필요 치료사 표기');

// ④ 치료사별 건수 요약
const sm = ctx.sum(['엄주용', '엄주용 / 하승유', '작업 김가나 / 이다라 · 연하 박마바']);
assert(sm.startsWith('엄주용 2'), '많이 빠뜨린 치료사가 맨 앞');
assert(/하승유 1/.test(sm) && /박마바 1/.test(sm) && !/작업|연하/.test(sm), '치료 종류 표시는 이름 집계에서 제외');
console.log('OK ④ 치료사별 건수 요약');

console.log('ALL PASS');
