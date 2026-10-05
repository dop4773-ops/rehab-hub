// 실행: node main/test_actingSchedule.js
// 치료기록 QA의 시간표 파서(msParseScheduleSheet)를 HTML에서 잘라 내 평일/토요일·공휴일 형식을 가짜 데이터로 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../renderer/tools/치료_액팅_기록_오류_확인_프로그램_언어분류.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, `marker 없음: ${a}`); return html.slice(i, j); };
const ctx = { console }; vm.createContext(ctx);
vm.runInContext([
  cut('function excelDateToJSDate', 'function pad2'), 'function pad2(n){ return String(n).padStart(2,"0"); }',
  'const WEEKDAY_CHARS = ["일","월","화","수","목","금","토"];',
  cut('function msNormText', '// FMA·수지기능'),
  cut('// 같은 환자·같은 시간대·같은 치료 유형이', '// 카톡 텍스트용'),
  cut('function msExcelSerialToDate', '// 일부 한글 오피스'),
  'this.parse = msParseScheduleSheet; this.ymd = msYmd;',
].join('\n'), ctx);
const parse = (rows) => ctx.parse(rows);
const byName = (r, n) => r.entries.filter(e => e.name === n);
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); // vm 안에서 만든 배열은 prototype이 달라 deepStrictEqual 대신 JSON으로 비교
const pad = (arr, n) => arr.concat(Array(Math.max(0, n - arr.length)).fill(null));

// ① 토요일/공휴일 형식 — 치료사 이름이 "치료시간" 줄에 있고, ERDT 표가 메인 표 오른쪽에 붙어 있음
const sideRows = [
  pad(['2026-10-03 작업치료실 토요일 시간표', null, null, null, null, 'ERDT'], 12),
  ['치료시간', '이승규', '김기범OT', '박모모', null, '치료시간', '치료사', 'S1', 'S2', '치료사', 'S3'],
  ['08:30~09:00', '홍길동 E', '가나다 ST', '사아자 CC', null, '08:30~09:00', '박모모', '환자일', '환자이', '김기범OT', '환자삼'],
  ['09:05~09:35', null, '3F\n아자차CC', '카타파 CC\nTEST', null, '09:05~09:35', null, null, null, null, null],
  ['10:15~10:45', null, '3F ERDT', '10층 ERDT', null, '10:15~10:45', null, null, null, null, null],
  ['10:50~11:20', 'ERDT', '마바사\nMSK', '아자 R', null, '10:50~11:20', null, null, null, null, null],
];
let r = parse(sideRows);
assert.strictEqual(ctx.ymd(r.sheetDate), '2026-10-03');
assert.strictEqual(r.weekdayChar, '토');
same(r.grid.therapistCols.map(t => t.name), ['이승규', '김기범OT', '박모모'], '오른쪽 ERDT 표의 머리글이 치료사 칸으로 잡히면 안 됨');
assert.strictEqual(byName(r, '홍길동')[0].type, '연하전기', '이승규 칸의 E = 연하전기');
assert.strictEqual(byName(r, '가나다')[0].type, '작업특수');
assert.strictEqual(byName(r, '사아자')[0].type, '전산화인지', 'CC = 전산화인지');
assert.strictEqual(byName(r, '아자차')[0].type, '전산화인지', '병동(3F) 줄은 환자명이 아니다');
assert.strictEqual(byName(r, '카타파')[0].type, '평가', 'CC + TEST = 평가');
assert.strictEqual(byName(r, '마바사')[0].type, '작업특수', '둘째 줄이 MSK면 작업특수');
assert.strictEqual(byName(r, '아자')[0].type, '연하치료');
assert(!r.entries.some(e => /ERDT|3F|10층/.test(e.name)), '병동 ERDT/단독 ERDT 칸은 환자가 아니다');
assert.strictEqual(byName(r, '환자삼')[0].therapist, '김기범OT', 'S3는 두 번째 "치료사" 칸의 치료사 소속');
assert.strictEqual(byName(r, '환자일')[0].therapist, '박모모');
assert(byName(r, '환자일')[0].conflict, '박모모가 같은 시간에 메인 표에서 다른 환자를 보면 시간 충돌');
assert.strictEqual(byName(r, '환자이')[0].conflict && byName(r, '환자이')[0].conflict.withName, '사아자');
// 메인 표의 "3F ERDT / 10층 ERDT / ERDT" 표시 칸은 환자가 아니지만 미리보기에서 보여줄 수 있게 마커로 남긴다
same(r.grid.markers.map(m => [m.therapist, m.timeSlot, m.kind]), [['김기범OT', '10:15~10:45', 'ERDT'], ['박모모', '10:15~10:45', 'ERDT'], ['이승규', '10:50~11:20', 'ERDT']], '병동 ERDT·단독 ERDT 칸이 마커로 기록됨');
assert(r.grid.markers.every(m => m.row > 0 && m.col > 0 && m.label), '마커에 위치·표기 글자가 있어야 함');
console.log('OK ① 토요일/공휴일(ERDT 표 옆) 형식 + ERDT 표시 칸 마커');

