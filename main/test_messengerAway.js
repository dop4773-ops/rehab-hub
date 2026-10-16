// 실행: node main/test_messengerAway.js — 메신저 외출·외박 정리(홈 요약·환자 검색용)
'use strict';
const assert = require('assert'); const M = require('../renderer/core/messengerAway.js');
const rows = [
  { patient: '나나나', category: '외출', reason: '', departureText: '10:00', returnText: '12:00', date: '2026-10-19', endDate: '2026-10-19' },
  { patient: '다다다', category: '외출', reason: '외진', departureText: '13:00', returnText: '', date: '2026-10-19', endDate: '2026-10-19' },
  { patient: '가가가', category: '외박', reason: '가족', departureText: '10:00', returnText: '17:00', date: '2026-10-19', endDate: '2026-10-21' },
  { patient: '이영호', category: '외출', reason: '', departureText: '', returnText: '', date: '2026-10-19', endDate: '2026-10-19' },
  { patient: ' ', category: '외출' },
];
const s = M.summarize(rows);
assert.deepStrictEqual(s.counts, { 외박: 1, 외진: 1, 외출: 2 });
assert.deepStrictEqual(s.items.map((x) => x.kind + ':' + x.name + ':' + x.time), ['외박:가가가:~10/21', '외진:다다다:13:00~', '외출:나나나:10:00~12:00', '외출:이영호:'], '외박→외진→외출 순, 이름 없는 행은 뺀다');
assert.deepStrictEqual(M.matchName(s.items, '나나나').map((x) => x.loose), [false]);
assert.deepStrictEqual(M.matchName(s.items, '이영호A').map((x) => x.name + x.loose), ['이영호true'], '글자(A) 없는 이름은 loose로');
assert.deepStrictEqual(M.matchName(s.items, '모르는'), []);
console.log('messengerAway: OK');
