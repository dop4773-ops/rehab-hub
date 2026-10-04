// 실행: node main/test_scan.js
// scanFolders가 실제 파일시스템에서 하위 폴더까지 훑어 역할별로 정확히 매칭하는지,
// 같은 역할에 파일이 여러 개일 때 더 최근 파일을 고르는지, 읽기 실패 폴더를 errors로 보고하는지 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanFolders, applyManualFiles } = require('./scan');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-scan-test-'));
const subDir = path.join(root, '하위폴더');
fs.mkdirSync(subDir);

fs.writeFileSync(path.join(root, '작업치료현황.xlsx'), 'x');
fs.writeFileSync(path.join(root, '아무거나.txt'), 'x'); // xlsx/xlsm 아니면 무시되어야 함
fs.writeFileSync(path.join(subDir, '10F 매트현황.xlsx'), 'x'); // 하위 폴더 1단계까지는 인식되어야 함

// 같은 역할(card3)에 두 파일 — mtime이 더 최근인 쪽이 선택돼야 한다.
const older = path.join(root, '3F 전체시간표_old.xlsx'); // "전체시간표"만 있어도 role은 card3로 잡힘
const newer = path.join(root, '3F 전체시간표_new.xlsx');
fs.writeFileSync(older, 'x');
fs.writeFileSync(newer, 'x');
const now = Date.now();
fs.utimesSync(older, new Date(now - 60000), new Date(now - 60000));
fs.utimesSync(newer, new Date(now), new Date(now));

// 일일통계: 일일통계/1팀·2팀·3팀 폴더 안에 이번 달 파일 + 연도별 보관 폴더 + 원본 파일이 섞여 있는 실제 구조
const statsRoot = path.join(root, '일일통계');
const NOW = new Date(2026, 8, 24); // 9월
for (const team of ['1팀', '2팀', '3팀']) {
  const td = path.join(statsRoot, team);
  fs.mkdirSync(path.join(td, '2025년'), { recursive: true });
  fs.writeFileSync(path.join(td, `미래병원_${team}_9월_일일통계.xlsm`), 'x');
  fs.writeFileSync(path.join(td, `미래병원_${team}_8월_일일통계.xlsm`), 'x'); // 지난달 — 무시
  fs.writeFileSync(path.join(td, `${team}_일일통계_원본.xlsm`), 'x'); // 달 표시 없는 원본 — 무시
  fs.writeFileSync(path.join(td, '2025년', `미래병원_${team}_9월_일일통계.xlsm`), 'x'); // 연도 보관 폴더 — 내려가지 않음
}
fs.writeFileSync(path.join(root, '~$작업치료현황.xlsx'), 'x'); // 엑셀 임시 잠금 파일 — 무시

const folders = [
  { id: '1', label: '테스트폴더', dirPath: root },
  { id: '2', label: '없는폴더', dirPath: path.join(root, '____없음____') },
];

const { matched, matchedAll, unmatched, errors } = scanFolders(folders, { now: NOW });

assert.strictEqual(matched.status && matched.status.name, '작업치료현황.xlsx', '최상위 파일 인식');
assert.strictEqual(matched.mat10 && matched.mat10.name, '10F 매트현황.xlsx', '하위 폴더 1단계 파일도 인식');
assert.strictEqual(matched.card3 && path.basename(matched.card3.path), '3F 전체시간표_new.xlsx', '같은 역할이면 더 최근 파일 선택');
assert.strictEqual(unmatched.filter(u => !/원본/.test(u.name)).length, 0, 'xlsx가 아닌 파일·임시 잠금 파일은 unmatched에도 안 잡히고 그냥 무시되어야 함');
assert(matched.status.size === 1 && typeof matched.status.mtimeMs === 'number', '변경 감지를 위한 크기·수정시각 포함');
assert.strictEqual(errors.length, 1, '읽을 수 없는 폴더는 errors에 기록');
assert.strictEqual(errors[0].folder, '없는폴더');
console.log('OK 하위폴더 포함 스캔·최신파일 우선·에러 폴더 보고 전부 정상');

assert.strictEqual(matchedAll.dailyStats.length, 3, '1·2·3팀 이번 달 일일통계 3개가 전부 잡혀야 함(역할 하나에 1개만 남으면 안 됨)');
assert.deepStrictEqual(matchedAll.dailyStats.map(e => e.name).sort(), ['미래병원_1팀_9월_일일통계.xlsm', '미래병원_2팀_9월_일일통계.xlsm', '미래병원_3팀_9월_일일통계.xlsm']);
assert(matchedAll.dailyStats.every(e => !e.path.includes('2025년')), '연도별 보관 폴더 안 파일은 제외');
console.log('OK 팀별 일일통계 3개 전부 인식·지난달/원본/연도 보관 폴더 제외');

// 직접 선택(PTA 재원현황처럼 매번 내려받아 넣는 파일): 폴더 매칭보다 우선하고, 사라진 파일은 폴더 결과를 유지하며 오류로 알림
const manualDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-manual-test-'));
const ptaFile = path.join(manualDir, '재원현황.xlsx');
fs.writeFileSync(ptaFile, 'xx');
const withManual = applyManualFiles(scanFolders(folders, { now: NOW }), {
  pta: [ptaFile],
  status: [path.join(manualDir, '없어진파일.xlsx')], // 사라진 파일 — 폴더에서 찾은 작업치료현황을 그대로 써야 함
  dailyStats: [path.join(root, '일일통계', '1팀', '미래병원_1팀_9월_일일통계.xlsm')],
});
assert.strictEqual(withManual.matched.pta.name, '재원현황.xlsx');
assert.strictEqual(withManual.matched.pta.manual, true);
assert.strictEqual(withManual.matched.status.name, '작업치료현황.xlsx', '사라진 직접 선택 파일 대신 폴더 결과 유지');
assert(withManual.errors.some(e => /없어진파일/.test(e.error)), '사라진 직접 선택 파일은 errors로 알림');
assert.strictEqual(withManual.matchedAll.dailyStats.length, 1, '직접 고른 일일통계는 폴더에서 찾은 3개 대신 그 파일만');
assert.deepStrictEqual(withManual.manualRoles.sort(), ['dailyStats', 'pta']);
console.log('OK 직접 선택 파일 우선·사라진 파일 방어·다중 역할 직접 선택');
fs.rmSync(manualDir, { recursive: true, force: true });

fs.rmSync(root, { recursive: true, force: true });
console.log('ALL PASS');
