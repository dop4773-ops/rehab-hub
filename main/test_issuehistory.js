// 실행: node main/test_issuehistory.js
// 교차검증 불일치 이력 추적(renderer/core/issuehistory.js)을 가짜 이슈로 확인한다.
'use strict';
const assert = require('assert');
const H = require('../renderer/core/issuehistory.js');
const ALL = { statusBook: true, cards: true, grids: true, handover: true, ptaBook: true };
const iss = (category, patient, title, extra = {}) => ({ id: 'i' + Math.random(), category, patient, title, line: extra.line || '', room: '501', floor: 10, detail: { kind: extra.kind || 'k' }, ...extra });
const at = (d, h = 9) => new Date(2026, 9, d, h).getTime();

// ① 키: 실행마다 바뀌는 id·횟수 숫자와 무관, 환자·종류·시간이 다르면 다른 건, 같은 키가 겹치면 번호로 구분
const a = iss('count', '홍 길동', 'SOT 횟수 불일치', { field: 'sot', line: '현황 3회 → 실제 5회' });
const b = iss('count', '홍길동', 'SOT 횟수 불일치', { field: 'sot', line: '현황 3회 → 실제 4회' });
assert.strictEqual(H.issueKey(a), H.issueKey(b), '이름 공백·숫자 변화는 같은 건');
assert.notStrictEqual(H.issueKey(a), H.issueKey({ ...a, patient: '김철수' })); assert.notStrictEqual(H.issueKey(a), H.issueKey({ ...a, time: '09:05' }));
assert.strictEqual(new Set(H.keyIssues([a, { ...a }]).map(x => x[0])).size, 2, '키 충돌은 번호로 구분');
console.log('OK ① 불일치 키');

// ② 하루 지나 비교: 새로 생김 / 계속(연속 일수) / 해결됨 / 내용 바뀜
const day1 = H.makeSnapshot([a, iss('location', '가나다', '이름 불일치', { time: '10:15', kind: 'mismatch' })], ALL, at(1));
let hist = H.addSnapshot(null, day1);
const nowIssues = [b, iss('handover', '라마바', '담당 치료사 불일치', { kind: 'handover_therapist' })];
const day2 = H.makeSnapshot(nowIssues, ALL, at(2));
let cmp = H.compareIssueHistory(hist, day2);
assert.strictEqual(cmp.baseline.day, '2026-10-01');
const kHong = H.issueKey(b), kRa = H.issueKey(nowIssues[1]);
assert(cmp.isNew.has(kRa) && !cmp.isNew.has(kHong), '새로 생긴 건만 isNew');
assert.deepStrictEqual(cmp.resolved.map(r => r.patient), ['가나다'], '사라진 건은 해결됨');
assert.strictEqual(cmp.streak.get(kHong), 2, '이틀 연속'); assert.strictEqual(cmp.streak.get(kRa), 1);
assert(cmp.changed.has(kHong), '같은 건인데 내용(횟수)이 바뀜');
// 3일째
hist = H.addSnapshot(hist, day2); cmp = H.compareIssueHistory(hist, H.makeSnapshot(nowIssues, ALL, at(3)));
assert.strictEqual(cmp.streak.get(kHong), 3); assert.strictEqual(cmp.isNew.size, 0); assert.strictEqual(cmp.resolved.length, 0);
console.log('OK ② 새로 생김/계속/해결됨/내용 바뀜');

// ③ 같은 날 여러 번 실행: 오늘 스냅샷은 마지막 것으로 교체되고, 비교 기준은 항상 "이전 날짜"
const h1 = H.addSnapshot(hist, H.makeSnapshot([a], ALL, at(3, 8))), h2 = H.addSnapshot(h1, H.makeSnapshot([a, b], ALL, at(3, 15)));
assert.strictEqual(h2.snaps.filter(s => s.day === '2026-10-03').length, 1); assert.strictEqual(Object.keys(h2.snaps.find(s => s.day === '2026-10-03').keys).length, 2, '같은 키 두 건은 번호(#2)로 구분돼 둘 다 남는다');
assert.strictEqual(H.compareIssueHistory(h2, H.makeSnapshot([a], ALL, at(3, 18))).baseline.day, '2026-10-02');
assert.strictEqual(H.compareIssueHistory(null, day1).baseline, null, '첫 기록은 비교 없음');
console.log('OK ③ 같은 날 재실행·첫 기록');

