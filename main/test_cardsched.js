// test_cardsched.js — 전체시간표 카드의 기존 스케줄 vs 실제 액팅 비교. 실행: node main/test_cardsched.js
'use strict';
const assert = require('assert'); const S = require('../renderer/core/cardsched.js');
// 분류: 카드 글자와 처방명이 같은 말로 맞는다
const C = S.cat;
assert.strictEqual(C('운동치료'), '운동'); assert.strictEqual(C('작업치료'), '작업'); assert.strictEqual(C('기구(ST)'), '기구'); assert.strictEqual(C('전기치료'), '전기');
assert.strictEqual(C('연하전기'), '연하전기'); assert.strictEqual(C('연하치료'), '연하'); assert.strictEqual(C('10F 통증치료'), '통증'); assert.strictEqual(C('전산화인지재활'), '인지');
assert.strictEqual(C('IM301 회복기재활Ⅱ 매트·이동치료'), '운동'); assert.strictEqual(C('IM302001 회복기재활Ⅲ 보행치료'), '운동'); assert.strictEqual(C('IM105001 회복기재활Ⅲ 중추신경계발달재활치료'), '운동');
assert.strictEqual(C('MM010 기구치료'), '기구'); assert.strictEqual(C('IM151 회복기재활Ⅱ 기능적전기자극치료'), '전기'); assert.strictEqual(C('전기치료(FES)'), '전기'); assert.strictEqual(C('연하전기치료'), '연하전기');
assert.strictEqual(C('IM113001 특수작업치료'), '작업'); assert.strictEqual(C('모르는처방'), ''); assert.strictEqual(C(''), ''); assert.strictEqual(C(null), '');
// 요일/시간
assert.strictEqual(S.dayLabel('2026-10-15'), '목요일'); assert.strictEqual(S.dayLabel('2026-10-17'), '토요일/공휴일'); assert.strictEqual(S.dayLabel('2026-10-18'), ''); assert.strictEqual(S.dayLabel('x'), '');
assert.strictEqual(S.slotMinutes('0.35416666666666669'), 510); assert.strictEqual(S.slotMinutes(0.4027777777777778), 580); assert.strictEqual(S.slotMinutes('08:30'), 510); assert.strictEqual(S.slotMinutes('※ 상기 치료 스케줄은'), null); assert.strictEqual(S.slotMinutes(''), null);
// 비교: 08:30 운동 · 09:05 작업 · 09:40 전기 · 10:15 기구
const slots = [{ startM: 510, text: '운동치료' }, { startM: 545, text: '작업치료' }, { startM: 580, text: '전기치료' }, { startM: 615, text: '기구(ST)' }];
const cmp = (order, startM) => S.compare(slots, { order, startM }).state;
assert.strictEqual(cmp('IM301 회복기재활Ⅱ 매트·이동치료', 510), 'ok', '운동 시간에 운동 액팅');
assert.strictEqual(cmp('IM301 회복기재활Ⅱ 매트·이동치료', 525), 'ok', '같은 칸(08:30~09:05) 안의 두 번째 15분 액팅도 정상');
assert.strictEqual(cmp('IM301 회복기재활Ⅱ 매트·이동치료', 545), 'other', '작업 시간에 운동 액팅 = 스케줄과 다른 치료');
assert.strictEqual(cmp('MM010 기구치료', 615), 'ok'); assert.strictEqual(cmp('MM010 기구치료', 580), 'other', '전기 시간에 기구');
assert.strictEqual(cmp('IM301 회복기재활Ⅱ 매트·이동치료', 700), 'noSched', '스케줄이 없는 시간');
assert.strictEqual(cmp('IM301 회복기재활Ⅱ 매트·이동치료', 545 + 35), 'other', '칸 끝 경계(다음 칸 시작)는 다음 칸 기준(전기)');
assert.strictEqual(cmp('모르는처방', 545), 'ok', '분류 못 하는 액팅은 같은 시간에 스케줄이 있으면 다르다고 단정하지 않음');
assert.strictEqual(cmp('모르는처방', 700), 'noSched');
assert.strictEqual(S.compare([], { order: '운동', startM: 510 }).state, 'noSched'); assert.strictEqual(S.compare(null, { order: '운동', startM: 510 }).state, 'noSched');
assert.strictEqual(S.compare(slots, { order: '운동', startM: null }).state, 'noSched');
assert.deepStrictEqual(S.compare(slots, { order: '운동치료', startM: 545 }).sched, ['작업']);
console.log('cardsched: OK');
