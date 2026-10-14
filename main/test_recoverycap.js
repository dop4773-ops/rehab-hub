// test_recoverycap.js — 삭제·추가 내역 읽기(삭제 유지만) · 회복기재활 16개 초과 찾기. 실행: node main/test_recoverycap.js
'use strict';
const assert = require('assert'); const C = require('../renderer/core/recoverycap.js');
const N = null;
const rows = [
  ['평일 OT·PT 공통 삭제·추가 내역'], ['기준일 2026-10-15 · 치료층 전체 층 · 전체 3건 · 삭제 유지 2건 · 복구 완료 1건'], [],
  ['3층 · 전체 0건 · 삭제 유지 0건 · 복구 완료 0건'], ['OT 작업치료실 · 0건', N, N, N, N, N, N, 'PT 물리치료실 · 0건'],
  ['번호', '환자 / 병실', '삭제된 치료', '추가된 대체치료', '대체 치료사', '상태 / 처리일시', N, '번호', '환자 / 병실', '삭제된 치료', '추가된 대체치료', '대체 치료사', '상태 / 처리일시'], [],
  ['10층 · 전체 3건 · 삭제 유지 2건 · 복구 완료 1건'], ['OT 작업치료실 · 2건', N, N, N, N, N, N, 'PT 물리치료실 · 1건'],
  ['번호', '환자 / 병실', '삭제된 치료', '추가된 대체치료', '대체 치료사', '상태 / 처리일시', N, '번호', '환자 / 병실', '삭제된 치료', '추가된 대체치료', '대체 치료사', '상태 / 처리일시'],
  ['1', '이종희\n8병동 808\n10층\n등록번호 2842', '08:30~09:00\n기구치료', '11:25~11:55\n작업치료\n사유: 외진', '김민영\n10층 · 1팀', '삭제 유지\n삭제 2026-10-14 11:14', N,
   '1', '손타선\n8병동 806\n10층\n등록번호 3221', '08:30~09:00\n전기치료(FES)', '13:00~13:30\nNDT\n사유: 빈타임', '이세은\n10층 · 3팀', '삭제 유지\n삭제 2026-10-14 08:11'],
  ['2', '손타선\n8병동 806\n10층\n등록번호 3221', '09:05~09:35\n기구치료', '09:05~09:35\n작업치료\n사유: 외진', '정유정\n10층 · 1팀', '복구 완료\n복구 2026-10-14 12:00', N, N, N, N, N, N, N],
  [],
];
const r = C.parseDelAddRows(rows);
assert.strictEqual(r.date, '2026-10-15'); assert.strictEqual(r.entries.length, 2); assert.strictEqual(r.restored, 1, '복구 완료는 세기만 하고 담지 않음');
const a = r.entries.find(e => e.name === '이종희'), b = r.entries.find(e => e.name === '손타선');
assert.deepStrictEqual([a.floor, a.dept, a.ward, a.reg, a.deleted.time, a.deleted.treat, a.added.treat, a.added.reason, a.therapist, a.team, a.at], [10, 'OT', '8병동 808', '2842', '08:30~09:00', '기구치료', '작업치료', '외진', '김민영', '10층 · 1팀', '2026-10-14 11:14']);
assert.deepStrictEqual([b.dept, b.reg, b.added.treat, b.added.reason], ['PT', '3221', 'NDT', '빈타임']);
assert.strictEqual(r.entries.some(e => e.name === '손타선' && e.dept === 'OT'), false, '복구 완료된 손타선 OT 건은 빠짐');
assert.strictEqual(C.delAddFor(r.entries, { regNo: '3221', name: '다른이름' }).length, 1, '등록번호 우선');
assert.strictEqual(C.delAddFor(r.entries, { regNo: '', name: '이 종희' }).length, 1, '등록번호 없으면 이름(공백 무시)');
assert.strictEqual(C.delAddFor(r.entries, { regNo: '9999', name: '이종희' }).length, 0, '등록번호가 다르면 다른 사람');
assert.ok(/10층 OT: 08:30~09:00 기구치료 삭제 → 11:25~11:55 작업치료 추가\(김민영, 사유: 외진\) · 삭제 2026-10-14 11:14/.test(C.delAddLine(a)));
assert.deepStrictEqual(C.parseDelAddRows([]).entries, []); assert.deepStrictEqual(C.parseDelAddRows(null).entries, []);