// ② 토요일 옛 형식 — ERDT 표가 메인 표 아래, 그 시간대 줄이 메인 표로 읽히면 안 됨
const belowRows = [
  ['2025-12-19', null, null],
  [null, 'B조', null],
  ['치료시간', '이승규B', '김가연B'],
  ['08:30~09:00', '홍길동E', '가나다 S\n(T)'],
  ['09:05~09:35', 'ERDT', '사아자 S\n(M)'],
  [null, null, null],
  ['ERDT', null, null],
  ['치료시간', '치료사', 'S1'],
  ['08:30~09:00', '김가연B', '환자일'],
  ['09:05~09:35', '이승규B', '환자이'],
];
r = parse(belowRows);
assert.strictEqual(ctx.ymd(r.sheetDate), '2025-12-19');
assert.strictEqual(r.entries.filter(e => e.source === '메인표').length, 3, '아래쪽 ERDT 표의 시간대 줄을 메인 표로 읽으면 안 됨');
same(r.entries.filter(e => e.source === 'ERDT').map(e => e.name).sort(), ['환자이', '환자일']);
assert.strictEqual(byName(r, '홍길동')[0].type, '연하전기', '이승규B(조 표기) = 이승규');
console.log('OK ② 토요일 옛 형식(ERDT 표 아래)');

// ③ 평일 형식 — 치료사 줄이 한 줄 아래, 빈타임 행 아래에 ERDT 표 (기존 동작 그대로)
const weekdayRows = [
  ['2026-10-02', null, null],
  ['작업치료실', null, null],
  ['치료시간', '팀 구분', '1팀'],
  [null, '이승규', '김봉선'],
  ['08:30~09:00', '외래평가\n홍길동님', '이정임 S\nT-7'],
  ['09:05~09:35', '외래', '가나다 ST\nT-1'],
  ['빈타임', null, null],
  ['10F) ERDT', null, null],
  ['치료시간', '치료사', 'S1'],
  ['08:30~09:00', '김봉선', '환자일'],
];
r = parse(weekdayRows);
assert.strictEqual(r.weekdayChar, '금');
same(r.grid.therapistCols.map(t => t.name), ['이승규', '김봉선']);
assert.strictEqual(byName(r, '홍길동')[0].type, '평가', '"외래평가\\n○○님"은 평가');
assert.strictEqual(byName(r, '이정임')[0].type, '작업특수', '"이름 S"는 이름만 떼어 작업특수');
assert.strictEqual(r.entries.filter(e => e.source === '메인표').length, 3, '"외래" 단독 칸은 건너뜀(외래평가+이정임+가나다)');
assert.strictEqual(byName(r, '환자일')[0].source, '10F) ERDT', '제목이 "10F) ERDT"인 표도 기존처럼 ERDT 구역으로 인식');
assert.strictEqual(byName(r, '환자일')[0].type, '연하전기');
console.log('OK ③ 평일 형식 유지 + 레거시 규칙(외래평가·이름 S·외래 단독)');

console.log('ALL PASS');
