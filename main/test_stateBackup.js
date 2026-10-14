// test_stateBackup.js — 중요 기록 사본(되살리기·파일 저장). 실행: node main/test_stateBackup.js
'use strict';
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const B = require('../renderer/core/statebackup.js'); const F = require('./stateBackup.js');
const mem = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, raw: m }; };
// 스냅샷: 목록에 있는 키 중 값이 있는 것만
let s = mem({ rehab_settings_v1: '{"a":1}', rehab_home_memo_v1: '', rehab_cross_history_v1: '{"v":1}', 다른키: 'x', rehab_handover_cache_v1: '큰 캐시' });
assert.deepStrictEqual(B.snapshot(s), { rehab_settings_v1: '{"a":1}', rehab_cross_history_v1: '{"v":1}' }, '빈 값·목록에 없는 키(인수인계 캐시 등)는 뺌');
// 되살리기: 저장소에 없는 키만
const backup = { rehab_settings_v1: '{"a":2}', rehab_cross_exclude_v1: '{"k":1}', rehab_home_memo_v1: '메모', rehab_scale_v1: '', 다른키: 'x' };
const t = mem({ rehab_settings_v1: '{"a":9}', rehab_home_memo_v1: '' });
assert.deepStrictEqual(B.restoreMissing(t, backup).sort(), ['rehab_cross_exclude_v1', 'rehab_home_memo_v1'], '지금 값이 있는 설정은 덮어쓰지 않고, 비어 있던 메모와 없던 제외 기록만 되살림'); assert.strictEqual(t.raw.rehab_settings_v1, '{"a":9}'); assert.strictEqual(t.raw.rehab_home_memo_v1, '메모'); assert.strictEqual('다른키' in t.raw, false);
assert.deepStrictEqual(B.restoreMissing(mem(), null), []); assert.deepStrictEqual(B.restoreMissing(mem(), 'x'), []);
// 저장소가 못 읽고 못 쓰는 환경에서도 안 죽는다
const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } }; assert.deepStrictEqual(B.snapshot(broken), {}); assert.deepStrictEqual(B.restoreMissing(broken, backup), []);
assert.strictEqual(B.changed({ a: '1' }, { a: '1' }), false); assert.strictEqual(B.changed({ a: '1' }, { a: '2' }), true); assert.strictEqual(B.changed(null, {}), false);
// 파일 저장/읽기
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-state-'));
assert.deepStrictEqual(F.load(dir), {}, '파일이 없으면 빈 값'); assert.strictEqual(F.save(dir, { rehab_settings_v1: '{"a":1}', rehab_x_1: 'y', 이상한키: 'z', rehab_num: 5 }), true);
assert.deepStrictEqual(F.load(dir), { rehab_settings_v1: '{"a":1}', rehab_x_1: 'y' }, 'rehab_로 시작하는 글자 값만 저장(이상한 키·숫자 값은 거름)');
assert.strictEqual(fs.existsSync(F.fileOf(dir) + '.tmp'), false, '임시 파일은 남지 않음');
assert.strictEqual(F.save(dir, null), false); assert.strictEqual(F.save(dir, { rehab_big: 'x'.repeat(9 * 1024 * 1024) }), false, '너무 큰 값은 저장하지 않음'); assert.deepStrictEqual(F.load(dir), { rehab_settings_v1: '{"a":1}', rehab_x_1: 'y' }, '실패한 저장은 이전 사본을 그대로 둠');
fs.writeFileSync(F.fileOf(dir), '{깨진'); assert.deepStrictEqual(F.load(dir), {}, '깨진 파일은 빈 값');
// 한 바퀴: 저장소 → 사본 → 저장소가 비었다가 되살아남
const a = mem({ rehab_settings_v1: '{"font":"large"}', rehab_cross_exclude_v1: '{"k":{"reason":"정상 운영"}}' }); F.save(dir, B.snapshot(a)); const b = mem(); assert.strictEqual(B.restoreMissing(b, F.load(dir)).length, 2); assert.strictEqual(b.raw.rehab_cross_exclude_v1, a.raw.rehab_cross_exclude_v1);
console.log('stateBackup: OK');
