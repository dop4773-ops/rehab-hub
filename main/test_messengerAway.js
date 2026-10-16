// 실행: node main/test_messengerAway.js — 메신저 외출·외박 정리(홈 요약·환자 검색용)
'use strict';
const assert = require('assert'); const M = require('../renderer/core/messengerAway.js');
const base = { date: '2026-10-19', endDate: '2026-10-19' };
const rows = [
  { ...base, patient: '나나나', category: '외출', reason: '', departureText: '10:00', returnText: '12:00', room: '714호' },
  { ...base, patient: '다다다', category: '외출', reason: '외진', departureText: '13:00', returnText: '' },
  { ...base, patient: '가가가', category: '외박', reason: '가족', departureText: '10:00', returnText: '17:00', endDate: '2026-10-21' },
  { ...base, patient: '이영호', category: '외출', reason: '', departureText: '', returnText: '' },
  { ...base, patient: '바바바', category: '외출', reason: '', departureText: '09:30', returnText: '' },
  { ...base, patient: '사사사', category: '외출', reason: '', departureText: '오전(시간미정)', returnText: '' },
  { patient: ' ', category: '외출' },
];
const s = M.summarize(rows);
assert.deepStrictEqual(s.counts, { 외박: 1, 외진: 1, 외출: 4 });
assert.deepStrictEqual(s.items.map((x) => x.kind + ':' + x.name + ':' + x.time), [
  '외박:가가가:10/19~10/21 외박 (10/21 귀원)', '외진:다다다:13:00 나감 · 귀원 미정 → 오후 치료만', '외출:나나나:10:00~12:00', '외출:바바바:09:30 나감 · 귀원 미정 → 오전 치료만', '외출:사사사:오전 (시간 미정) → 오전 치료만', '외출:이영호:시간 미정 · 종일']);
assert.strictEqual(s.items.find((x) => x.name === '나나나').room, '714', '병실은 호를 떼고 보관');
assert.deepStrictEqual(M.matchName(s.items, '나나나').map((x) => x.loose), [false]);
assert.deepStrictEqual(M.matchName(s.items, '이영호A').map((x) => x.name + x.loose), ['이영호true'], '글자(A) 없는 이름은 loose로');
assert.deepStrictEqual(M.matchName(s.items, '모르는'), []);
assert.strictEqual(M.describe({ ...base, category: '외박' }, '외박'), '하루 외박(종일)');
console.log('messengerAway: OK');
