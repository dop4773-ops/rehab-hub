// test_whotasks.js — 교차검증·치료기록 QA의 선생님별 확인 항목 합치기. 실행: node main/test_whotasks.js
'use strict';
const assert = require('assert'); const W = require('../renderer/core/whotasks.js');
const crossText = '10/15(목)\n<김민영 선생님 확인 부탁드려요>\n■ 인수인계\n- 10F 501호 홍○○ — Tx를 작성하세요\n\n✅ 확인하고 고친 뒤 수정했다고 알려 주세요.';
const qaText = '10/15(목)\n<김민영 선생님 확인 부탁드려요>\n<미액팅오류>\n김민영-이○○ 특수(09:05)\n\n✅ 꼭!!당일에 수정하시고 수정했다고 올려주세요.';
const m = W.merge([
  { key: 'cross', label: '교차검증', list: [{ who: '김민영', count: 2, text: crossText }, { who: '이나린', count: 1, text: '<이나린 선생님 확인 부탁드려요>\n- x' }] },
  { key: 'acting', label: '치료기록 QA', list: [{ who: '김민영OT', count: 1, text: qaText }, { who: '박다은', count: 0, extra: 2, text: '종류 다름만 있음' }, { who: '', count: 3, text: 'x' }, { who: '최0', count: 0, text: '' }] },
], { date: '10/15(목)' });
assert.deepStrictEqual(m.map(x => x.who + ':' + x.total), ['김민영:3', '이나린:1', '박다은:0'], '직종 표시(OT)를 떼고 같은 사람으로 합침 · 건수 0이어도 참고 건수(extra)가 있으면 남김 · 이름 없는/빈 항목은 뺌');
const k = m[0]; assert.deepStrictEqual(k.sources.map(s => s.label + ':' + s.count), ['교차검증:2', '치료기록 QA:1']);
assert.strictEqual((k.text.match(/선생님 확인 부탁드려요/g) || []).length, 1, '머리말은 한 번만'); assert.ok(k.text.startsWith('10/15(목)\n<김민영 선생님 확인 부탁드려요>\n■ 인수인계')); assert.ok(/<미액팅오류>\n김민영-이○○/.test(k.text));
assert.ok(k.text.trim().endsWith('✅ 확인하고 고친 뒤 수정했다고 알려 주세요.')); assert.strictEqual((k.text.match(/수정했다고/g) || []).length, 1, '각 도구의 맺음 문구는 떼고 하나만');
assert.strictEqual(W.baseName('이승규B'), '이승규'); assert.strictEqual(W.baseName('엄주용 OT'), '엄주용'); assert.strictEqual(W.baseName('김OT'), '김');
assert.deepStrictEqual(W.merge([], {}), []); assert.deepStrictEqual(W.merge(null), []); assert.deepStrictEqual(W.merge([{ key: 'a', label: 'a' }]), []);
console.log('whotasks: OK');
