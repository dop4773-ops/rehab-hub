// test_homeboard.js — 홈 현황판 계산(입퇴원·회복기 종료 임박) 확인. 실행: node main/test_homeboard.js
const assert = require('assert');
const H = require('../renderer/core/homeboard.js');
const today = new Date(2026, 9, 16), t = H.serialOf(today);
assert.strictEqual(t, 46311, '2026-10-16 엑셀 일련번호');
assert.strictEqual(H.wardOf('502'), '5'); assert.strictEqual(H.wardOf('1003'), '10'); assert.strictEqual(H.wardOf(''), '');
assert.strictEqual(H.dischargeOf('10/20 퇴원(오전O)', today).off, 4);
assert.strictEqual(H.dischargeOf('10/20 퇴원(오전O)', today).text, '오전O');
assert.strictEqual(H.dischargeOf('4/29 퇴원/5/2 재입원', today), null, '돌아온 환자');
assert.strictEqual(H.dischargeOf('3/30 퇴원', today), null, '지난 퇴원');
assert.strictEqual(H.dischargeOf('', today), null);
assert.strictEqual(H.dischargeOf('12/30 퇴원', today).off, 75, '연말 퇴원');
const P = (o) => ({ admit: '입원', note: '', gubun: '일반', dept: 'RM7', room: '502', endDate: null, admDate: t - 30, ...o });
const r = H.summarize([
  P({ name: 'a', gubun: '뇌손상', endDate: t + 3 }), P({ name: 'b', gubun: 'MSK 60', endDate: t - 2, room: '1003' }), P({ name: 'c', gubun: '뇌손상', endDate: t + 40 }),
  P({ name: 'd', admDate: t }), P({ name: 'e', admDate: t + 1 }), P({ name: 'f', note: '10/16 퇴원(오후O)' }), P({ name: 'g', note: '10/17 퇴원' }), P({ name: 'h', note: '10/20 퇴원' }),
  P({ name: 'i', admit: '퇴원', gubun: '뇌손상', endDate: t }), P({ name: 'j', admit: '재입원', gubun: '척수손상', endDate: t + 1 }), P({ name: 'k', admit: '외래' }),
], today);
assert.strictEqual(r.total, 9, '입원·재입원만 재원');
assert.deepStrictEqual(r.ending.map(e => e.name), ['b', 'j', 'a', 'c'], '종료일 빠른 순, 일반 제외, 지난 종료일 맨 앞');
assert.strictEqual(r.ending[0].left, -2); assert.strictEqual(r.ending[0].ward, '10');
assert.strictEqual(r.soon, 3);
assert.deepStrictEqual(r.adm.map(e => e.name + e.off), ['d0', 'e1']);
assert.deepStrictEqual(r.dis.map(e => e.name + e.off), ['f0', 'g1'], '오늘·내일 퇴원 예정만');
// 평가(TEST) 표시 대조
const names = ['12월31일 (수)', '10월6일(화)', '10월13일 (화)', '10월16일(금)', '1월6일(화)'];
assert.strictEqual(H.sheetFor(names, '2026-10-13'), '10월13일 (화)', '날짜 사이 공백 허용');
assert.strictEqual(H.sheetFor(names, '2026-10-06'), '10월6일(화)'); assert.strictEqual(H.sheetFor(names, '2026-12-31'), '', '12/31 (수)는 2025년 시트 — 2026-12-31은 목요일'); assert.strictEqual(H.sheetFor(names, '2025-12-31'), '12월31일 (수)');
assert.strictEqual(H.sheetFor(names, '2026-10-19'), '', '아직 안 만든 날짜'); assert.strictEqual(H.sheetFor(names, '2026-01-06'), '1월6일(화)', '1월과 10월 구분');
const T = ['이정홍 TEST', '장재복A\r\nTEST', '김영미 ST\r\nT-3', '이종철A Test', '박란영 ST'];
assert.strictEqual(H.testState(T, '이정홍'), 'ok'); assert.strictEqual(H.testState(T, '장재복A'), 'ok', '줄바꿈 뒤 TEST');
assert.strictEqual(H.testState(T, '이종철A'), 'ok', '대소문자 무관'); assert.strictEqual(H.testState(T, '김영미'), 'notest', '이름은 있는데 TEST 없음');
assert.strictEqual(H.testState(T, '정도운'), 'missing'); assert.strictEqual(H.testState(['이 정홍TEST'], '이정홍'), 'ok', '공백 무시');
console.log('test_homeboard OK');
