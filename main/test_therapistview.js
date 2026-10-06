// 실행: node main/test_therapistview.js
// 치료기록 QA "치료사별 한눈에": 치료사별로 모으기(합계 보존), 이름 가리기, 치료사에게 보낼 글 모양을 확인한다.
'use strict';
const assert = require('assert');
const T = require('../renderer/core/therapistview');

assert.strictEqual(T.maskName('전영옥'), '전○○'); assert.strictEqual(T.maskName('김도'), '김○'); assert.strictEqual(T.maskName('이'), '이'); assert.strictEqual(T.maskName(''), '');

const issues = [
  { therapist: '배민지', patientName: '전영옥', time: '08:30 ~ 09:00', orderName: '51020 작업치료', type: '특이사항 오류', severity: '오류' },
  { therapist: '배민지', patientName: '김도연', time: '10:15 ~ 10:45', orderName: '51020 작업치료', type: '치료내용 누락', severity: '오류' },
  { therapist: '김민영', patientName: '권주희', time: '08:30', orderName: '연하치료', type: '시간 오류', severity: '오류' },
  { therapist: '', patientName: '박○○', time: '09:00', orderName: 'x', type: '치료내용 누락', severity: '주의' },
];
const missing = [
  { therapist: '배민지', name: '이승규', type: '작업', timeSlot: '09:05' },
  { therapist: ' 배민지 ', name: '류나경', type: '연하', timeSlot: '08:40' },
  { therapist: '정유정', name: '최민서', type: '인지', timeSlot: '13:00' },
];
const rows = T.groupByTherapist({ issues, missing });
// ① 합계 보존: 묶은 뒤 합계가 원래 목록과 같아야 한다(공백만 다른 이름은 같은 치료사)
assert.strictEqual(rows.reduce((s, r) => s + r.errors.length, 0), 3); assert.strictEqual(rows.reduce((s, r) => s + r.warns.length, 0), 1); assert.strictEqual(rows.reduce((s, r) => s + r.missing.length, 0), 3);
assert.strictEqual(rows.length, 4); // 배민지·김민영·정유정·담당자 미상
// ② 정렬: 확인할 게 많은 치료사 먼저, 항목은 시간순
assert.strictEqual(rows[0].name, '배민지'); assert.strictEqual(rows[0].errors.length, 2); assert.strictEqual(rows[0].missing.length, 2);
assert.deepStrictEqual(rows[0].missing.map(m => m.timeSlot), ['08:40', '09:05']);
assert.ok(rows.some(r => r.name === T.UNKNOWN && r.warns.length === 1));
// ③ 글: 항목이 있는 묶음만, 이름 가리기, 기존 카톡 글과 같은 줄 모양
const msg = T.buildMessage(rows[0], { dateLabel: '10/3', mask: true, simplify: (x) => x.replace(/^\d+\s*/, '') });
assert.ok(msg.startsWith('10/3\n<배민지 선생님 확인 부탁드려요>'));
assert.ok(msg.includes('*특이사항 없음/수정\n배민지-전○○ 작업치료(08:30 ~ 09:00)'));
assert.ok(msg.includes('*치료내용 없음\n배민지-김○○ 작업치료(10:15 ~ 10:45)'));
assert.ok(msg.includes('<미액팅오류>\n배민지-류○○ 연하(08:40)\n배민지-이○○ 작업(09:05)'));
assert.ok(!msg.includes('*치료시간 수정'), '항목 없는 묶음은 뺀다'); assert.ok(msg.endsWith('✅ 꼭!!당일에 수정하시고 수정했다고 올려주세요.'));
assert.ok(T.buildMessage(rows[0], { dateLabel: '10/3', mask: false }).includes('배민지-전영옥'), '가리기를 끄면 실제 이름');
const none = T.buildMessage({ name: '박란영', errors: [], warns: [], missing: [] }, { dateLabel: '10/3' }); assert.ok(none.includes('확인할 항목이 없어요'));
// ④ 파트(OT/PT/ST): 액팅 기록의 다수 오더 종류 → 없으면 오류 항목 → 미액팅만 있으면 OT → 기타
const parts = T.groupByTherapist({ issues, missing, acts: [
  { therapist: '배민지', group: 'OT' }, { therapist: '배민지', group: 'OT' }, { therapist: '배민지', group: 'PT' },
  { therapist: '김민영', group: '언어/심리' }, { therapist: '정유정', group: 'OT' }] });
const pOf = (n) => parts.find(r => r.name === n).part;
assert.strictEqual(pOf('배민지'), 'OT'); assert.strictEqual(pOf('김민영'), 'ST'); assert.strictEqual(pOf('정유정'), 'OT'); assert.strictEqual(pOf(T.UNKNOWN), '기타');
const fb = T.groupByTherapist({ issues: [{ therapist: '한PT', orderGroup: 'PT', severity: '오류', time: '09:00' }], missing: [{ therapist: '류OT', name: 'a', timeSlot: '09:00' }] });
assert.strictEqual(fb.find(r => r.name === '한PT').part, 'PT'); assert.strictEqual(fb.find(r => r.name === '류OT').part, 'OT');
console.log('therapistview: OK');
