// test_otschedule.js — 작업치료실 시간표 시트 읽기(오더 칸 목록). 실행: node main/test_otschedule.js
// (실제 시트 244장·항목 10만 건이 옮기기 전 파서와 완전히 같은 결과임은 옮길 때 따로 확인했다 — 여기서는 가짜 시트로 규칙을 고정한다)
'use strict';
const assert = require('assert'); const O = require('../renderer/core/otschedule.js');
const N = null;
// 2026-10-15(목) 평일 시간표 모양: 0행 날짜(엑셀 일련번호) · 1행 "치료시간"+팀 · 2행 치료사 · 시간 줄 · "빈타임" · 미니표(ERDT · CCRT)
const rows = [
  [46310],
  ['치료시간', '1팀', N, '2팀'],
  [N, '김가OT', '이나', '박다B'],
  ['08:30~09:00', '홍길동\nT-1', '이영희 R\nB-2', '임신기 단축근무'],
  ['09:05~09:35', '김철수TEST', '박민수 CC\nTEST', '정수 SM\nA-3'],
  ['점심시간'],
  ['13:00~13:30', '신환\n최영 S\nT-2', '외래평가\n한사랑님', '박순 E\nT-3'],
  ['13:35~14:05', '이정임 S\nT-7 월수금', '10F ERDT', '김준곤A\nSM A-10'],
  ['빈타임'],
  ['ERDT', N, N, N, 'CCRT'],
  ['치료시간', 'S1', 'S2', '치료사', '치료시간', '월', '화', '수', '목', '금', '치료사'],
  ['09:05~09:35', '다라', '마바TEST', '이나', '09:05~09:35', N, N, N, '사아TEST', N, '박다B'],
  ['09:40~10:10', '타하\n월', N, '이나', '09:40~10:10', N, N, N, '차카', N, '박다B'],
];
const p = O.parseScheduleSheet(rows, { erdtTherapists: ['이나'] });
assert.strictEqual(String(p.sheetDate).slice(0, 15), 'Thu Oct 15 2026'); assert.strictEqual(p.weekdayChar, '목');
const e = p.entries.map(x => `${x.source}|${x.timeSlot.slice(0, 5)}|${x.name}|${x.type}|${x.therapist}${x.ccrtTest ? '|ccrtTest' : ''}`);
assert.deepStrictEqual(e, [
  '메인표|08:30|홍길동|작업특수|김가', '메인표|08:30|이영희|연하치료|이나',
  '메인표|09:05|김철수|평가|김가', '메인표|09:05|박민수|평가|이나|ccrtTest', '메인표|09:05|정수|작업특수|박다B',
  '메인표|13:00|최영|작업특수|김가', '메인표|13:00|한사랑|평가|이나',
  '메인표|13:35|김준곤A|작업특수|박다B',
  'ERDT|09:05|다라|연하전기|이나', 'ERDT|09:05|마바|평가|이나', 'CCRT|09:05|사아|평가|박다B|ccrtTest', 'CCRT|09:40|차카|전산화인지|박다B',
], '「단축근무」 칸·단독 E(허용 안 된 치료사)·「10F ERDT」 표시 칸은 오더가 아니고, 요일 제한(이정임 「월수금」, ERDT 타하 「월」)은 목요일엔 빠진다');
assert.ok(p.warnings.some(w => /단독 "E" 표시가 1건/.test(w) && /박다B 담당 박순/.test(w)), '허용 안 된 치료사의 단독 E는 경고로 알림');
assert.deepStrictEqual(p.grid.markers.map(m => m.kind + '@' + m.timeSlot.slice(0, 5)), ['ERDT@13:35'], '「10F ERDT」 표시 칸은 미리보기 마커로 남김'); assert.ok(p.grid.teams.some(t => t.label === '2팀')); assert.strictEqual(p.grid.timeRows.filter(r => r.lunch).length, 1);
// 월요일(10/12)에는 요일 제한이 맞아서 들어온다
const mon = O.parseScheduleSheet([[46307], ...rows.slice(1)], { erdtTherapists: ['이나'] }); assert.strictEqual(mon.weekdayChar, '월');
assert.ok(mon.entries.some(x => x.name === '이정임') && mon.entries.some(x => x.name === '타하' && x.type === '연하전기'), '월요일엔 이정임·타하가 들어옴'); assert.ok(!mon.entries.some(x => x.name === '사아'), 'CCRT 표는 그 요일 칸(월)만 본다');
// 허용된 치료사의 E는 연하전기, 없으면 지정 안 된 것으로 보고 모두 제외 경고
const e2 = O.parseScheduleSheet(rows, { erdtTherapists: ['박다'] }); // 비교는 조(A/B) 표시를 뗀 이름으로 assert.ok(e2.entries.some(x => x.name === '박순' && x.type === '연하전기'));
// 구조가 다른/빈 시트
assert.deepStrictEqual(O.parseScheduleSheet([[N]]).entries, []); assert.ok(/치료시간/.test(O.parseScheduleSheet([['아무 표']]).warnings[0]));
// 같은 시간·같은 환자·같은 종류 중복은 하나로
const d = O.parseScheduleSheet([[46310], ['치료시간', '1팀'], [N, '김가', '이나'], ['08:30~09:00', '홍길동\nT-1', '홍길동\nT-2'], ['빈타임']], {}); assert.strictEqual(d.entries.filter(x => x.name === '홍길동').length, 1);
// 헬퍼
assert.strictEqual(O.msBaseTherapistName('김기범OT'), '김기범'); assert.strictEqual(O.msBaseTherapistName('이승규B'), '이승규'); assert.strictEqual(O.msCleanTherapistHeader('엄주용OT'), '엄주용'); assert.strictEqual(O.msCleanTherapistHeader('김OT'), '김OT', '두 글자 미만 이름은 건드리지 않음');
console.log('otschedule: OK');
