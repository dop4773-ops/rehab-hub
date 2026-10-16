// test_crosschecks.js — 교차검증 문제 항목 계산(위치·인수인계). 실행: node main/test_crosschecks.js
// (옮기기 전 화면 안 코드와 같은 결과임은 실제 파일로 따로 확인했다 — 여기서는 가짜 데이터로 규칙을 고정한다)
'use strict';
const assert = require('assert'); const C = require('../renderer/core/crosschecks.js');
const nk = (n) => String(n).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g, '').toUpperCase();

// 시간표 항목 수집: 종류별로 같은 이름만, 이름 표기(공백·괄호) 차이는 무시
const sched = { occ: [{ type: 'sot', name: '홍 길동', time: '09:00', therapist: '김가' }, { type: 'rdt', name: '홍길동', time: '10:00', therapist: '이나' }, { type: 'sot', name: '다른이', time: '11:00', therapist: '박다' }],
  erdt: [{ name: '홍길동', time: '13:00', therapist: '김가', count: 2 }], ccrt: [{ name: '홍길동', time: '14:00', therapist: '이나', day: '월' }] };
assert.deepStrictEqual(C.collectFieldOccurrences(sched, '홍길동', 'sot'), [{ time: '09:00', therapist: '김가' }]);
assert.deepStrictEqual(C.collectFieldOccurrences(sched, '홍길동', 'erdt'), [{ time: '13:00', therapist: '김가', extra: '2회분' }]);
assert.deepStrictEqual(C.collectFieldOccurrences(sched, '홍길동', 'ccrt'), [{ time: '14:00', therapist: '이나', extra: '월요일' }]);

// 매트·테이블 위치 항목 모양(이름 불일치 / 기록 없음)
const card = { entries: [{ time: '09:00', loc: 'T-1' }] };
const mm = C.buildLocationIssue({ kind: 'mismatch', floor: 3, patient: '홍길동', room: '501', time: '09:00', loc: 'T-1', gridNames: '다른이' }, 4, card);
assert.deepStrictEqual([mm.id, mm.category, mm.source, mm.title, mm.line], ['loc-4', 'location', 'grid', '이름 불일치 (매트/테이블현황 기준)', '3F · 09:00 · T-1']); assert.strictEqual(mm.detail.dayEntries, card.entries);
const ms = C.buildLocationIssue({ kind: 'missing', floor: 3, patient: '홍길동', time: '09:00', loc: 'T-1', gridNames: '' }, 5, null);
assert.strictEqual(ms.title, '기록 없음 (매트/테이블현황 기준)'); assert.strictEqual(ms.room, ''); assert.deepStrictEqual(ms.detail.dayEntries, []);

// 평일시간표 위치 대조: 같은 층 카드 우선, 위치 코드 없는 칸·카드 없는 환자는 건너뜀
const cardIndex = { 3: new Map([[nk('홍길동'), { room: '501', entries: [{ time: '09:00', loc: 'T-1' }, { time: '10:00', loc: 'T-2' }] }]]), 10: new Map() };
const occs = [{ type: 'sot', floor: 3, name: '홍길동', loc: 'T-1', timeKey: '09:00' }, { type: 'sot', floor: 3, name: '홍길동', loc: 'T-9', timeKey: '10:00' }, { type: 'sot', floor: 3, name: '홍길동', loc: 'T-3', timeKey: '11:00' },
  { type: 'sot', floor: 3, name: '홍길동', loc: '', timeKey: '12:00' }, { type: 'sot', floor: 3, name: '없는이', loc: 'T-1', timeKey: '09:00' }, { type: 'erdt', floor: 3, name: '홍길동', loc: 'T-1', timeKey: '09:00' }];
const r = C.buildScheduleLocationChecks(occs, cardIndex);
assert.strictEqual(r.checked, 3); assert.deepStrictEqual(r.out.map(x => x.kind + ':' + x.time), ['sched_mismatch:10:00', 'sched_missing:11:00']);
assert.strictEqual(C.buildScheduleLocationIssue(r.out[0], 1).line, '3F · 10:00 · 평일시간표 T-9 → 전체시간표 T-2');
assert.strictEqual(C.buildScheduleLocationIssue(r.out[1], 2).title, '전체시간표(원본)에 기록 없음');

// 인수인계 치료사 대조: 같은 치료사 있음 / 다른 치료사(mismatch) / 시간표 배정 없음+카드에도 없음(orphan) / 카드엔 담당 있음(noSched)
const occ2 = [{ type: 'sot', name: '홍길동', therapist: '김가' }, { type: 'sot', name: '홍길동', therapist: '이나' }, { type: 'rdt', name: '박순', therapist: '최라' }];
const hm = new Map([[nk('홍길동') + '|sot', { name: '홍길동', type: 'sot', therapist: '박다' }], [nk('박순') + '|rdt', { name: '박순', type: 'rdt', therapist: ' 최라' }], [nk('신환') + '|sot', { name: '신환', type: 'sot', therapist: '김가' }],
  [nk('연하만') + '|rdt', { name: '연하만', type: 'rdt', therapist: '김가' }], [nk('빈칸') + '|sot', { name: '빈칸', type: 'sot', therapist: '' }]]);
