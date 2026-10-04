// scripts/set-release-notes.js — CHANGELOG.md의 해당 버전 내용을 GitHub 릴리즈 본문에 올린다(앱의 "업데이트 로그"에 보임).
//   node scripts/set-release-notes.js          현재 package.json 버전
//   node scripts/set-release-notes.js 0.6.1    지정 버전
//   node scripts/set-release-notes.js --all    CHANGELOG의 모든 버전(이미 낸 릴리즈에 노트를 채울 때)
// gh(GitHub CLI) 로그인 또는 GH_TOKEN이 필요하다. 실패해도 릴리즈 흐름을 막지 않도록 항상 종료코드 0.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// "## 0.6.2 (날짜)" 구역의 본문(제목 줄 제외)을 돌려준다. 없으면 null.
function sectionFor(text, version) {
  const lines = String(text).split(/\r?\n/); const out = []; let on = false;
  for (const l of lines) {
    const m = /^##\s+v?(\d+\.\d+\.\d+)\b/.exec(l);
    if (m) { if (on) break; on = m[1] === version; continue; }
    if (on) out.push(l);
  }
  const body = out.join('\n').trim();
  return on || body ? body || null : null;
}
const versionsIn = (text) => [...String(text).matchAll(/^##\s+v?(\d+\.\d+\.\d+)\b/gm)].map(m => m[1]);

if (require.main === module) {
  try {
    const root = path.join(__dirname, '..');
    const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const arg = process.argv[2];
    const versions = arg === '--all' ? versionsIn(text) : [arg || require(path.join(root, 'package.json')).version];
    for (const v of versions) {
      const body = sectionFor(text, v);
      if (!body) { console.log(`v${v}: CHANGELOG.md에 내용이 없어 건너뜀`); continue; }
      const tmp = path.join(require('os').tmpdir(), `rehab-notes-${v}.md`); fs.writeFileSync(tmp, body);
      try { execFileSync('gh', ['release', 'edit', `v${v}`, '--repo', 'dop4773-ops/rehab-hub', '--notes-file', tmp], { stdio: 'pipe' }); console.log(`v${v}: 릴리즈 노트 등록`); }
      catch (e) { console.log(`v${v}: 등록 실패(${String(e.stderr || e.message).trim().split('\n')[0]})`); }
    }
  } catch (e) { console.log('릴리즈 노트 등록 중 오류:', e.message); }
}
module.exports = { sectionFor, versionsIn };
