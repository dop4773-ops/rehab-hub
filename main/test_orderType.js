// 실행: node main/test_orderType.js — 스케줄 오더와 다른 종류로 액팅한 경우(인지인데 특수 등) 판정
'use strict';
const assert = require('assert');
const O = require('../renderer/core/ordertype');
const simplify = (n) => { n = n || ''; if (/전산화|인지재활/.test(n)) return '전산화인지'; if (/연하/.test(n)) return '연하치료'; if (/특수작업치료|특수/.test(n)) return '작업특수'; if (/복잡작업치료/.test(n)) return '복잡'; if (/평가/.test(n)) return '평가'; return n; };
const E = (type, timeSlot, name = 'x') => ({ type, timeSlot, name });
const A = (orderName, start) => ({ orderName, start, end: start, therapist: 'T' });
const mm = (o, a) => O.findTypeMismatches(o, a, { simplify }).map(x => [x.schedType, x.actType, x.entry.timeSlot]);

assert.strictEqual(O.actType('전산화인지재활', simplify), '전산화인지'); assert.strictEqual(O.actType('연하전기자극치료', simplify), '연하전기'); assert.strictEqual(O.actType('연하치료', simplify), '연하치료');
assert.strictEqual(O.actType('알수없는처방', simplify), '', '모르는 처방명은 비교하지 않는다');
// ① 인지로 잡힌 스케줄인데 특수로 액팅
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35')], [A('특수작업치료', '09:10')]), [['전산화인지', '작업특수', '09:05~09:35']]);
// ② 종류가 같으면 문제없음
assert.deepStrictEqual(mm([E('작업특수', '09:05~09:35')], [A('특수작업치료', '09:05')]), []);
// ③ 하루에 인지·특수 둘 다 스케줄인데 서로 바꿔서 액팅 → 각 시간 칸에 다른 종류로 액팅한 것
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35'), E('작업특수', '13:00~13:30')], [A('특수작업치료', '09:10'), A('전산화인지재활', '13:05')]), [['전산화인지', '작업특수', '09:05~09:35'], ['작업특수', '전산화인지', '13:00~13:30']]); // 각 시간 칸에 다른 종류로 액팅했으니 둘 다 알린다
// ④ 한 건은 맞고 한 건만 다름 → 다른 것만 잡힌다
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35'), E('작업특수', '13:00~13:30')], [A('특수작업치료', '09:10'), A('특수작업치료', '13:05')]), [['전산화인지', '작업특수', '09:05~09:35']]);
// ⑤ 시간이 멀면(60분 초과) 종류가 달라도 같은 오더로 보지 않는다(미액팅·초과가 따로 처리)
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35')], [A('특수작업치료', '15:00')]), []);
// ⑥ 액팅이 없으면(미액팅) 종류 다름이 아니다 / 스케줄이 없으면(액팅 초과) 아니다
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35')], []), []); assert.deepStrictEqual(mm([], [A('특수작업치료', '09:10')]), []);
// ⑦ 모르는 처방명 액팅은 짝으로 쓰지 않는다
assert.deepStrictEqual(mm([E('전산화인지', '09:05~09:35')], [A('모르는처방', '09:10')]), []);
// ⑧ 연하(RDT) ↔ 연하전기(ERDT)는 서로 다른 종류
assert.deepStrictEqual(mm([E('연하전기', '09:05~09:35')], [A('연하치료', '09:05')]), [['연하전기', '연하치료', '09:05~09:35']]);
// ⑨ 하루에 인지 1건 + 특수 3건 스케줄인데 아침에 특수 1건만 액팅 → 아침 인지 시간에 특수로 액팅한 것(멀리 있는 특수 칸과 짝지으면 안 된다)
assert.deepStrictEqual(mm([E('전산화인지', '08:30~09:00'), E('작업특수', '10:50~11:20'), E('작업특수', '13:00~13:30'), E('작업특수', '14:10~14:40')], [A('특수작업치료', '08:35')]), [['전산화인지', '작업특수', '08:30~09:00']]);
assert.strictEqual(O.abbr('전산화인지'), '인지(CCRT)');
console.log('orderType: OK');
