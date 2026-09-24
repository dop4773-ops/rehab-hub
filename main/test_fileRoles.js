// 실행: node main/test_fileRoles.js
// 재활치료부 HTML판 core/test_folder_registry.js와 동일한 케이스로, 포팅한 fileRoles.js가
// 브라우저판과 똑같이 동작하는지 확인한다(회귀 방지 — 로직을 옮기며 실수로 바꾸지 않았는지).
'use strict';
const assert = require('assert');
const { guessFileRole, FILE_ROLES } = require('./fileRoles');

const REAL = [
  ['10F 환자전체시간표(원본).xlsx', 'card10'], ['3F 환자전체시간표(원본).xlsx', 'card3'],
  ['10F 매트현황.xlsx', 'mat10'], ['10F 테이블현황.xlsx', 'table10'], ['3F 매트,테이블현황.xlsx', 'mt3'],
  ['작업치료현황.xlsx', 'status'], ['작업치료실 시간표.xlsx', 'dailySchedule'],
];
for (const [name, role] of REAL) assert.strictEqual(guessFileRole(name), role, name);
console.log('OK 실제 파일', REAL.length, '개 전부 올바른 역할로 인식');

const GUESS = [
  ['OT 인수인계.xlsx', 'handover'], ['그랜드라운딩_RM9_2026-09-08.xlsx', 'grandSource'],
  ['일일통계.xlsx', 'dailyStats'], ['10F 물리치료시간표.xlsx', 'pt10'], ['3F 물리치료시간표.xlsx', 'pt3'],
  ['액팅오류.xlsx', 'acting'], ['담당자별 기록통계.xlsx', 'acting'],
];
for (const [name, role] of GUESS) assert.strictEqual(guessFileRole(name), role, name);
console.log('OK 이름 관례 추정', GUESS.length, '건');

assert.strictEqual(guessFileRole('10F 매트현황.xlsx'), 'mat10');
assert.strictEqual(guessFileRole('10F 테이블현황.xlsx'), 'table10');
assert.strictEqual(guessFileRole('3F 매트,테이블현황.xlsx'), 'mt3');
assert.strictEqual(guessFileRole('10F 환자전체시간표(원본).xlsx'), 'card10');
assert.strictEqual(guessFileRole('아무거나.xlsx'), null);
console.log('OK 충돌 우선순위 정상');

assert.strictEqual(guessFileRole('3F환자전체시간표(원본).xlsm'), 'card3');
assert.strictEqual(guessFileRole('10f 환자전체시간표(원본)'), 'card10');
console.log('OK 대소문자·공백·확장자 변형에도 동작');

const roleKeys = new Set(FILE_ROLES.map(r => r.key));
for (const [, role] of [...REAL, ...GUESS]) assert(roleKeys.has(role), role + '가 FILE_ROLES에 없음');
assert(FILE_ROLES.every(r => typeof r.required === 'boolean'), '모든 역할에 required 플래그가 있어야 함');
console.log('OK FILE_ROLES 목록/required 플래그 정상');

console.log('ALL PASS');
