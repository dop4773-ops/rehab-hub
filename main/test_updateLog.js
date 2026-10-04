// 실행: node main/test_updateLog.js
// 업데이트 기록 파일(최신순·200건 제한·깨진 파일 방어)과 GitHub 릴리즈 목록 정리·저장소 주소 만들기를 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readEntries, appendEntry, normalizeReleases, repoInfo, MAX_ENTRIES } = require('./updateLog');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-updlog-')), file = path.join(dir, 'sub', 'update-log.json');
// ① 없는 파일은 빈 목록, 추가하면 최신이 위, 폴더가 없어도 만든다
assert.deepStrictEqual(readEntries(file), []);
appendEntry(file, { event: 'check', source: '수동' }, 1000); appendEntry(file, { event: 'available', version: '0.6.2' }, 2000);
let list = readEntries(file); assert.deepStrictEqual(list.map(e => e.event), ['available', 'check']); assert.strictEqual(list[0].t, 2000); assert.strictEqual(list[0].version, '0.6.2');
// ② 200건 넘으면 오래된 것부터 잘라낸다
for (let i = 0; i < MAX_ENTRIES + 20; i++) appendEntry(file, { event: 'check' }, 3000 + i);
list = readEntries(file); assert.strictEqual(list.length, MAX_ENTRIES); assert.strictEqual(list[0].t, 3000 + MAX_ENTRIES + 19);
// ③ 깨진 파일은 빈 목록으로 시작(앱이 죽지 않음)
fs.writeFileSync(file, '{깨짐'); assert.deepStrictEqual(readEntries(file), []); appendEntry(file, { event: 'error', message: 'x' }, 1); assert.strictEqual(readEntries(file).length, 1);
console.log('OK ①~③ 업데이트 기록 파일');

// ④ 릴리즈 목록: 초안 제외, 최신순, v 접두어 제거, 본문 없으면 빈 문자열
const rel = normalizeReleases([
  { tag_name: 'v0.5.0', name: 'v0.5.0', published_at: '2026-10-04T07:04:08Z', body: null, html_url: 'u0', draft: false },
  { tag_name: 'v0.6.0', published_at: '2026-10-04T12:00:00Z', body: ' - 수정 지시서 \n', html_url: 'u1' },
  { tag_name: 'v0.7.0', published_at: '2026-10-05T00:00:00Z', draft: true },
]);
assert.deepStrictEqual(rel.map(r => r.version), ['0.6.0', '0.5.0'], '초안 제외·최신순'); assert.strictEqual(rel[0].body, '- 수정 지시서'); assert.strictEqual(rel[1].body, ''); assert.strictEqual(rel[0].name, 'v0.6.0');
assert.deepStrictEqual(normalizeReleases({ message: 'rate limit' }), [], 'API 오류 응답은 빈 목록');
// ⑤ 저장소 주소는 package.json 설정에서
const ri = repoInfo({ build: { publish: { provider: 'github', owner: 'o', repo: 'r' } } });
assert.strictEqual(ri.url, 'https://github.com/o/r'); assert.strictEqual(ri.releasesUrl, 'https://github.com/o/r/releases'); assert(/api\.github\.com\/repos\/o\/r\/releases/.test(ri.apiUrl));
assert.strictEqual(repoInfo({}), null); assert.strictEqual(repoInfo({ build: { publish: { provider: 's3' } } }), null);
assert.strictEqual(repoInfo(require('../package.json')).url, 'https://github.com/dop4773-ops/rehab-hub', '실제 설정과 일치');
console.log('OK ④⑤ 릴리즈 목록 정리·저장소 주소');
const { repoInfoOf } = require('./updateLog');
assert.deepStrictEqual(repoInfoOf({ name: 'x' }), repoInfo(require('../package.json')), '설치본처럼 build 항목이 없어도 같은 저장소 주소(package.json과 일치해야 함)');
console.log('OK ⑦ 설치본(build 항목 없음)에서도 저장소 주소를 찾음');
const pc = require('./updateLog').parseChangelog('# 제목\n\n## 0.6.3 (2026-10-05)\n- 가\n- 나\n\n## 0.6.2 (2026-10-04)\n- 다\n');
assert.deepStrictEqual(pc.map(r => [r.version, r.date, r.body]), [['0.6.3', '2026-10-05', '- 가\n- 나'], ['0.6.2', '2026-10-04', '- 다']]);
assert.strictEqual(pc[0].tag, 'v0.6.3');
assert.strictEqual(require('./updateLog').parseChangelog('내용 없음').length, 0);
console.log('OK ⑥ GitHub 연결 실패 시 보여줄 CHANGELOG 읽기');
console.log('ALL PASS');