// ④ 자료 구성이 다르면 그 분류는 비교하지 않는다(PTA 파일이 없던 날 → PTA 대조 "해결" 오판 방지)
const room = iss('room', '병실환자', '병실 불일치 (PTA 기준)', { kind: 'room_mismatch' });
const withPta = H.addSnapshot(null, H.makeSnapshot([room], ALL, at(1)));
const noPta = H.makeSnapshot([], { ...ALL, ptaBook: false }, at(2));
const c4 = H.compareIssueHistory(withPta, noPta);
assert.strictEqual(c4.resolved.length, 0, 'PTA가 없던 날 "해결됨"으로 잡으면 안 됨'); assert(c4.skipped.includes('room')); assert(!c4.comparable.includes('room'));
// 연속 일수: 그 분류를 검사하지 않은 날은 건너뛴다(끊거나 늘리지 않음)
let h = H.addSnapshot(null, H.makeSnapshot([room], ALL, at(1))); h = H.addSnapshot(h, H.makeSnapshot([], { ...ALL, ptaBook: false }, at(2)));
const c5 = H.compareIssueHistory(h, H.makeSnapshot([room], ALL, at(3))); assert.strictEqual(c5.streak.get(H.issueKey(room)), 3, '검사 안 한 날은 건너뛰고 1일부터 3일째');
console.log('OK ④ 자료 구성이 다른 날은 비교·연속 계산에서 제외');

