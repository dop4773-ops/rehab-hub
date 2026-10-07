// 실행: node main/test_fixplan.js
// 교차검증 불일치 → 수정 지시서 항목(renderer/core/fixplan.js)을 이슈 종류별 가짜 데이터로 확인한다.
'use strict';
const assert = require('assert');
const { buildFixItems, fixItemsToText, fixItemsToWhoMessages, FIX_GROUPS } = require('../renderer/core/fixplan.js');

const I = (detail, extra = {}) => ({ id: 'x' + Math.random(), patient: '홍길동', room: '501', floor: 10, title: '제목', line: '내용', detail, ...extra });
const CASES = {
  count_sot: I({ kind: 'count', field: 'SOT', expected: 3, actual: 5, diff: 2, room: '501', occurrences: [{ time: '09:05', therapist: '김A' }, { time: '10:50', therapist: '이B' }] }),
  count_lang: I({ kind: 'count', field: '언어', expected: 2, actual: 1, diff: -1, room: '501', occurrences: [], source: 'card' }),
  count_outp: I({ kind: 'count', source: 'outpatient', field: 'SOT', expected: 0, actual: '외래 카드에 있음', hasCard: true, therapist: '김A / 이B' }),
  discharge_in_sched: I({ kind: 'discharge_in_sched', sheet: '평일시간표(원본)', word: '퇴원', entries: [{ time: '09:05', type: 'SOT', therapist: '김A' }] }),
  ccrt_res: I({ kind: 'ccrt_issue', day: '월', time: '09:05', therapist: '김A', verdict: 'v' }, { title: '퇴원 후 인지치료 잔존' }),
  ccrt_day: I({ kind: 'ccrt_issue', day: '화', time: '10:15', therapist: '김A', verdict: 'v' }, { title: '인지치료 요일 불일치' }),
  notmarked: I({ kind: 'discharge_notmarked' }), stillactive: I({ kind: 'discharge_stillactive', floor: 10 }), nostatus: I({ kind: 'card_nostatus' }),
  grid_mismatch: I({ kind: 'mismatch', patient: '홍길동', gridNames: '김철수', time: '10:15', loc: 'B-22', floor: 10 }),
  grid_missing: I({ kind: 'missing', patient: '홍길동', time: '10:15', loc: 'B-20', floor: 10 }),
  sched_mismatch: I({ kind: 'sched_mismatch', scheduleLoc: 'B-1', cardLoc: 'B-2', time: '10:15' }), sched_missing: I({ kind: 'sched_missing', loc: 'B-1', time: '10:15' }),
  sat_missing: I({ kind: 'sat_missing', time: '09:05', therapist: '김A' }), sat_rule: I({ kind: 'sat_rule', time: '09:05', therapist: '김A', code: 'ST', type: 'sot' }),
  therapist: I({ kind: 'therapist', kindLabel: '작업(SOT)', day: '', time: '09:05', origin: '김A', expected: '이B' }),
  ho_ther: I({ kind: 'handover_therapist', type: '작업(SOT)', handoverTherapist: '김A', schedTherapists: '이B' }),
  ho_ther_nosched: I({ kind: 'handover_therapist', type: '작업(SOT)', handoverTherapist: '김A', schedTherapists: '(평일시간표에 배정 없음)' }),
  ho_orphan: I({ kind: 'handover_orphan', type: '작업(SOT)', handoverTherapist: '김A' }),
  ho_excess: I({ kind: 'handover_excess', type: '작업(SOT)', writerCount: 3, realCount: 2, writers: ['A', 'B', 'C'], realTherapists: ['A', 'B'], extra: ['C'] }),
  ho_doctor: I({ kind: 'handover_doctor', handoverDoctor: 'RM8', cardDoctor: 'RM9' }),
  ho_notype: I({ kind: 'handover_notype', items: [{ label: '인지(CCRT)', count: 2, therapists: ['서송지'] }, { label: '연하(RDT)', count: 1, therapists: [] }] }),
  eval_missing: I({ kind: 'eval_missing' }), eval_extra: I({ kind: 'eval_extra' }), eval_dup: I({ kind: 'eval_dup', count: 2, places: [{ time: '09:05', therapist: '김A' }], sameNameInStatus: 1 }), eval_noeval: I({ kind: 'eval_noeval', admit: '입원' }),
  room_both: I({ kind: 'room_mismatch', pta: { room: '502' }, statusRoom: '501', cardRoom: '503', badStatus: true, badCard: true, ambiguous: false }),
  room_status: I({ kind: 'room_mismatch', pta: { room: '502' }, statusRoom: '501', cardRoom: '502', badStatus: true, badCard: false, ambiguous: true }),
  room_nopta: I({ kind: 'room_nopta', statusRoom: '501', cardRoom: '' }),
  room_rm: I({ kind: 'room_rm', pta: 'RM6', vals: [{ name: '현황판', value: 'RM6', bad: false }, { name: '전체시간표', value: 'RM7', bad: true }, { name: '인수인계', value: 'RM8', bad: true }] }),
  room_ptaonly: I({ kind: 'room_ptaonly', codes: ['B_06'], statusState: '퇴원' }),
  nostatus_outp: I({ kind: 'card_nostatus', outpatient: true }),
};

