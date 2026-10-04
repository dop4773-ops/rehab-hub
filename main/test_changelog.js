// 실행: node main/test_changelog.js — CHANGELOG.md 구역 추출과 "현재 버전이 CHANGELOG에 있는지" 확인
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sectionFor, versionsIn } = require('../scripts/set-release-notes.js');
const text = '# 내역\n설명\n\n## 0.2.0 (날짜)\n- 가\n- 나\n\n## 0.1.0 (날짜)\n- 다\n';
assert.strictEqual(sectionFor(text, '0.2.0'), '- 가\n- 나'); assert.strictEqual(sectionFor(text, '0.1.0'), '- 다'); assert.strictEqual(sectionFor(text, '9.9.9'), null);
assert.deepStrictEqual(versionsIn(text), ['0.2.0', '0.1.0']);
const real = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), ver = require('../package.json').version;
assert(sectionFor(real, ver), `CHANGELOG.md에 현재 버전(${ver}) 항목이 없습니다 — 릴리즈 전에 맨 위에 추가하세요`);
console.log('OK CHANGELOG 구역 추출·현재 버전 항목 존재');
console.log('ALL PASS');
