// test_otmatch.js — 작업치료실 시간표 오더 칸 ↔ 액팅 세션 짝짓기(미액팅·초과·종류 불일치·D/C). 실행: node main/test_otmatch.js
// (옮기기 전 화면 안 코드와 같은 결과임은 실제 시간표·액팅 파일 7건으로 따로 확인했다 — 여기서는 가짜 데이터로 규칙을 고정한다)
'use strict';
const assert = require('assert');
require('../renderer/core/ordertype.js');
const M = require('../renderer/core/otmatch.js');
const e = (name, type, t, extra) => Object.assign({ name, type, timeSlot: t + '~', therapist: '김가', source: 'wd', row: 1, col: 1 }, extra);
const a = (patientName, orderName, start, end, therapist) => ({ patientName, orderName, start, end, therapist: therapist || '김가' });
const SP = '특수작업치료';

// 도움 함수
assert.strictEqual(M.timeToMinutes('09:05~09:35'), 545); assert.strictEqual(M.timeToMinutes('점심'), null);
assert.strictEqual(M.isEvalOrder('수지기능검사'), true); assert.strictEqual(M.isEvalOrder('특수작업치료'), false);
assert.strictEqual(M.simplifyOrderName('전산화인지재활치료'), '전산화인지'); assert.strictEqual(M.simplifyOrderName('특수작업치료'), '작업특수');
assert.deepStrictEqual(M.stripDupLetter('홍길동A'), { base: '홍길동' }); assert.deepStrictEqual(M.stripDupLetter('AB'), { base: 'AB' });

// 미액팅: 오더 2칸 · 액팅 1건(09:05) → 가까운 09:00 칸이 액팅됨, 10:00 칸이 미액팅
let r = M.analyze({ entries: [e('김가', '작업특수', '10:00', { row: 3 }), e('김가', '작업특수', '09:00', { row: 2 })], actRows: [a('김가', SP, '09:05', '09:35')] });
let row = r.rows.find(x => x.name === '김가');
assert.deepStrictEqual([row.orderCount, row.actCount, row.diff], [2, 1, 1]);
assert.deepStrictEqual(row.orderList.map(x => x.row), [2, 3]); // 시간 순으로 정렬
assert.strictEqual(r.slotFlagMap['wd|2|1'], 'ok'); assert.strictEqual(r.slotFlagMap['wd|3|1'], 'missing');

// 액팅 초과(오더 없음) · 이름 없는 액팅 줄은 버림
r = M.analyze({ entries: [], actRows: [a('이나', SP, '09:00', '09:30'), a('', SP, '09:00', '09:30')] });
assert.strictEqual(r.rows.length, 1); assert.strictEqual(r.rows[0].diff, -1);

// 같은 처방이 이어진 액팅은 한 세션 · 평가는 겹쳐도 한 세션
r = M.analyze({ entries: [e('최라', '작업특수', '09:00')], actRows: [a('최라', SP, '09:00', '09:30'), a('최라', SP, '09:30', '10:00')] });
assert.strictEqual(r.rows[0].actCount, 1); assert.strictEqual(r.rows[0].actList[0].end, '10:00');
r = M.analyze({ entries: [], actRows: [a('평가자', 'FMA', '14:10', '14:40'), a('평가자', '수지기능검사', '14:10', '14:40')] });
assert.strictEqual(r.rows[0].actCount, 1);
r = M.analyze({ entries: [], actRows: [a('따로', SP, '09:00', '09:30'), a('따로', SP, '10:00', '10:30')] });
assert.strictEqual(r.rows[0].actCount, 2); // 떨어진 같은 처방은 두 세션

