// test_scaleguard.js — 자료 규모 이상 감지(공용). 실행: node main/test_scaleguard.js
'use strict';
const assert = require('assert'); const G = require('../renderer/core/scaleguard.js');
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; };
const day = (n) => Date.parse('2026-10-15T12:00:00') - n * 86400000;
const labels = { pts: '환자', cols: '치료사 열' }, units = { pts: '명', cols: '열' };
const st = mem();
for (const n of [4, 3, 2, 1]) assert.deepStrictEqual(G.check(st, 'qa', { pts: 100, cols: 40 }, { now: day(n), labels, units }), [], '이력이 쌓이는 동안은 비교할 게 없거나 같음');
assert.deepStrictEqual(G.check(st, 'qa', { pts: 98, cols: 41 }, { now: day(0), labels, units }), [], '평소 수준');
let a = G.check(st, 'qa', { pts: 40, cols: 40 }, { now: day(0), labels, units }); assert.strictEqual(a.length, 1); assert.strictEqual(a[0].kind, 'drop'); assert.ok(/환자 40명 \(평소 100명\)/.test(a[0].text), '같은 날 다시 돌리면 그날 값을 바꿔 끼우고 다시 비교');
a = G.check(st, 'qa', { pts: 0, cols: 40 }, { now: day(0), labels, units }); assert.strictEqual(a[0].kind, 'zero');
a = G.check(st, 'qa', { pts: 200, cols: 40 }, { now: day(0), labels, units }); assert.strictEqual(a[0].kind, 'jump');
// 도구별로 따로 저장
assert.deepStrictEqual(G.check(st, 'grand', { pts: 5 }, { now: day(0), labels }), [], '다른 도구는 이력이 없음');
// 기준이 작으면 비교하지 않음 / 숫자가 아닌 지표는 무시 / 오래된 날은 14일까지만
const s2 = mem(); for (const n of [3, 2, 1]) G.check(s2, 't', { x: 6 }, { now: day(n) }); assert.deepStrictEqual(G.check(s2, 't', { x: 2, y: 'a', z: NaN }, { now: day(0) }), []);
const s3 = mem(); for (let n = 30; n >= 1; n--) G.check(s3, 't', { x: 50 }, { now: day(n) }); assert.ok(Object.keys(JSON.parse(s3.raw[G.KEY]).t).length <= 14, '저장은 최근 14일까지');
// 저장소가 깨졌거나 못 써도 안 죽는다
assert.deepStrictEqual(G.check({ getItem: () => '{broken', setItem: () => { throw new Error('x'); } }, 't', { x: 1 }, { now: day(0) }), []);
// 같은 날 다시 돌려도 이전 날 이력(중앙값)은 그대로
const s4 = mem(); for (const n of [3, 2, 1]) G.check(s4, 't', { x: 100 }, { now: day(n) }); G.check(s4, 't', { x: 10 }, { now: day(0) }); assert.strictEqual(G.check(s4, 't', { x: 10 }, { now: day(0) })[0].base, 100);
console.log('scaleguard: OK');
