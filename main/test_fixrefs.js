// 실행: node main/test_fixrefs.js
// 불일치 → 칸 주소(renderer/core/fixrefs.js)를 가짜 현황판/카드/시간표/그리드 정보로 확인한다.
'use strict';
const assert = require('assert');
const { attachRefs, formatRefs, colLetter } = require('../renderer/core/fixrefs.js');
const { buildFixItems, fixItemsToText } = require('../renderer/core/fixplan.js');

assert.strictEqual(colLetter(1), 'A'); assert.strictEqual(colLetter(27), 'AA'); assert.strictEqual(colLetter(10), 'J');
const card = { name: '홍길동', sheet: '입원', headRow: 100, headCol: 1, entries: [{ time: '10:15', loc: 'B-22', row: 109, locRef: 'C109' }] };
const ctx = {
  status: { sheetName: '현황(회복기)', cols: { name: 'E', room: 'D', admit: 'H', dept: 'C', sot: 'J', rdt: 'K', erdt: 'L', ccrt: 'N', lang: 'O' },
    list: [{ name: '홍길동', row: 45 }], dischargedList: [{ name: '퇴원자', row: 300 }] },
  sched: { sheet: '6.9(1팀)', occ: [{ name: '홍길동', type: 'sot', timeKey: '10:15', time: '10:15~10:45', loc: 'B-22', therapist: '김A', ref: 'F14' }, { name: '홍길동', type: 'sot', timeKey: '13:00', time: '13:00~13:30', loc: 'B-1', therapist: '이B', ref: 'F20' }] },
  findCard: (n) => (n === '홍길동' ? card : null),
  gridEntries: () => [{ time: '10:15', loc: 'B-22', name: '김철수', ref: 'W12', sheet: '매트위치' }, { time: '10:15', loc: 'B-22', name: '홍길동', ref: 'W13', sheet: '매트위치' }],
};
const I = (detail, extra = {}) => ({ id: 'x', patient: '홍길동', floor: 10, title: '제목', line: '', detail, ...extra });
const run = (issue) => { attachRefs([issue], ctx); return issue.refs || []; };
const cells = (r, g) => (r.find(x => x.group === g) || {}).cells;

// 현황판 칸·평일시간표 칸·카드 칸
let r = run(I({ kind: 'count', field: 'SOT', expected: 3, actual: 5 })); assert.deepStrictEqual(cells(r, 'status'), ['J45'], '현황 SOT 칸'); assert.strictEqual(r.length, 2);
assert.deepStrictEqual(r.find(x => x.sheet === '6.9(1팀)').cells, ['F14', 'F20'], '평일시간표에서 그 환자의 SOT 칸 전부');
r = run(I({ kind: 'count', field: '언어', source: 'card' })); assert.deepStrictEqual(cells(r, 'status'), ['O45']); assert.deepStrictEqual(cells(r, 'card'), ['A101'], '카드 이름 칸 = 머리글 다음 줄');
r = run(I({ kind: 'room_mismatch', badStatus: true, badCard: true })); assert.deepStrictEqual(cells(r, 'status'), ['D45']); assert.deepStrictEqual(cells(r, 'card'), ['G101'], '카드 병실 칸 = 이름 칸에서 6열 오른쪽');
r = run(I({ kind: 'room_mismatch', badStatus: false, badCard: true })); assert(!cells(r, 'status') && cells(r, 'card'), '틀린 쪽만');
r = run(I({ kind: 'room_rm', vals: [{ name: '현황판', bad: true }, { name: '전체시간표', bad: true }, { name: '인수인계', bad: true }] })); assert.deepStrictEqual(cells(r, 'status'), ['C45']); assert.deepStrictEqual(cells(r, 'card'), ['A105'], '카드 RM 칸 = 이름 칸에서 4줄 아래');
r = run(I({ kind: 'discharge_notmarked' })); assert.deepStrictEqual(cells(r, 'status'), ['H45']);
r = run(I({ kind: 'discharge_stillactive' }, { patient: '홍길동' })); assert(cells(r, 'card'));
r = run(I({ kind: 'discharge_in_sched', sheet: '평일시간표(원본)' }, { patient: '퇴원자' })); assert.deepStrictEqual(cells(r, 'status'), ['H300'], '퇴원 행의 입원 칸');
// 위치: 카드 치료위치 칸 + 매트/테이블 칸, 평일시간표 위치
r = run(I({ kind: 'mismatch', time: '10:15', loc: 'B-22', gridNames: '김철수' })); assert.deepStrictEqual(cells(r, 'card'), ['A101', 'C109']); assert.deepStrictEqual(cells(r, 'grid'), ['W12', 'W13']);
r = run(I({ kind: 'missing', time: '10:15', loc: 'B-22' })); assert.deepStrictEqual(cells(r, 'grid'), ['W13'], '매트/테이블에서 그 환자 칸');
r = run(I({ kind: 'sched_mismatch', time: '10:15', scheduleLoc: 'B-22', cardLoc: 'B-9' })); assert.deepStrictEqual(cells(r, 'status'), ['F14']); assert.deepStrictEqual(cells(r, 'card'), ['A101', 'C109']);
r = run(I({ kind: 'therapist', kindLabel: '작업(SOT)', time: '13:00~13:30', origin: '이B' })); assert.deepStrictEqual(cells(r, 'status'), ['F20'], '그 시간·그 치료사의 칸');
// 못 찾으면 refs를 붙이지 않는다(인수인계·평가메인·카드 없는 환자)
assert.deepStrictEqual(run(I({ kind: 'handover_doctor' })), []); assert.deepStrictEqual(run(I({ kind: 'eval_missing' })), []); assert.deepStrictEqual(run(I({ kind: 'room_mismatch', badCard: true }, { patient: '카드없음' })), []);
console.log('OK ① 종류별 칸 주소');

// ② 지시 항목: 같은 파일 쪽 칸을 앞에, 다른 파일은 파일 이름을 붙임 · 복사 텍스트에 [칸: …]
const issue = I({ kind: 'mismatch', time: '10:15', loc: 'B-22', gridNames: '김철수', floor: 10 }, { id: 'a' }); attachRefs([issue], ctx);
const items = buildFixItems([issue]); assert.strictEqual(items[0].group, 'card');
assert.strictEqual(items[0].cellText, '입원 A101, C109 · 매트·테이블현황 매트위치 W12, W13'); assert(/\[칸: 입원 A101, C109/.test(fixItemsToText(items)));
const noRef = buildFixItems([I({ kind: 'handover_doctor', handoverDoctor: 'RM8', cardDoctor: 'RM9' })]); assert.strictEqual(noRef[0].cellText, ''); assert(!/\[칸:/.test(fixItemsToText(noRef)));
assert.strictEqual(formatRefs([{ group: 'card', sheet: '입원', cells: ['A1'] }], 'status', { card: '전체시간표' }), '전체시간표 입원 A1');
console.log('OK ② 지시서 반영');
console.log('ALL PASS');