// ① 알려진 종류는 전부 지시가 나오고 "기타 확인"으로 빠지지 않는다
const expectedCount = { room_both: 2, room_rm: 2, ho_notype: 2 };
for (const [k, issue] of Object.entries(CASES)) {
  const items = buildFixItems([issue]);
  assert.strictEqual(items.length, expectedCount[k] || 1, `${k}: 항목 수`);
  for (const it of items) { assert(it.action.length > 10, `${k}: 지시 문구`); assert(it.group !== 'etc', `${k}: 기타로 빠짐`); assert(FIX_GROUPS[it.group], `${k}: 그룹`); assert(it.patient === '홍길동'); }
}
console.log(`OK ① 이슈 ${Object.keys(CASES).length}종 전부 수정 지시로 변환`);

// ② 알 수 없는 종류도 버리지 않고 "기타 확인"으로 남긴다
const u = buildFixItems([{ id: 'u', patient: '김', title: '새 규칙', line: '설명', detail: { kind: 'future_kind' } }]);
assert.strictEqual(u.length, 1); assert.strictEqual(u[0].group, 'etc'); assert(/새 규칙/.test(u[0].action));
console.log('OK ② 모르는 종류는 기타 확인으로 보존');

// ③ 기준이 정해진 불일치는 고칠 쪽을 정해서 쓴다(PTA 기준 병실·주치의), 기준이 없으면 양쪽 방향을 모두 쓴다
const rb = buildFixItems([CASES.room_both]); assert.deepStrictEqual(rb.map(x => x.group).sort(), ['card', 'status']); assert(rb.every(x => /502/.test(x.action)));
const rm = buildFixItems([CASES.room_rm]); assert.deepStrictEqual(rm.map(x => x.group).sort(), ['card', 'handover']); assert(!rm.some(x => /현황판의 주치의/.test(x.action)), '맞는 쪽(현황판)은 고치라고 하지 않는다');
const ct = buildFixItems([CASES.count_sot])[0]; assert(/현황이 맞으면/.test(ct.action) && /시간표.*맞으면|가 맞으면/.test(ct.action), '개수 불일치는 두 방향 안내'); assert.strictEqual(ct.who, '김A, 이B');
assert.strictEqual(buildFixItems([CASES.ho_notype])[0].who, '서송지'); assert.strictEqual(buildFixItems([CASES.ho_excess])[0].who, 'C');
assert(/외래로 등록/.test(buildFixItems([CASES.nostatus_outp])[0].action));
console.log('OK ③ 고칠 쪽/담당자 판단');

// ④ 정렬·번호·텍스트: 파일 묶음 순서(작업치료현황 → 전체시간표 → 매트·테이블 → 인수인계), 번호는 1부터
const all = buildFixItems(Object.values(CASES)); const order = ['status', 'card', 'grid', 'handover', 'etc'];
assert.deepStrictEqual(all.map(x => x.no), all.map((_, i) => i + 1));
assert(all.every((x, i) => i === 0 || order.indexOf(all[i - 1].group) <= order.indexOf(x.group)), '파일 묶음 순서');
const txt = fixItemsToText(all, { date: '2026.10.5.' });
assert(txt.includes('■ 작업치료현황') && txt.includes('■ OT 인수인계') && /원본 파일은 이 프로그램이 바꾸지 않아요/.test(txt)); assert(/\(담당: 서송지\)/.test(txt));
console.log('OK ④ 정렬·번호·복사 텍스트');
// ⑦ 담당자별 메시지: 담당이 여러 명이면 각자 글에 들어가고, 모르는 항목은 빠지며, 환자 이름 가리기가 적용된다
{
  const items = buildFixItems([CASES.count_sot, CASES.count_lang, CASES.ho_ther]); // count_sot의 담당: 김A, 이B / ho_ther: 인수인계 김A
  const msgs = fixItemsToWhoMessages(items, { date: '10/7(수)', mask: (n) => n[0] + '○○' });
  const byWho = Object.fromEntries(msgs.map(m => [m.who, m]));
  assert(byWho['김A'] && byWho['이B'], '담당자마다 글이 하나씩 있어야 해요'); assert(byWho['김A'].count >= byWho['이B'].count, '많은 사람이 먼저');
  assert(byWho['김A'].text.startsWith('10/7(수)\n<김A 선생님 확인 부탁드려요>'), byWho['김A'].text);
  assert(byWho['김A'].text.includes('홍○○') && !byWho['김A'].text.includes('홍길동'), '환자 이름은 가려져야 해요');
  assert(!msgs.some(m => m.text.includes('언어') && !items.find(x => x.who.includes(m.who) && /언어/.test(x.action))), '담당을 모르는 항목은 넣지 않아요');
  assert(fixItemsToWhoMessages(items, {})[0].text.includes('홍길동'), '가리기 옵션이 없으면 실제 이름');
  assert.strictEqual(fixItemsToWhoMessages([], {}).length, 0);
}
console.log('ALL PASS');