// "박다S" 오더 ↔ 액팅 "박다" → 한 사람으로 합친다
r = M.analyze({ entries: [e('박다S', '작업특수', '09:00')], actRows: [a('박다', SP, '09:00', '09:30')] });
assert.deepStrictEqual(r.rows.map(x => [x.name, x.diff]), [['박다', 0]]);
// 액팅에 "박다S"가 따로 있으면 합치지 않는다
r = M.analyze({ entries: [e('박다S', '작업특수', '09:00')], actRows: [a('박다S', SP, '09:00', '09:30'), a('박다', SP, '11:00', '11:30')] });
assert.deepStrictEqual(r.rows.map(x => x.name).sort(), ['박다', '박다S']);

// 종류 불일치: 인지 오더를 특수로 액팅 → typeMis, 그래도 그 칸은 액팅된 것
r = M.analyze({ entries: [e('마바', '전산화인지', '09:00')], actRows: [a('마바', SP, '09:05', '09:35')] });
row = r.rows[0]; assert.strictEqual(row.typeMis.length, 1); assert.strictEqual(row.typeMis[0].schedType, '전산화인지'); assert.strictEqual(row.typeMis[0].actType, '작업특수');
assert.strictEqual(r.slotFlagMap['wd|1|1'], 'ok'); assert.strictEqual(Object.values(r.slotTypeMap)[0].name, '마바');

// D/C: 미액팅 칸은 'dc'로, D/C 환자는 종류 불일치를 보지 않는다
const dc = [{ patientName: '사아', therapist: '김가', category: 'S' }];
r = M.analyze({ entries: [e('사아', '작업특수', '11:00')], actRows: [], dcEntries: dc });
assert.strictEqual(r.slotFlagMap['wd|1|1'], 'dc'); assert.strictEqual(r.rows[0].dc, dc[0]);
// D/C인데 액팅: 구분 C는 인지·평가만, S는 특수만 같은 치료사일 때 인정
const dcC = [{ patientName: '아자', therapist: '김가', category: 'C' }];
assert.strictEqual(M.analyze({ entries: [], actRows: [a('아자', SP, '09:00', '09:30')], dcEntries: dcC }).rows[0].dcActedBySameTherapist, false);
assert.strictEqual(M.analyze({ entries: [], actRows: [a('아자', '전산화인지재활치료', '09:00', '09:30')], dcEntries: dcC }).rows[0].dcActedBySameTherapist, true);
assert.strictEqual(M.analyze({ entries: [], actRows: [a('아자', '전산화인지재활치료', '09:00', '09:30', '박다')], dcEntries: dcC }).rows[0].dcActedBySameTherapist, false);

// 동명이인 알파벳, 충돌 칸 제외, 치료사별 집계, 오류 묶음 전달
r = M.analyze({ entries: [e('홍A', '작업특수', '09:00'), e('홍길동A', '작업특수', '09:00'), e('홍길동B', '작업특수', '09:30', { therapist: '이나' }), e('충돌', '작업특수', '10:00', { conflict: true })], actRows: [a('홍길동A', SP, '09:00', '09:30')], issuesByPatient: { 홍길동A: [{ x: 1 }] } });
row = r.rows.find(x => x.name === '홍길동A'); assert.strictEqual(row.dup, true); assert.deepStrictEqual(row.rawNames, ['홍길동A', '홍길동B']); assert.deepStrictEqual(row.issues, [{ x: 1 }]);
assert.ok(!r.rows.some(x => x.name === '충돌')); // 충돌 칸은 환자 집계에서 제외
const th = Object.fromEntries(r.therapistResult.map(t => [t.name, [t.orderCount, t.actCount, t.diff]]));
assert.deepStrictEqual(th['김가'], [3, 1, 2]); assert.deepStrictEqual(th['이나'], [1, 0, 1]); // 치료사별에는 충돌 칸도 센다
// 정렬: 미액팅 많은 순 → 같으면 가나다순
r = M.analyze({ entries: [e('나나', '작업특수', '09:00'), e('가가', '작업특수', '09:00'), e('다다', '작업특수', '09:00'), e('다다', '작업특수', '10:00')], actRows: [] });
assert.deepStrictEqual(r.rows.map(x => x.name), ['다다', '가가', '나나']);
console.log('otmatch 테스트 통과');
