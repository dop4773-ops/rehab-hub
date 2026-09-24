// scripts/run-tests.js — main/test_*.js를 전부 순서대로 실행한다. (실행: npm test)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const mainDir = path.join(__dirname, '..', 'main');
const testFiles = fs.readdirSync(mainDir).filter(f => f.startsWith('test_') && f.endsWith('.js'));

// better-sqlite3는 electron-rebuild로 Electron의 ABI에 맞춰 빌드되어 있어 plain node로는 못 돌린다
// (NODE_MODULE_VERSION 불일치) — 그 모듈을 쓰는 테스트만 ELECTRON_RUN_AS_NODE로 Electron의 Node
// 런타임을 빌려서 실행한다.
const NEEDS_ELECTRON_RUNTIME = ['test_itdaInboxWriter.js'];
const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');

let failed = 0;
for (const f of testFiles) {
  console.log(`\n=== ${f} ===`);
  try {
    if (NEEDS_ELECTRON_RUNTIME.includes(f)) {
      execFileSync(electronBin, [path.join(mainDir, f)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    } else {
      execFileSync('node', [path.join(mainDir, f)], { stdio: 'inherit' });
    }
  } catch (e) {
    failed++;
  }
}
console.log(`\n${testFiles.length}개 중 ${testFiles.length - failed}개 통과`);
process.exit(failed ? 1 : 0);
