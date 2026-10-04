// 실행: node main/test_syncCore.js
// 파일 수정시각 vs 프로그램 반영시각 판정(최신/업데이트 필요/없음/오류/중)과 자동 동기화 주기 판단을 확인한다.
'use strict';
const assert = require('assert');
const S = require('../renderer/sync-core');

const e = (p, m, s = 10) => ({ path: p, name: p, mtimeMs: m, size: s });

// ① 같은 파일이면 서명이 같고, 수정시각이 바뀌면 달라진다
const scan1 = { matched: { status: e('a.xlsx', 1000) }, matchedAll: {} };
const scan2 = { matched: { status: e('a.xlsx', 2000) }, matchedAll: {} };
assert.strictEqual(S.roleSig(scan1, 'status'), S.roleSig({ matched: { status: e('a.xlsx', 1000) } }, 'status'));
assert.notStrictEqual(S.roleSig(scan1, 'status'), S.roleSig(scan2, 'status'));
assert.notStrictEqual(S.roleSig(scan1, 'status'), S.roleSig({ matched: { status: e('a.xlsx', 1000, 99) } }, 'status'), '크기만 달라져도 변경으로 본다');
console.log('OK ① 경로·수정시각·크기가 서명에 반영됨');

// ② 반영 서명과 같으면 최신, 파일이 더 최근에 수정됐으면 업데이트 필요(= "11:50 수정/11:45 반영")
const reflectedSig = S.roleSig(scan1, 'status');
assert.strictEqual(S.roleState({ sig: S.roleSig(scan1, 'status'), reflectedSig }), 'latest');
assert.strictEqual(S.roleState({ sig: S.roleSig(scan2, 'status'), reflectedSig }), 'stale');
assert.strictEqual(S.roleState({ sig: S.roleSig(scan2, 'status'), reflectedSig: undefined }), 'stale', '아직 한 번도 반영 안 했으면 업데이트 필요');
console.log('OK ② 파일이 반영 이후에 바뀌면 "최신"이 아니라 "업데이트 필요"');

// ③ 파일 없음/업데이트 중/읽기 오류 우선순위
assert.strictEqual(S.roleState({ sig: '', reflectedSig }), 'missing');
assert.strictEqual(S.roleState({ sig: 'x', reflectedSig: 'x', updating: true }), 'updating');
assert.strictEqual(S.roleState({ sig: 'x', reflectedSig: 'x', error: '읽기 실패' }), 'error', '읽기 오류가 최신 표시보다 우선');
assert.strictEqual(S.roleState({ sig: 'x', reflectedSig: 'y', updating: true, error: 'e' }), 'updating', '업데이트 중이면 이전 오류보다 우선');
console.log('OK ③ 파일 없음/업데이트 중/읽기 오류 상태 구분');

// ④ multi 역할(일일통계): 파일 하나만 바뀌어도 전체 서명이 달라지고, 순서와는 무관
const m1 = { matched: {}, matchedAll: { dailyStats: [e('1팀.xlsm', 1), e('2팀.xlsm', 2), e('3팀.xlsm', 3)] } };
const m1b = { matched: {}, matchedAll: { dailyStats: [e('3팀.xlsm', 3), e('1팀.xlsm', 1), e('2팀.xlsm', 2)] } };
const m2 = { matched: {}, matchedAll: { dailyStats: [e('1팀.xlsm', 1), e('2팀.xlsm', 2), e('3팀.xlsm', 99)] } };
assert.strictEqual(S.roleSig(m1, 'dailyStats'), S.roleSig(m1b, 'dailyStats'));
assert.notStrictEqual(S.roleSig(m1, 'dailyStats'), S.roleSig(m2, 'dailyStats'));
console.log('OK ④ 팀별 일일통계 여러 파일 중 하나만 바뀌어도 변경 감지');

// ⑤ 자동 동기화 주기
const now = 10 * 60000;
assert.strictEqual(S.isSyncDue({ mode: '5', now, lastSyncAt: now - 5 * 60000 }), true);
assert.strictEqual(S.isSyncDue({ mode: '5', now, lastSyncAt: now - 4 * 60000 }), false);
assert.strictEqual(S.isSyncDue({ mode: 'launch', now, lastSyncAt: 0 }), false, '앱 실행 시 모드는 주기 반영 없음');
assert.strictEqual(S.isSyncDue({ mode: 'manual', now, lastSyncAt: 0 }), false);
assert(S.isValidMode('30') && !S.isValidMode('7') && !S.isValidMode('constructor'), '잘못된 모드 값 방어');
console.log('OK ⑤ 자동 동기화 주기 판단·잘못된 설정값 방어');

console.log('ALL PASS');
