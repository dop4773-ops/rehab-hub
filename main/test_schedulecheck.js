// test_schedulecheck.js — 시간표 파일 관리 점검(오늘 시트 · 낡은 제목 날짜 · 로봇재활 종료일). 실행: node main/test_schedulecheck.js
'use strict';
const assert = require('assert'); const S = require('../renderer/core/schedulecheck.js'); const D = require('../renderer/core/dailyplan.js');
// 글자 → 날짜
assert.deepStrictEqual(S.titleDate('미래병원 3층 - 2026년 9월 2일 수요일 전기시간표'), { m: 9, d: 2 }); assert.deepStrictEqual(S.titleDate('2026년 10월 15일 목요일 시간표'), { m: 10, d: 15 });
assert.strictEqual(S.titleDate('미래병원 - 2026년 월 일 요일 시간표'), null, '빈 날짜는 낡은 게 아니라 아직 안 적은 것'); assert.strictEqual(S.titleDate('미래병원 - 토요일(10층)'), null); assert.strictEqual(S.titleDate(null), null);
assert.strictEqual(S.excelDate(46155), '2026-05-13'); assert.strictEqual(S.excelDate('46339'), '2026-11-13'); assert.strictEqual(S.excelDate(45658), '2025-01-01'); assert.strictEqual(S.excelDate(5), ''); assert.strictEqual(S.excelDate('가'), '');
// 오늘 시트 · 낡은 제목
const files = [
  { label: '10층 물리치료시간표', sheetNames: ['9.30수', '10.14수', '10.15목', '원본'], titlesBySheet: { '10.15목': ['미래병원 - 2026년 10월 15일 목요일 시간표'] } },
  { label: '3층 기구시간표', sheetNames: ['10.14수', '10.15목'], titlesBySheet: { '10.15목': ['미래병원 3층 - 2026년 9월 2일 수요일 전기시간표', '미래병원 3층 - 2026년 10월 기구시간표'] } },
  { label: '작업치료실 시간표', sheetNames: ['10월14일(수)'], titlesBySheet: {} },
  { label: '3층 물리치료시간표', sheetNames: ['10.15목'], titlesBySheet: { '10.15목': ['미래병원 - 2026년 월 일 요일 시간표'] } },
];
let r = S.checkSheets({ files, today: '2026-10-15', hour: 10, sheetsForDate: D.sheetsForDate });
assert.deepStrictEqual(r.map(x => x.file + ':' + x.kind), ['3층 기구시간표:stale-title', '작업치료실 시간표:nosheet'], '낡은 제목은 3층 기구시간표 하나(빈 날짜·10월만 적힌 제목은 제외), 시트 없음은 작업치료실 시간표');
assert.ok(/9월 2일이 그대로 남아/.test(r[0].text)); assert.ok(/오늘\(10\/15\) 날짜 시트가 없어요/.test(r[1].text));
assert.strictEqual(S.checkSheets({ files, today: '2026-10-15', hour: 8, sheetsForDate: D.sheetsForDate }).some(x => x.kind === 'nosheet'), false, '아침 9시 전에는 아직 안 만들었을 수 있어 알리지 않음');
assert.strictEqual(S.checkSheets({ files, today: '2026-10-17', hour: 12, sheetsForDate: D.sheetsForDate }).some(x => x.kind === 'nosheet'), false, '토요일은 평일 시트를 요구하지 않음');
assert.strictEqual(S.checkSheets({ files, today: '2026-10-18', hour: 12, sheetsForDate: D.sheetsForDate }).length, 0, '일요일');
assert.deepStrictEqual(S.checkSheets({ files: [], today: '2026-10-15', sheetsForDate: D.sheetsForDate }), []); assert.deepStrictEqual(S.checkSheets({ today: '2026-10-15', sheetsForDate: D.sheetsForDate }), []);
// 로봇재활 표
const mk = (rows) => { const maxRow = Math.max(...Object.keys(rows).map(Number)), maxCol = Math.max(...Object.values(rows).flatMap(o => Object.keys(o).map(Number))); return { get: (a, b) => (rows[a] && rows[a][b]) || '', maxRow, maxCol }; };
const g = mk({
  37: { 1: '로봇 재활 대기 명단', 8: '로봇 재활 추가 대상' },
  38: { 1: '담당주치의', 2: '성함', 3: 'R-bot', 4: '모닝워커', 5: '시작일', 6: '종료일', 8: '담당주치의', 9: '성함', 10: '알봇', 11: '모닝워크', 12: '시작일', 13: '종료일' },
  39: { 8: 'RM6', 9: '임원식', 10: '○', 12: 46155, 13: 46339 },
  40: { 8: 'RM8', 9: '오옥주 3F', 11: '○', 12: 46223, 13: 46406 },
  41: { 8: 'RM7', 9: '김명자(5병동)', 10: '○', 12: 46133, 13: 46316 },
  42: { 8: 'RM4', 9: '장순달', 10: '○', 12: 46310, 13: 46125 },
  44: { 8: '로봇 재활 D/C' },
  45: { 8: '담당주치의', 9: '성함', 10: 'R-bot', 12: '시작일', 13: '종료일' },
  46: { 8: 'RM4', 9: '변경주', 10: '○', 12: 46058, 13: 46239 },
});
const rows = S.parseRobot(g);
assert.deepStrictEqual(rows.map(x => x.name + ':' + x.end), ['임원식:2026-11-13', '오옥주:2027-01-19', '김명자:2026-10-21', '장순달:2026-04-13'], '이름의 3F·병동 표기는 떼고, 「로봇 재활 D/C」 표(이미 끝난 사람)는 읽지 않는다');
const al = S.robotAlerts(rows, '2026-10-28', 3); assert.deepStrictEqual(al.map(x => x.name + ':' + x.left), ['김명자:-7'], '종료일이 지났거나 3일 안인 사람(지난 지 오래된 순) — 시작보다 종료가 빠른 장순달은 입력 실수로 건너뜀');
assert.deepStrictEqual(S.robotAlerts(rows, '2026-10-19', 3).map(x => x.name + ':' + x.left), ['김명자:2'], '종료 2일 전이면 임박');
assert.deepStrictEqual(S.robotAlerts(rows, '2026-10-15', 3).map(x => x.name), [], '김명자(10/21 종료)는 아직 6일 남음');
assert.deepStrictEqual(S.robotAlerts([], '2026-10-20'), []); assert.deepStrictEqual(S.parseRobot(mk({ 1: { 1: '아무것도' } })), []);
console.log('schedulecheck: OK');
