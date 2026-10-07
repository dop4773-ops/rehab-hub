// 실행: node main/test_workstate.js
// 업데이트·재시작 때 하던 작업을 지키는 규칙: 제외한 미액팅 칸은 같은 칸에 같은 환자·시간일 때만 되살리고, 표식은 10분 안에서만 유효하다.
'use strict';
const assert = require('assert');
const W = require('../renderer/core/workstate');

const entries = [{ source: '메인표', row: 5, col: 3, name: '김가', timeSlot: '09:05' }, { source: '메인표', row: 6, col: 3, name: '이나', timeSlot: '09:40' }];
const saved = [{ key: '메인표|5|3', name: '김가', timeSlot: '09:05' }, { key: '메인표|6|3', name: '박다', timeSlot: '09:40' }, { key: '메인표|9|9', name: '없음', timeSlot: '10:00' }];
assert.deepStrictEqual(W.keepMatchingSlots(saved, entries), ['메인표|5|3'], '같은 칸·같은 환자·같은 시간만 살린다(내용이 바뀐 칸·사라진 칸은 버림)');
assert.deepStrictEqual(W.keepMatchingSlots([], entries), []); assert.deepStrictEqual(W.keepMatchingSlots(null, null), []);
assert.deepStrictEqual(W.pruneKeyed({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 }); assert.deepStrictEqual(W.pruneKeyed(null, ['a']), {});
const now = 1_000_000_000_000;
assert.strictEqual(W.resumeFresh({ view: 'cross', t: now - 5 * 60000 }, now), true); assert.strictEqual(W.resumeFresh({ view: 'cross', t: now - 11 * 60000 }, now), false);
assert.strictEqual(W.resumeFresh(null, now), false); assert.strictEqual(W.resumeFresh({ t: now }, now), false, '화면 이름이 없으면 무효'); assert.strictEqual(W.resumeFresh({ view: 'x', t: now + 5000 }, now), false, '미래 시각은 무효');
console.log('workstate: OK');
