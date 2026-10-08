// 실행: node main/test_handover.js
// OT 인수인계의 치료종류 분류: ERDT(연하전기)는 RDT로 잘못 잡히지 않고 교차검증에서 빠져야 한다.
'use strict';
const assert = require('assert');
const H = require('../renderer/core/parsers_handover');

assert.strictEqual(H.handoverType('RDT'), 'rdt'); assert.strictEqual(H.handoverType('SOT'), 'sot'); assert.strictEqual(H.handoverType('CCRT'), 'ccrt');
assert.strictEqual(H.handoverType('ERDT'), ''); assert.strictEqual(H.handoverType('erdt'), ''); assert.strictEqual(H.handoverType('E-RDT') , 'rdt'); // 정확히 ERDT 표기만 뺀다
const list = H.handoverListFromLiveRecords([
  { name: '김가나', therapist: 'A', type: 'ERDT' }, { name: '김가나', therapist: 'B', type: 'RDT' }, { name: '이다라', therapist: 'C', type: 'ERDT' }]);
assert.deepStrictEqual(list.map(e => e.type), ['', 'rdt', '']);
const idx = H.buildHandoverIndex(list); assert.strictEqual(idx.size, 1); assert.strictEqual([...idx.values()][0].therapist, 'B');
const tx = H.handoverListFromLiveRecords([{ name: '김가나', type: 'SOT', tx: '  ' }, { name: '김가나', type: 'RDT', tx: '보행 훈련' }, { name: '이다라', type: 'SOT' }]);
assert.deepStrictEqual(tx.map(e => e.tx), ['', '보행 훈련', undefined]); // Tx 칸이 없는 기록은 undefined(= Tx를 읽지 않음), 공백뿐이면 빈 문자열
console.log('handover: OK');
