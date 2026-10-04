// 실행: node main/test_cards.js
// renderer/core/cards.js(환자 카드 읽기)·treatment.js(치료 문구 분류)를 가짜 시트로 확인한다.
'use strict';
const assert = require('assert');
const { findCardBlocks, readCardHead, findTimeHeader, cardDayCols, cardRows, dayLabel } = require('../renderer/core/cards.js');
const T = require('../renderer/core/treatment.js');

// 시트를 만드는 도우미: put(row, col, value) — 행/열은 1부터
const A = (n) => { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const mk = () => { const m = new Map(); return { m, put: (r, c, v) => m.set(`${A(c)}${r}`, v) }; };
// 입원 카드: 이름 머리글 (row,col). 표 머리글은 +7줄, 요일은 +4,+7,+10,+13,+16,+19열(입원) 또는 +2,+5…(외래)
function card(s, row, col, { name = '홍길동', hasLoc = true, skipDays = [], rows = [['0.354166666666667', '운동치료(B-1)', '작업치료']] } = {}) {
  s.put(row, col, '이름'); s.put(row, col + 3, '등록번호'); s.put(row + 1, col, name); s.put(row + 1, col + 3, '2325'); s.put(row + 1, col + 6, '501');
  s.put(row + 5, col, 'RM4'); s.put(row + 5, col + 3, '10'); s.put(row + 5, col + 8, 45000); s.put(row + 7, col + 8, 45100);
  const hr = row + 7; s.put(hr, col, '시간'); s.put(hr, col + 2, hasLoc ? '치료위치' : '월요일');
  const offs = hasLoc ? [4, 7, 10, 13, 16, 19] : [2, 5, 8, 11, 14, 17], days = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일/공휴일'];
  days.forEach((d, i) => { if (!skipDays.includes(d) && !(i === 0 && !hasLoc)) s.put(hr, col + offs[i], d); }); // 외래 카드는 +2열이 이미 "월요일"
  rows.forEach((r, i) => { s.put(hr + 1 + i, col, r[0]); if (hasLoc) s.put(hr + 1 + i, col + 2, r[1]); s.put(hr + 1 + i, col + offs[0], r[2]); s.put(hr + 1 + i, col + offs[4], '연하치료'); });
  return hr;
}

// ① 입원 카드: 머리 정보·시간 머리글·요일 열·시간 줄
let s = mk(); const hr = card(s, 10, 1);
const blocks = findCardBlocks(s.m); assert.strictEqual(blocks.length, 1); assert(blocks[0].hasRegLabel);
const head = readCardHead(s.m, blocks[0]); assert.strictEqual(head.name, '홍길동'); assert.strictEqual(head.reg, '2325'); assert.strictEqual(head.room, '501'); assert.strictEqual(head.rmRaw, 'RM4');
const hdr = findTimeHeader(s.m, blocks[0], 50); assert.deepStrictEqual({ ...hdr }, { row: hr, hasLocCol: true });
let dc = cardDayCols(s.m, blocks[0], hdr.row, true); assert.strictEqual(dc['월요일'], 5); assert.strictEqual(dc['금요일'], 17); assert.strictEqual(dc['토요일/공휴일'], 20);
const rows = cardRows(s.m, blocks[0], hdr, dc, hdr.row + 16); assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].texts['월요일'], '작업치료'); assert.strictEqual(rows[0].texts['금요일'], '연하치료'); assert.strictEqual(rows[0].locRaw, '운동치료(B-1)');
console.log('OK ① 입원 카드 읽기');

// ② 외래 카드(치료위치 칸 없음): 요일이 두 칸 당겨져 있고 위치 칸은 비어 있다
s = mk(); card(s, 10, 1, { hasLoc: false });
let b = findCardBlocks(s.m)[0], h = findTimeHeader(s.m, b, 50); assert.strictEqual(h.hasLocCol, false);
dc = cardDayCols(s.m, b, h.row, false); assert.strictEqual(dc['월요일'], 3); assert.strictEqual(dc['금요일'], 15);
assert.strictEqual(cardRows(s.m, b, h, dc, h.row + 16)[0].locRaw, '');
console.log('OK ② 외래 카드(치료위치 칸 없음)');

