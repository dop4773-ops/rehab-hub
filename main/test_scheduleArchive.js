// 실행: node main/test_scheduleArchive.js
// saveSchedule/listSchedules/loadSchedules/deleteSchedule 왕복(날짜+RM 단위) + 잘못된 입력 방어를 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveSchedule, listSchedules, loadSchedules, deleteSchedule, entryId } = require('./scheduleArchive');

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-schedule-test-'));

const day1rm1 = [{ name: '김테스트1', reg: 'R1', rm: 'RM1', floor: 10, category: '입원', room: '1001', schedule: {} }];
const day2rm1 = [
  { name: '김테스트1', reg: 'R1', rm: 'RM1', floor: 10, category: '입원', room: '1001', schedule: {} },
  { name: '박테스트2', reg: 'R2', rm: 'RM1', floor: 10, category: '입원', room: '1002', schedule: {} },
];
const day2rm2 = [{ name: '최테스트3', reg: 'R3', rm: 'RM2', floor: 3, category: '입원', room: '301', schedule: {} }];
const issues1 = { unmatched: [{ name: '전원의심', therapist: '박수현' }], notWritten: [] };

// ① 저장 → 같은 날짜라도 RM이 다르면 별도 항목으로 쌓이는지
const saved1 = saveSchedule(storeDir, { dateKey: '2026-09-23', rm: 'RM1', ward: '8병동', day: '수요일', hour: '09', routeKey: 'round1', patients: day1rm1, issues: issues1 });
saveSchedule(storeDir, { dateKey: '2026-09-24', rm: 'RM1', ward: '8병동', day: '목요일', hour: '09', routeKey: 'round1', patients: day2rm1 });
saveSchedule(storeDir, { dateKey: '2026-09-24', rm: 'RM2', ward: '5·7병동', day: '목요일', hour: '09', routeKey: 'round2', patients: day2rm2 });

let list = listSchedules(storeDir);
assert.strictEqual(list.length, 3, '날짜+RM 조합 3건이 전부 목록에 떠야 함');
assert.strictEqual(saved1.id, entryId('2026-09-23', 'RM1'));
assert.deepStrictEqual(list.find(x => x.id === saved1.id).issues, issues1, '미반영·미작성 스냅샷이 그대로 저장돼야 함');
console.log('OK ① 날짜+RM 단위로 별도 항목이 쌓이고, 미반영/미작성 스냅샷도 같이 저장됨');

// ② 같은 날짜 안에서 RM별로 병동/건수가 다르게 구분되는지
const d24 = list.filter(x => x.dateKey === '2026-09-24');
assert.strictEqual(d24.length, 2, '같은 날짜에 RM이 2개면 항목도 2개');
const byRm = Object.fromEntries(d24.map(x => [x.rm, x]));
assert.strictEqual(byRm.RM1.ward, '8병동');
assert.strictEqual(byRm.RM1.count, 2);
assert.strictEqual(byRm.RM2.ward, '5·7병동');
assert.strictEqual(byRm.RM2.count, 1);
console.log('OK ② 같은 날짜라도 RM별 병동·환자수가 각자 정확히 구분됨');

// ③ 여러 항목을 한번에 불러오기 — 전체 환자 목록·요일/회차까지 그대로 돌아오는지
const loaded = loadSchedules(storeDir, [saved1.id, byRm.RM2.id]);
assert.strictEqual(loaded.length, 2);
const byId = Object.fromEntries(loaded.map(x => [x.id, x]));
assert.strictEqual(byId[saved1.id].patients.length, 1);
assert.strictEqual(byId[byRm.RM2.id].routeKey, 'round2');
console.log('OK ③ 항목 여러 개를 한번에 불러와도 환자·회차 정보가 그대로 돌아옴');

// ④ 없는 id를 요청해도 죽지 않고 그냥 빠짐
const partial = loadSchedules(storeDir, [saved1.id, '2099-01-01__없음']);
assert.strictEqual(partial.length, 1, '존재하지 않는 항목은 결과에서 조용히 빠져야 함');
console.log('OK ④ 없는 항목 요청 시 죽지 않고 있는 것만 반환');

// ⑤ 삭제
deleteSchedule(storeDir, saved1.id);
list = listSchedules(storeDir);
assert.strictEqual(list.length, 2, '삭제 후 목록에서 빠져야 함');
assert.ok(!list.some(x => x.id === saved1.id));
console.log('OK ⑤ 삭제 정상 반영');

// ⑥ 잘못된 입력 방어 (날짜 형식, RM 없음, 환자 목록이 배열이 아님)
assert.throws(() => saveSchedule(storeDir, { dateKey: '2026/09/24', rm: 'RM1', patients: day1rm1 }), /날짜 형식/, '잘못된 날짜 형식은 거부');
assert.throws(() => saveSchedule(storeDir, { dateKey: '2026-09-24', rm: '', patients: day1rm1 }), /RM/, 'RM이 없으면 거부');
assert.throws(() => saveSchedule(storeDir, { dateKey: '2026-09-24', rm: 'RM1', patients: 'not-an-array' }), /환자 목록/, '배열이 아닌 환자 목록은 거부');
console.log('OK ⑥ 잘못된 날짜 형식·RM 누락·환자 목록 방어');

// ⑦ 저장소 폴더가 아예 없을 때 listSchedules가 죽지 않고 빈 배열 반환
const emptyDir = path.join(storeDir, '____없음____');
assert.deepStrictEqual(listSchedules(emptyDir), [], '폴더가 없어도 빈 배열 반환');
console.log('OK ⑦ 저장소 폴더가 없을 때도 안전하게 빈 목록 반환');

fs.rmSync(storeDir, { recursive: true, force: true });
console.log('ALL PASS');