// ⑤ 확인함 표시: 해결되면 자동 삭제, 검사하지 않은 분류의 표시는 유지, 보관 일수 제한
const ack = { [kHong]: { t: 1 }, [H.issueKey(room)]: { t: 2 } };
const pr = H.pruneAck(ack, H.makeSnapshot([], { ...ALL, ptaBook: false }, at(4))); assert(!(kHong in pr), '해결된 건의 확인함은 지움'); assert(H.issueKey(room) in pr, 'PTA 미검사면 room 확인함 유지');
let big = null; for (let d = 1; d <= 120; d++) big = H.addSnapshot(big, { day: `2026-${String(1 + Math.floor((d - 1) / 28)).padStart(2, '0')}-${String(1 + (d - 1) % 28).padStart(2, '0')}`, t: d, cats: [], counts: {}, keys: {} }, 90);
assert.strictEqual(big.snaps.length, 90);
console.log('OK ⑤ 확인함 정리·보관 일수');
// ⑦ 담당자별 반복 요약: 7번째 칸(담당)을 남기고, 서로 다른 3일 이상 나온 불일치를 반복으로 센다. 담당 칸이 없는 옛 스냅샷은 무시한다
{
  const H = require('../renderer/core/issuehistory.js');
  const I = (patient, title, cat = 'count') => ({ category: cat, title, patient, room: '1', floor: 3, line: 'x', detail: {} });
  const whoOf = (i) => (i.patient === '가' ? ['김A', '이B'] : i.patient === '나' ? ['김A'] : []);
  const srcs = { statusBook: true, cards: true, grids: true, handover: true, ptaBook: true };
  const day = (n) => Date.parse('2026-10-10T12:00:00') - n * 86400000;
  let hist = { v: 1, snaps: [] };
  hist = H.addSnapshot(hist, { ...H.makeSnapshot([I('가', '문제1'), I('나', '문제2')], srcs, day(3), whoOf) });
  hist = H.addSnapshot(hist, H.makeSnapshot([I('가', '문제1'), I('나', '문제2'), I('다', '문제3')], srcs, day(2), whoOf));
  hist = H.addSnapshot(hist, H.makeSnapshot([I('가', '문제1'), I('다', '문제3')], srcs, day(1), whoOf));
  hist = H.addSnapshot(hist, H.makeSnapshot([I('가', '문제1')], srcs, day(0), null)); // 담당 정보 없이 만든 스냅샷도 섞여 있어도 안 깨짐
  const r = H.summarizeByWho(hist, { days: 30, today: '2026-10-10' });
  const A = r.find(x => x.who === '김A'), B = r.find(x => x.who === '이B');
  assert.strictEqual(A.issues, 2); assert.strictEqual(A.repeated, 1, '문제1은 3일, 문제2는 2일 → 반복 1건'); assert.strictEqual(A.days, 3); assert.strictEqual(B.issues, 1); assert.strictEqual(B.repeated, 1);
  assert.strictEqual(r.length, 2, '담당이 없는 불일치(다)는 세지 않아요'); assert.strictEqual(r[0].who, '김A'); // 반복·건수 같으면 이름순
  assert.deepStrictEqual(H.summarizeByWho(hist, { days: 2, today: '2026-10-10' }).find(x => x.who === '김A').issues, 1, '기간 밖(3일 전)은 빼요');
  assert.strictEqual(H.summarizeByWho({ v: 1, snaps: [] }, {}).length, 0);
}
// 검사별 정확도 현황
{
  const srcs = { statusBook: true, cards: true, grids: true, handover: true, ptaBook: true };
  const day = (n) => Date.parse('2026-10-10T12:00:00') - n * 86400000;
  const iss = (patient, cat, source) => ({ category: cat, source, title: 't', patient, room: '1', floor: 3, line: 'x', detail: {} });
  const snapOf = (n, list, s = srcs) => H.makeSnapshot(list, s, day(n), null);
  let hist = { v: 1, snaps: [] };
  // 4일 전: A,B,C → 3일 전: A,B,C,D(새) → 2일 전: A,B(C 해결, 3일째 계속이던 건 아님: C는 2일 만에 해결),D → 1일 전: A,B,E(새), D 해결 → 오늘: A,B,E
  const A = iss('가', 'location', 'grid'), B = iss('나', 'location', 'grid'), C = iss('다', 'handover', 'nowriter'), D = iss('라', 'handover', 'nowriter'), E = iss('마', 'handover', 'nowriter');
  hist = H.addSnapshot(hist, snapOf(4, [A, B, C])); hist = H.addSnapshot(hist, snapOf(3, [A, B, C, D])); hist = H.addSnapshot(hist, snapOf(2, [A, B, D])); hist = H.addSnapshot(hist, snapOf(1, [A, B, E])); hist = H.addSnapshot(hist, snapOf(0, [A, B, E]));
  const fb = [{ t: day(0), type: 'exclude', cat: 'handover', src: 'nowriter', reason: '퇴원 예정 · 8/12 퇴원' }, { t: day(1), type: 'exclude', cat: 'handover', src: 'nowriter', reason: '퇴원 예정' }, { t: day(0), type: 'ack', cat: 'location', src: 'grid' }, { t: day(40), type: 'exclude', cat: 'location', src: 'grid', reason: '옛날' }];
  const q = H.summarizeQuality(hist, fb, { today: '2026-10-10' }), by = Object.fromEntries(q.map(x => [x.group, x]));
  assert.strictEqual(by['location|grid'].openNow, 2); assert.strictEqual(by['location|grid'].chronicOpen, 2, '5일째 계속(3일 이상)'); assert.strictEqual(by['location|grid'].resolved, 0); assert.strictEqual(by['location|grid'].resolveRate, 0, '해결 0 / (0+2)');
  const w = by['handover|nowriter']; assert.strictEqual(w.openNow, 1); assert.strictEqual(w.newCount, 2, 'D(3일 전)·E(1일 전)가 새로 생김 — C는 첫 기록부터 있어서 새 건이 아님');
  assert.strictEqual(w.resolved, 2, 'C(2일 만에)·D(2일 만에) 해결'); assert.strictEqual(w.resolveMedian, 2); assert.strictEqual(w.chronicOpen, 0); assert.strictEqual(w.resolveRate, 1);
  assert.strictEqual(w.fbExclude, 2); assert.deepStrictEqual(w.reasons, [['퇴원 예정', 2]], '제외 사유는 첫 토막으로 묶음'); assert.strictEqual(by['location|grid'].fbAck, 1); assert.strictEqual(by['location|grid'].fbExclude, 0, '30일 밖 기록은 뺀다');
  assert.deepStrictEqual(H.summarizeQuality({ v: 1, snaps: [] }, [], { today: '2026-10-10' }), [], '이력이 없으면 비어 있음');
  // 그날 검사하지 않은 분류는 해결로 세지 않는다
  let h2 = { v: 1, snaps: [] }; h2 = H.addSnapshot(h2, snapOf(2, [C])); h2 = H.addSnapshot(h2, snapOf(1, [], { ...srcs, handover: false })); h2 = H.addSnapshot(h2, snapOf(0, [], srcs));
  const q2 = H.summarizeQuality(h2, [], { today: '2026-10-10' }); assert.strictEqual((q2.find(x => x.group === 'handover|nowriter') || { resolved: 0 }).resolved, 1, '검사 안 한 날(1일 전)은 건너뛰고, 검사한 오늘 없어졌으니 해결 1');
}
// 자료 규모 이상 감지
{
  const srcs = { statusBook: true, cards: true, grids: true, handover: true, ptaBook: true };
  const day = (n) => Date.parse('2026-10-10T12:00:00') - n * 86400000;
  const I = (patient, title, cat = 'count') => ({ category: cat, title, patient, room: '1', floor: 3, line: 'x', detail: {} });
  const inp = (a, c) => ({ statusActive: a, cards10: c });
  const mk = (n, issues, inputs) => H.makeSnapshot(issues, srcs, day(n), null, inputs);
  const many = (n) => Array.from({ length: n }, (_, i) => I('환자' + i, '문제' + i));
  let hist = { v: 1, snaps: [] };
  for (const n of [4, 3, 2, 1]) hist = H.addSnapshot(hist, mk(n, many(12), inp(40, 30)));
  assert.deepStrictEqual(H.detectAnomalies(hist, mk(0, many(12), inp(41, 30))), [], '평소 수준이면 경고 없음');
  let a = H.detectAnomalies(hist, mk(0, many(12), inp(15, 30))); assert.strictEqual(a.length, 1); assert.strictEqual(a[0].kind, 'drop'); assert.strictEqual(a[0].key, 'statusActive');
  a = H.detectAnomalies(hist, mk(0, many(12), inp(40, 0))); assert.strictEqual(a[0].kind, 'zero'); assert.strictEqual(a[0].key, 'cards10');
  a = H.detectAnomalies(hist, mk(0, many(12), inp(80, 30))); assert.strictEqual(a[0].kind, 'jump');
  a = H.detectAnomalies(hist, mk(0, many(40), inp(40, 30))); assert.strictEqual(a[0].key, 'issues'); assert.strictEqual(a[0].kind, 'jump');
  a = H.detectAnomalies(hist, mk(0, [], inp(40, 30))); assert.strictEqual(a[0].key, 'issues'); assert.strictEqual(a[0].kind, 'zero');
  assert.deepStrictEqual(H.detectAnomalies(hist, mk(0, many(12), { statusActive: 40 })), [], '오늘 못 잰 항목은 비교하지 않음');
  assert.deepStrictEqual(H.detectAnomalies({ v: 1, snaps: [] }, mk(0, many(12), inp(5, 5))), [], '이력이 없으면 비교하지 않음');
  // 기준이 작으면(10 미만) 흔들림이 커서 비교하지 않는다. 옛 스냅샷(inputs 없음)이 섞여도 안 깨진다
  let small = { v: 1, snaps: [mk(2, [], inp(6, 6)), H.makeSnapshot([], srcs, day(1))] };
  assert.deepStrictEqual(H.detectAnomalies(small, mk(0, [], inp(2, 2))), []);
  // 분류 구성이 다르면(그날은 PTA 파일 없음) 그 분류는 합계에서 뺀다
  const noPta = { ...srcs, ptaBook: false }; let h2 = { v: 1, snaps: [] };
  for (const n of [3, 2, 1]) h2 = H.addSnapshot(h2, H.makeSnapshot(many(12), noPta, day(n), null, inp(40, 30)));
  assert.deepStrictEqual(H.detectAnomalies(h2, H.makeSnapshot(many(12), srcs, day(0), null, inp(40, 30))), []);
}
console.log('ALL PASS');
