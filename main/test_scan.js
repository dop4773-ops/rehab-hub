// 실행: node main/test_scan.js
// scanFolders가 실제 파일시스템에서 하위 폴더까지 훑어 역할별로 정확히 매칭하는지,
// 같은 역할에 파일이 여러 개일 때 더 최근 파일을 고르는지, 읽기 실패 폴더를 errors로 보고하는지 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanFolders } = require('./scan');

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

const folders = [
  { id: '1', label: '테스트폴더', dirPath: root },
  { id: '2', label: '없는폴더', dirPath: path.join(root, '____없음____') },
];

const { matched, unmatched, errors } = scanFolders(folders);

assert.strictEqual(matched.status && matched.status.name, '작업치료현황.xlsx', '최상위 파일 인식');
assert.strictEqual(matched.mat10 && matched.mat10.name, '10F 매트현황.xlsx', '하위 폴더 1단계 파일도 인식');
assert.strictEqual(matched.card3 && path.basename(matched.card3.path), '3F 전체시간표_new.xlsx', '같은 역할이면 더 최근 파일 선택');
assert.strictEqual(unmatched.length, 0, 'xlsx가 아닌 파일은 unmatched에도 안 잡히고 그냥 무시되어야 함');
assert.strictEqual(errors.length, 1, '읽을 수 없는 폴더는 errors에 기록');
assert.strictEqual(errors[0].folder, '없는폴더');
console.log('OK 하위폴더 포함 스캔·최신파일 우선·에러 폴더 보고 전부 정상');

fs.rmSync(root, { recursive: true, force: true });
console.log('ALL PASS');
