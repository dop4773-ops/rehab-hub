// test_verifyall.js — core/verifyall.js(교차검증 전체 검증 본체)가 화면 없이 Node에서 돌고, 파일이 하나도 없을 때 hooks 순서·결과 모양이 맞는지 확인한다.
// 실제 파일로 읽기·매칭까지 비교하는 점검은 scripts/golden.js(앱을 띄워 전후 비교)가 맡는다.
'use strict';
const assert = require('assert');
const V = require('../renderer/core/verifyall.js');
const names = require('fs').readFileSync(__dirname + '/../renderer/core/verifyall.js', 'utf8').match(/const \{ ([^}]+) \} = deps;/)[1].split(/,\s*/);
const boom = (n) => () => { throw new Error('파일이 없는데 ' + n + ' 호출'); };
const deps = Object.fromEntries(names.map(n => [n, boom(n)]));
Object.assign(deps, { attachRefs: () => {}, state: {}, normKey: (s) => String(s || '').replace(/\s+/g, ''), BUMPS: new Map() });
const log = [], sets = {};
const hooks = { waitHandover: async () => { log.push('wait'); }, begin: () => log.push('begin'), step: (id, cls) => log.push(`${id}:${cls || '-'}`), set: (k, v) => { sets[k] = v; }, publish: (s) => { sets.published = s; } };
(async () => {
  const r = await V.run(deps, hooks);
  assert.deepStrictEqual(log.slice(0, 2), ['wait', 'begin'], '인수인계 조회를 기다린 뒤 진행 표시를 켠다');
  for (const id of ['stepCount', 'stepLoc', 'stepTher']) assert(log.includes(`${id}:done`), id + ' 단계 완료 표시');
  assert(r && r.stats && r.floorCount, '결과 모양(stats·floorCount)');
  assert(Array.isArray(sets.issues) && sets.issues.length === 0, '파일이 없으면 불일치도 없음'); assert.strictEqual(sets.allDetected, sets.issues); assert.deepStrictEqual(sets.excludedIssues, []);
  assert(sets.published && sets.published === r.stats, '요약을 화면에 발행');
  assert(Array.isArray(sets.crossSkipNotes) && sets.crossSkipNotes.some(x => /인수인계/.test(x)), '건너뛴 검사 안내');
  assert(sets.previewStore && sets.previewCards && sets.previewSaturday && sets.previewDischarged && sets.crossInputs, '미리보기 값을 화면에 넘김');
  console.log('test_verifyall OK');
})().catch(e => { console.error(e); process.exit(1); });
