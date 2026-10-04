// 실행: node main/test_grandLanguage.js
// 그랜드라운딩 언어치료 판단(전체시간표 치료명에서 직접·층 판단)과 담당 치료사 단일 기준을 가짜 환자로 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../renderer/tools/그랜드라운딩_통합.html'), 'utf8');
const grab = (startMarker, endMarker) => { const i = html.indexOf(startMarker), j = html.indexOf(endMarker, i); assert(i >= 0 && j > i, `marker 없음: ${startMarker}`); return html.slice(i, j); };
const ctx = { console }; vm.createContext(ctx);
vm.runInContext([
  grab('const DAY_ORDER', '\n') + '\n',
  'let grandOtTherapistMap=new Map(), grandSwallowTherapistMap=new Map(), grandCogTherapistMap=new Map();',
  grab('function normalizeText', '\n') + '\n',
  grab('function normalizeGrandOtPatientKey', '\n') + '\n',
  grab('function treatmentCore', '\n') + '\n',
  grab('function grandPrimaryFloorNum', 'function grandPatientLanguageDays'),
  grab('function grandOtTherapistText', 'function grandSwallowTherapistText'),
  grab('function grandSwallowTherapistText', 'function grandCogTherapistText'),
  grab('function grandCogTherapistText', '\n\nfunction'),
  grab('function grandTherapistLabel', '// updateGrandHandoverStatus()'),
  'this.info=grandLanguageInfo; this.label=grandTherapistLabel; this.maps={ot:grandOtTherapistMap,sw:grandSwallowTherapistMap,cg:grandCogTherapistMap};',
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

// ③ 담당 치료사 단일 기준: 작업치료현황 → 인수인계(보조 표시) → 확인 필요
ctx.maps.ot.set('홍길동', ['김가나', '이다라']);
ctx.maps.sw.set('최연하', ['박마바']);
assert.strictEqual(ctx.label('홍길동', '다른사람'), '김가나 / 이다라', '작업치료현황이 있으면 인수인계 값은 쓰지 않는다');
assert.strictEqual(ctx.label('홍길동', '', 'SOT'), '김가나 / 이다라');
assert.strictEqual(ctx.label('최연하', ''), '박마바', '작업치료사가 없으면 연하 치료사');
assert.strictEqual(ctx.label('최연하', '', '연하치료'), '박마바', '연하 치료행은 연하 치료사 우선');
assert.strictEqual(ctx.label('없는환자', '사아자'), '사아자 (인수인계 기재)', '현황에 없으면 인수인계 값을 보조로 표시');
assert.strictEqual(ctx.label('없는환자', '사아자 (인수인계 기재)'), '사아자 (인수인계 기재)', '표시가 중복으로 붙지 않는다');
assert.strictEqual(ctx.label('없는환자', '-'), '확인 필요');
assert.strictEqual(ctx.label('없는환자', '확인 필요'), '확인 필요');
console.log('OK ③ 담당 치료사 표기 단일 기준');

console.log('ALL PASS');