const findCard = (n) => ({ [nk('연하만')]: { therapists: { 연하치료: ['정마'] } } })[nk(n)] || null;
const t = C.buildHandoverTherapistChecks(hm, occ2, [], findCard);
assert.strictEqual(t.checked, 4); assert.deepStrictEqual(t.out.map(x => x.kind + ':' + x.name), ['mismatch:홍길동', 'orphan:신환', 'noSched:연하만']);
assert.strictEqual(t.out[0].schedTherapists, '김가 / 이나'); assert.strictEqual(t.out[1].hasCard, false);
assert.strictEqual(C.buildSchedTherapistIndex(occ2, [{ name: '홍길동', therapist: '정마' }]).get(nk('홍길동') + '|ccrt').has('정마'), true);

// 작성자 수 초과: 배정은 1명인데 서로 다른 2명이 적음
const ex = C.buildHandoverExcessChecks([{ name: '홍길동', type: 'sot', therapist: '김가' }, { name: '홍길동', type: 'sot', therapist: '박다' }, { name: '홍길동', type: 'sot', therapist: '박다' }, { name: '박순', type: 'rdt', therapist: '최라' }, { name: '무종류', type: '', therapist: 'x' }], [{ type: 'sot', name: '홍길동', therapist: '김가' }, { type: 'rdt', name: '박순', therapist: '최라' }], []);
assert.strictEqual(ex.checked, 2); assert.strictEqual(ex.out.length, 1); assert.deepStrictEqual([ex.out[0].writerCount, ex.out[0].realCount, ex.out[0].extra], [2, 1, ['박다']]);

// 주치의 대조: 카드와 다른 주치의는 환자·주치의별 한 건으로 묶고 작성자·종류를 모은다 / 카드 주치의를 모르면 집계 안 함
const cards = { [nk('홍길동')]: { doctor: 'RM9', floor: 10, room: '801' }, [nk('박순')]: { doctor: '' } };
const dr = C.buildDoctorChecks([{ name: '홍길동', doctor: 'RM4', therapist: '김가', type: 'sot' }, { name: '홍길동', doctor: 'RM4', therapist: '이나', type: 'rdt' }, { name: '홍길동', doctor: 'RM9', therapist: '박다', type: 'sot' }, { name: '박순', doctor: 'RM1', therapist: 'x', type: 'sot' }, { name: '홍길동', doctor: 'RM4', therapist: '김가', type: 'sot' }], (n) => cards[nk(n)] || null);
assert.strictEqual(dr.checked, 1); assert.strictEqual(dr.out.length, 1); assert.deepStrictEqual([dr.out[0].handoverDoctor, dr.out[0].cardDoctor, dr.out[0].writers, dr.out[0].types], ['RM4', 'RM9', ['김가', '이나'], ['SOT', 'RDT']]);

// 토요일 시간표: 회복기가 아니면 ERDT 외엔 규칙 위반, ERDT는 대상 아님, 같은 환자는 한 번만 존재 확인
const so = [{ type: 'sot', name: '회복', timeKey: '09:00', therapist: '김가', code: 'ST' }, { type: 'sot', name: '회복', timeKey: '10:00', therapist: '김가', code: 'ST' }, { type: 'sot', name: '일반', timeKey: '09:00', therapist: '이나', code: 'SM' },
  { type: 'erdt', name: '일반', timeKey: '13:00', therapist: '이나', code: '' }, { type: 'rdt', name: '없는이', timeKey: '09:00', therapist: '박다', code: 'ST' }];
const sat = C.buildSaturdayLocationChecks(so, (n) => (nk(n) === nk('회복') ? { x: 1 } : null), new Set([nk('회복'), nk('없는이')]));
assert.deepStrictEqual(sat.out.map(x => x.kind + ':' + x.patient), ['rule:일반', 'exist:일반', 'exist:없는이']); assert.strictEqual(sat.checked, 4); // 회복 1(존재 확인 한 번) + 일반 규칙 위반 1 + 일반 ERDT(규칙 대상 아님, 존재 확인은 함) 1 + 없는이 1
assert.strictEqual(C.buildSaturdayLocationChecks(so.slice(2, 3), () => null, null).out[0].kind, 'exist'); // 회복기 명단이 없으면 모두 회복기로 본다
assert.strictEqual(C.buildSaturdayLocationIssue(sat.out[0], 7).title, '회복기 아닌 환자 작업(SOT) 배정 (토요일 규칙 위반)');
assert.strictEqual(C.buildSaturdayLocationIssue(sat.out[1], 8).detail.kind, 'sat_missing');
console.log('crosschecks 테스트 통과');

// 토요일 SM/ST 코드 비교: 평일에 ST와 SM을 둘 다 받는 환자는 토요일 코드가 둘 중 하나면 정상, 평일에 없던 코드이거나 평일 코드가 하나뿐이고 다르면 불일치
assert.strictEqual(C.satCodeMismatch(new Set(['ST', 'SM']), 'SM'), false, '둘 다 있으면 SM도 정상');
assert.strictEqual(C.satCodeMismatch(new Set(['ST', 'SM']), 'ST'), false, '둘 다 있으면 ST도 정상');
assert.strictEqual(C.satCodeMismatch(new Set(['ST']), 'SM'), true, '평일엔 ST뿐인데 토요일이 SM이면 불일치');
assert.strictEqual(C.satCodeMismatch(['SM'], 'SM'), false);
assert.strictEqual(C.satCodeMismatch(undefined, 'SM'), false, '평일 코드가 없으면 비교 안 함');
assert.strictEqual(C.satCodeMismatch(new Set(['ST']), ''), false, '토요일 코드가 없으면 비교 안 함');
console.log('토요일 코드(SM/ST) 비교 점검 통과');