// ③ 금요일 머리글 칸이 빈 카드: 표준 간격으로 보충해서 금요일 일정이 빠지지 않는다 (실제 10F 시간표에서 발견된 경우)
s = mk(); card(s, 10, 1, { skipDays: ['금요일'] });
b = findCardBlocks(s.m)[0]; h = findTimeHeader(s.m, b, 50); dc = cardDayCols(s.m, b, h.row, true);
assert.strictEqual(dc['금요일'], 17, '빈 머리글은 표준 위치로 보충');
assert.strictEqual(cardRows(s.m, b, h, dc, h.row + 16)[0].texts['금요일'], '연하치료');
// 보충하면 안 되는 경우: 머리글이 표준 위치에서 벗어나 있으면 그대로 둔다
s = mk(); card(s, 10, 1, { skipDays: ['금요일'] }); s.put(17, 18, '금요일'); // 금요일이 +17열(표준은 +16)에 있음
b = findCardBlocks(s.m)[0]; h = findTimeHeader(s.m, b, 50); assert.strictEqual(cardDayCols(s.m, b, h.row, true)['금요일'], 18);
s = mk(); card(s, 10, 1, { skipDays: ['월요일', '화요일', '수요일'] }); // 3개나 비면 표준 레이아웃이라고 믿지 않는다
b = findCardBlocks(s.m)[0]; h = findTimeHeader(s.m, b, 50); assert(!cardDayCols(s.m, b, h.row, true)['월요일']);
console.log('OK ③ 빈 요일 머리글 보충(표준 위치일 때만)');

// ④ 한 줄에 카드 두 장(왼쪽 열 + X열) · 등록번호 칸이 없는 "이름" 글자
s = mk(); card(s, 10, 1, { name: '왼쪽' }); card(s, 10, 24, { name: '오른쪽' }); s.put(30, 5, '이름');
const bl = findCardBlocks(s.m); assert.strictEqual(bl.length, 3); assert.deepStrictEqual(bl.map(x => x.hasRegLabel), [true, true, false]);
assert.strictEqual(readCardHead(s.m, bl[1]).name, '오른쪽');
console.log('OK ④ 카드 위치 찾기(두 카드·가짜 머리글 구분)');

// ⑤ 시간 머리글을 못 찾으면 null(호출하는 쪽이 카드를 건너뛸지 정한다) · 치료위치 칸이 없어도 +7~+10줄의 "시간"은 옛 규칙으로 인정
s = mk(); s.put(5, 1, '이름'); s.put(5, 4, '등록번호'); s.put(6, 1, '가나다'); assert.strictEqual(findTimeHeader(s.m, findCardBlocks(s.m)[0], 40), null);
s.put(13, 1, '시간'); assert.deepStrictEqual({ ...findTimeHeader(s.m, findCardBlocks(s.m)[0], 15) }, { row: 13, hasLocCol: false });
assert.strictEqual(dayLabel(' 토요일 공휴일 '), '토요일/공휴일'); assert.strictEqual(dayLabel('월 요일'), '월요일'); assert.strictEqual(dayLabel('일요일'), '');
console.log('OK ⑤ 시간 머리글 없음/옛 규칙');

// ⑥ 치료 문구 분류: 거친 분류(treatmentCore)와 세분 정규식(TREATMENT_TEXT)의 차이를 못 박아 둔다
assert.strictEqual(T.treatmentCore('연하전기'), 'swallow'); assert(!T.hasTreatment('swallow', '연하전기') && T.hasTreatment('swallow_electric', '연하전기'));
assert.strictEqual(T.treatmentCore('인지치료'), 'cog'); assert.strictEqual(T.treatmentCore('언어치료'), 'speech'); assert.strictEqual(T.treatmentCore('임상심리'), 'speech');
assert(!T.hasTreatment('speech', '임상심리'), '심리 단독은 언어치료가 아니다'); assert.strictEqual(T.treatmentCore('운동치료(B-1)'), 'exercise');
assert(T.isTreatmentText('작업치료(T-3)') && !T.isTreatmentText('외래 치료 안내') && !T.isTreatmentText('2026-09-01 ~ 09-30'));
assert.strictEqual(T.inlineLocation('운동치료(B-1)'), 'B-1'); assert.strictEqual(T.treatmentRoom('언어치료'), '언어치료실'); assert.strictEqual(T.cleanTreatmentName('3F 운동치료(B-1)'), '운동치료');
console.log('OK ⑥ 치료 문구 분류');
console.log('ALL PASS');
