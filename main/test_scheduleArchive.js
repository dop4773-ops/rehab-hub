// 실행: node main/test_scheduleArchive.js
// saveSchedule/listSchedules/loadSchedules/deleteSchedule 왕복 + 잘못된 입력 방어를 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveSchedule, listSchedules, loadSchedules, deleteSchedule } = require('./scheduleArchive');

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-schedule-test-'));

// ① 저장 → 목록에 정확한 건수로 뜨는지
const day1 = [{ name: '김테스트1', reg: 'R1', rm: 'RM1', floor: 10, category: '입원', room: '1001', schedule: {} }];
const day2 = [
  { name: '김테스트1', reg: 'R1', rm: 'RM1', floor: 10, category: '입원', room: '1001', schedule: {} },
  { name: '박테스트2', reg: 'R2', rm: 'RM2', floor: 3, category: '입원', room: '301', schedule: {} },
];
saveSchedule(storeDir, '2026-09-23', day1);
saveSchedule(storeDir, '2026-09-24', day2);

let list = listSchedules(storeDir);
assert.strictEqual(list.length, 2, '저장한 날짜 2개가 전부 목록에 떠야 함');
assert.strictEqual(list[0].dateKey, '2026-09-24', '최신 날짜가 먼저 오도록 정렬');
assert.strictEqual(list[0].count, 2);
assert.strictEqual(list[1].count, 1);
console.log('OK ① 저장 후 목록에 날짜·건수 정확히 반영(최신순 정렬)');

// ② 여러 날짜를 한번에 불러오기 — 각 날짜의 환자 배열이 그대로 돌아오는지
const loaded = loadSchedules(storeDir, ['2026-09-23', '2026-09-24']);
assert.strictEqual(loaded.length, 2);
const byDate = Object.fromEntries(loaded.map(x => [x.dateKey, x.patients]));
assert.strictEqual(byDate['2026-09-23'].length, 1);
assert.strictEqual(byDate['2026-09-24'].length, 2);
assert.strictEqual(byDate['2026-09-24'][1].name, '박테스트2');
console.log('OK ② 여러 날짜 한번에 불러오기 정상');

// ③ 없는 날짜를 요청해도 죽지 않고 그냥 빠짐
const partial = loadSchedules(storeDir, ['2026-09-23', '2099-01-01']);
assert.strictEqual(partial.length, 1, '존재하지 않는 날짜는 결과에서 조용히 빠져야 함');
console.log('OK ③ 없는 날짜 요청 시 죽지 않고 있는 것만 반환');

// ④ 삭제
deleteSchedule(storeDir, '2026-09-23');
list = listSchedules(storeDir);
assert.strictEqual(list.length, 1, '삭제 후 목록에서 빠져야 함');
assert.strictEqual(list[0].dateKey, '2026-09-24');
console.log('OK ④ 삭제 정상 반영');

// ⑤ 잘못된 입력 방어 (날짜 형식, 환자 목록이 배열이 아님)
assert.throws(() => saveSchedule(storeDir, '2026/09/24', day1), /날짜 형식/, '잘못된 날짜 형식은 거부');
assert.throws(() => saveSchedule(storeDir, '2026-09-24', 'not-an-array'), /환자 목록/, '배열이 아닌 환자 목록은 거부');
console.log('OK ⑤ 잘못된 날짜 형식·환자 목록 방어');

// ⑥ 저장소 폴더가 아예 없을 때 listSchedules가 죽지 않고 빈 배열 반환
const emptyDir = path.join(storeDir, '____없음____');
assert.deepStrictEqual(listSchedules(emptyDir), [], '폴더가 없어도 빈 배열 반환');
console.log('OK ⑥ 저장소 폴더가 없을 때도 안전하게 빈 목록 반환');

fs.rmSync(storeDir, { recursive: true, force: true });
console.log('ALL PASS');