// 삭제된 시간대에 액팅이 있으면 그 액팅과 내역을 짝지음(삭제 08:30~09:00 → 08:30·08:45 액팅, 09:00 액팅은 아님)
{
  const ents = [a, b]; // a: 08:30~09:00 기구치료 삭제 / b: 08:30~09:00 전기치료 삭제(다른 환자라 이 테스트에서는 같은 시간대)
  const its = [{ startM: 510, ref: 'x' }, { startM: 525, ref: 'y' }, { startM: 540, ref: 'z' }, { startM: null, ref: 'n' }];
  const o2 = C.delAddOverlaps([a], its);
  assert.deepStrictEqual(o2.hits.map(h => h.item.ref), ['x', 'y'], '삭제 시간대 안에서 시작한 액팅만'); assert.strictEqual(o2.rest.length, 0);
  const o3 = C.delAddOverlaps(ents, [{ startM: 700, ref: 'late' }]); assert.strictEqual(o3.hits.length, 0); assert.strictEqual(o3.rest.length, 2, '겹치는 액팅이 없으면 모두 rest');
  assert.strictEqual(C.delAddOverlaps([], its).hits.length, 0); assert.strictEqual(C.delAddOverlaps(null, null).rest.length, 0);
}
// 16개 초과(17개부터)
const mk = (n, reg, name, base = 480) => Array.from({ length: n }, (_, i) => ({ regNo: reg, name, startM: base + i * 15, time: `x${i}`, therapist: 'T' + i, ref: i }));
let o = C.findRecoveryOver([...mk(16, '1', '가'), ...mk(17, '2', '나'), ...mk(20, '', '다')]);
assert.deepStrictEqual(o.map(x => [x.name, x.count]), [['다', 20], ['나', 17]], '16개까지는 통과, 17개부터 잡고 많은 순');
assert.strictEqual(o[1].trigger.ref, 16, '17번째(시간순) 액팅이 기준을 처음 넘긴 것');
assert.strictEqual(C.findRecoveryOver(mk(16, '1', '가')).length, 0, '딱 16개는 정상'); assert.strictEqual(C.findRecoveryOver(mk(17, '1', '가')).length, 1);
assert.strictEqual(C.findRecoveryOver([...mk(9, '1', '가'), ...mk(8, '1', '가-다른표기')]).length, 1, '등록번호가 같으면 이름 표기가 달라도 한 환자');
assert.strictEqual(C.findRecoveryOver([...mk(8, '', '가'), ...mk(8, '', '나')]).length, 0, '이름이 다르면 합치지 않음');
assert.strictEqual(C.findRecoveryOver(mk(17, '1', '가'), 20).length, 0, '기준 값 바꾸기');
assert.strictEqual(C.patientKey({ regNo: '00123', name: 'a' }), '00123'.replace(/\D/g, '')); assert.strictEqual(C.patientKey({ regNo: '', name: '김 영옥A' }), 'n:김영옥A'); assert.strictEqual(o[0].key, 'n:다', '결과에 환자 키가 들어감'); assert.strictEqual(C.findRecoveryOver(mk(17, '7', '가'))[0].key, '7');
// 시간을 못 읽는 줄은 뒤로
o = C.findRecoveryOver([{ regNo: '1', name: '가', startM: null, ref: 'z' }, ...mk(16, '1', '가')]); assert.strictEqual(o[0].trigger.ref, 'z');
console.log('recoverycap: OK');
