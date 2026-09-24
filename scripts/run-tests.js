// scripts/run-tests.js — main/test_*.js를 전부 순서대로 실행한다. (실행: npm test)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const mainDir = path.join(__dirname, '..', 'main');
const testFiles = fs.readdirSync(mainDir).filter(f => f.startsWith('test_') && f.endsWith('.js'));

let failed = 0;
for (const f of testFiles) {
  console.log(`\n=== ${f} ===`);
  try {
    execFileSync('node', [path.join(mainDir, f)], { stdio: 'inherit' });
  } catch (e) {
    failed++;
  }
}
console.log(`\n${testFiles.length}개 중 ${testFiles.length - failed}개 통과`);
process.exit(failed ? 1 : 0);
