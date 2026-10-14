// test_dailyplan.js — 그날의 물리치료시간표·기구시간표 읽기. 실행: node main/test_dailyplan.js
// 칸 글자와 시트 모양은 실제 파일(10/15 시트)에서 가져온 사례들이다.
'use strict';
const assert = require('assert'); const D = require('../renderer/core/dailyplan.js');
const P = (raw, wd) => D.patientOf(raw, wd);
const nm = (raw, wd) => { const p = P(raw, wd); return p ? p.name : null; };

// ── 칸 글자 → 환자 이름
assert.strictEqual(nm('이영미\nB-20'), '이영미');
assert.strictEqual(nm('변경주 TEST\nC-33'), '변경주'); assert.strictEqual(P('변경주 TEST\nC-33').test, true);
assert.strictEqual(nm('배정호TEST'), '배정호'); assert.strictEqual(P('배정호TEST').test, true);
assert.strictEqual(nm('박세훈(외래)\n나-29'), '박세훈'); assert.strictEqual(P('박세훈(외래)\n나-29').outpatient, true);
assert.strictEqual(nm('안주헌(외래)나-25'), '안주헌', '줄바꿈 없이 붙은 침상');
assert.strictEqual(nm('김영옥A M\nB-14'), '김영옥A', '구분 알파벳 A는 이름에 남고 " M"은 뗀다');
assert.strictEqual(nm('김순자D M\nTEST나-31'), '김순자D');
assert.strictEqual(nm('이대양G\nB-14'), '이대양', '이름 뒤 G는 표시'); assert.strictEqual(nm('도대희G\nA-5'), '도대희'); assert.strictEqual(nm('오상열M\n나-24'), '오상열'); assert.strictEqual(nm('권태자M\nB-25'), '권태자');
assert.strictEqual(nm('임태치 BS'), '임태치'); assert.strictEqual(nm('서명희 BS'), '서명희'); assert.strictEqual(nm('김기한M\nA-2 NWB'), '김기한'); assert.strictEqual(nm('권주희M\nA-2 PWB'), '권주희');
assert.strictEqual(nm('이종철A\n나-21'), '이종철A'); assert.strictEqual(nm('이영호A\nC-31'), '이영호A'); assert.strictEqual(nm('장재복A\nB-21'), '장재복A');
assert.strictEqual(nm('박지예(S)\nC-도수'), '박지예'); assert.strictEqual(nm('임태치\n(호흡재활)'), '임태치');
for (const x of ['FES', 'FES\n(10.01~11.30)', '기구1\n(10.01\n~11.30)', '기구2', '10F 로봇', '3F 통증', '10F 통증', '알봇\n\n모닝워크', '출산휴가\n26.07.01\n~26.09.28\n\n육아휴직', '', null, '<심박동기 부착, FES 금지>\n오태봉,김말순', '신달순님 통증부위에 FES 적용', '<FES 변경사항>', '점심시간', '13', 'MSK 체중부하 금지', '이혜림/최현수(통증치료)']) assert.strictEqual(P(x), null, '환자가 아님: ' + JSON.stringify(x));
// 요일 제한: (월수금)은 목요일엔 안 한다
assert.strictEqual(nm('김금학G\n(월수금)', '목'), null); assert.strictEqual(nm('김금학G\n(월수금)', '월'), '김금학'); assert.strictEqual(nm('여영만\n(화목)', '목'), '여영만'); assert.strictEqual(nm('여영만\n(화목)', '수'), null);
assert.strictEqual(nm('하재호\n(월, 금)', '금'), '하재호'); assert.strictEqual(nm('하재호\n(월, 금)', '화'), null);
assert.strictEqual(nm('김무석\n(GAIT)', '목'), '김무석', '(GAIT)·(BS)는 요일이 아님'); assert.strictEqual(nm('서명희\n(BS)', '목'), '서명희'); assert.strictEqual(nm('한부자\n(EST)', '목'), '한부자');
assert.strictEqual(nm('김금학G\n(월수금)', ''), '김금학', '요일을 모르면 거르지 않음');

// 한 칸에 환자 둘(기구·FES 칸): 줄마다 읽고 "("줄은 앞 환자의 조건
const PC = (raw, wd) => D.patientsOfCell(raw, wd).map(p => p.name);
assert.deepStrictEqual(PC('김영옥A\n최상희'), ['김영옥A', '최상희']); assert.deepStrictEqual(PC('김기한\n이복순A'), ['김기한', '이복순A']);
assert.deepStrictEqual(PC('김금학G\n(월수금)\n김두남', '목'), ['김두남'], '조건 줄은 바로 앞 환자에게만 적용'); assert.deepStrictEqual(PC('김금학G\n(월수금)\n김두남', '월'), ['김금학', '김두남']);
assert.deepStrictEqual(PC('김무석\n(GAIT)'), ['김무석']); assert.deepStrictEqual(PC('(GAIT)'), []); assert.deepStrictEqual(PC(''), []); assert.deepStrictEqual(PC('FES\n(3층)'), []);
// ── 치료사 머리글
assert.strictEqual(D.isTherapistName('곽은진'), true); assert.strictEqual(D.isTherapistName('월요일'), false); assert.strictEqual(D.isTherapistName('치료시간'), false); assert.strictEqual(D.isTherapistName('3F 통증'), false); assert.strictEqual(D.isTherapistName('로봇재활'), false);

// ── 시트 이름 / 요일
assert.deepStrictEqual(D.sheetsForDate(['9.30수', '10.1목', '10.15목', '10.3토(1팀)', '10.3토(2팀)', '원본', '10.150'], '2026-10-15'), ['10.15목']);
assert.deepStrictEqual(D.sheetsForDate(['10.3토(1팀)', '10.3토(2팀)', '10.13화'], '2026-10-03'), ['10.3토(1팀)', '10.3토(2팀)'], '같은 날짜 시트가 여럿이면 전부');
assert.deepStrictEqual(D.sheetsForDate(['10월15일(목)', '10월 1일'], '2026-10-15'), ['10월15일(목)']); assert.deepStrictEqual(D.sheetsForDate(['10.1목'], '2026-10-11'), []); assert.deepStrictEqual(D.sheetsForDate(['10.1목'], 'x'), []);
assert.strictEqual(D.weekdayChar('2026-10-15'), '목'); assert.strictEqual(D.weekdayChar('2026-10-12'), '월'); assert.strictEqual(D.weekdayChar('2026-10-17'), '토'); assert.strictEqual(D.weekdayChar('2026-10-18'), '일'); assert.strictEqual(D.weekdayChar(''), '');

// ── 격자 만들기(테스트용): rows = {행번호: {열번호: 글자}}
const mk = (rows) => { const maxRow = Math.max(...Object.keys(rows).map(Number)), maxCol = Math.max(...Object.values(rows).flatMap(r => Object.keys(r).map(Number))); return { get: (r, c) => (rows[r] && rows[r][c]) || '', maxRow, maxCol }; };
// 물리치료시간표 모양: 1행 제목, 3행 치료사 머리글, 점심줄, 두 번째 표(2팀)와 그 오른쪽 옆 표(자기 시간 열이 8열)
const pt = mk({
  1: { 1: '미래병원 - 2026년 10월 15일 목요일 시간표' },
  3: { 1: '치료시간', 2: '정진우', 3: '장연서', 4: '최혜빈', 5: '김혜인', 6: '기구1', 44: '비고' },
  4: { 1: '08:30~09:00', 2: '이영미\nB-20', 3: '변경주 TEST\nC-33', 4: 'FES', 5: '이대양G\nB-14', 6: '3F 통증', 44: '1' },
  5: { 1: '09:05~09:35', 2: '임태치 BS', 3: '박세훈(외래)\n나-29', 5: '이영미\nB-20' },
  6: { 1: '점심시간' },
  7: { 1: '13:00~13:30', 2: '김금학G\n(월수금)', 3: '알봇\n\n모닝워크', 4: '김영옥A M\nB-14' },
  9: { 1: '2팀' },
  10: { 1: '치료시간', 2: '정용범', 3: '김정무', 8: '알봇' },
  11: { 1: '08:30~09:00', 2: '황승진 TEST\nB-27', 8: '08:30~09:00', 9: '장순달' },
  12: { 1: '09:05~09:35', 3: '이영도 TEST\nB-25', 8: '09:05~09:35', 9: '박진헌' },
});
const pe = D.parsePtGrid(pt, '목');
const key = (e) => `${e.name}@${Math.floor(e.startM / 60)}:${String(e.startM % 60).padStart(2, '0')}/${e.therapist}`;
assert.deepStrictEqual(pe.map(key), ['이영미@8:30/정진우', '변경주@8:30/장연서', '이대양@8:30/김혜인', '임태치@9:05/정진우', '박세훈@9:05/장연서', '이영미@9:05/김혜인', '김영옥A@13:00/최혜빈', '황승진@8:30/정용범', '이영도@9:05/김정무'], '치료사 열·시간 줄·두 번째 표, FES·통증·알봇·(월수금)은 빠지고 오른쪽 옆 표(장순달·박진헌)는 안 읽음');
assert.strictEqual(pe.find(e => e.name === '변경주').test, true); assert.strictEqual(pe.find(e => e.name === '박세훈').outpatient, true);
assert.strictEqual(D.parsePtGrid(pt, '월').some(e => e.name === '김금학'), true, '월요일엔 (월수금) 환자가 들어온다');
assert.deepStrictEqual(D.parsePtGrid(mk({ 1: { 1: '아무것도 없는 시트' } }), '목'), []);
assert.deepStrictEqual(D.parsePtGrid(mk({ 3: { 1: '치료시간', 2: '월요일', 3: '화요일' }, 4: { 1: '08:30~09:00', 2: '신상태' } }), '목'), [], '치료사가 아닌 머리글(요일 표)은 건너뜀');

// 기구시간표 모양: 기구 표(치료사 열은 머리글이 "기구1…") + FES 표
const gi = mk({
  3: { 1: '기구운동시간', 2: '기구1 MAT', 3: '경사대\n(1)', 4: '경사대\n(2)', 7: '전동자전거\n(1)', 8: '기구1', 9: '전동자전거\n(2)', 36: '2' },
  4: { 1: '08:30~09:00', 2: '이고은', 7: '서옥자', 8: '이고은', 9: '김부수G', 36: '2' },
  5: { 1: '09:05~09:35', 2: '이고은', 3: '하경심', 4: '오상열\n(월수)', 7: '이정국', 9: '김금학G\n(월수금)' },
  6: { 1: '점심시간' },
  7: { 1: '13:00~13:30', 3: '김주희', 4: '박진호\n최상희', 7: '이종철A', 9: '유봉아\n(GIAT)' },
  19: { 1: 'FES시간', 2: '치료사', 3: 'FES 1', 11: '치료사', 12: 'FES 2', 27: '<FES 변경사항>' },
  20: { 1: '08:30~09:00', 3: '박진호', 4: '전태분\n(월)', 12: '조명옥', 27: '이병찬님(심장박동기 착용) 전기치료 금기' },
  21: { 1: '09:05~09:35', 3: '김기홍', 12: '신달순님 통증부위에 FES 적용', 13: '정도운\n(화목)', 14: '서명희\n(BS)' },
});
const ge = D.parseGiGrid(gi, '목'), gk = (e) => `${e.kind}:${e.name}@${Math.floor(e.startM / 60)}:${String(e.startM % 60).padStart(2, '0')}`;
assert.deepStrictEqual(ge.map(gk), ['기구:서옥자@8:30', '기구:김부수@8:30', '기구:하경심@9:05', '기구:이정국@9:05', '기구:김주희@13:00', '기구:박진호@13:00', '기구:최상희@13:00', '기구:이종철A@13:00', '기구:유봉아@13:00',
  '전기:박진호@8:30', '전기:조명옥@8:30', '전기:김기홍@9:05', '전기:정도운@9:05', '전기:서명희@9:05'], '기구 담당 치료사(이고은)·청구 숫자·FES 안내 글은 환자가 아니고, 목요일엔 (월수)·(월수금)·(월) 환자가 빠진다');
assert.strictEqual(D.parseGiGrid(gi, '월').some(e => e.name === '오상열' && e.kind === '기구'), true);
assert.strictEqual(D.parseGiGrid(gi, '월').some(e => e.name === '전태분' && e.kind === '전기'), true);
assert.deepStrictEqual(D.parseGiGrid(mk({ 1: { 1: '??' } }), '목'), []);

// ── 이름 찾기 / 칸 합치기
const map = D.toMap([{ name: '김영옥A', startM: 545, therapist: '박' }, { name: '이영도', startM: 510, therapist: '최', test: true }], () => '운동');
assert.strictEqual(D.lookup(map, '김영옥A').length, 1); assert.strictEqual(D.lookup(map, '김영옥').length, 1, '구분 알파벳을 뗀 이름이 하나뿐이면 같은 사람'); assert.strictEqual(D.lookup(map, '이영도 ').length, 1); assert.strictEqual(D.lookup(map, '없는사람'), null); assert.strictEqual(D.lookup(null, 'x'), null);
const dup = D.toMap([{ name: '김영옥A', startM: 1 }, { name: '김영옥B', startM: 2 }], () => '운동'); assert.strictEqual(D.lookup(dup, '김영옥'), null, '구분 알파벳이 둘이면 합치지 않음');
const card = [{ startM: 510, text: '운동치료', cat: '운동' }, { startM: 545, text: '작업치료', cat: '작업' }, { startM: 580, text: '기구(ST)', cat: '기구' }, { startM: 615, text: '전기치료', cat: '전기' }];
const gmap = D.toMap([{ name: '가나다', startM: 580, kind: '전기' }], (e) => e.kind), pmap = D.toMap([{ name: '가나다', startM: 700, therapist: '김' }], () => '운동');
assert.deepStrictEqual(D.mergeSlots(card, '가나다', { useDaily: { pt: false, gi: false } }), card, '그날 시간표를 안 쓰면 카드 그대로');
let m = D.mergeSlots(card, '가나다', { useDaily: { pt: true, gi: false }, pt: pmap, gi: gmap });
assert.deepStrictEqual(m.map(s => s.cat + s.startM), ['작업545', '기구580', '전기615', '운동700'], '운동만 그날 것으로 바뀜(카드의 운동 칸은 빠짐)');
m = D.mergeSlots(card, '가나다', { useDaily: { pt: true, gi: true }, pt: pmap, gi: gmap });
assert.deepStrictEqual(m.map(s => s.cat + s.startM), ['작업545', '운동700', '전기580'], '기구·전기도 그날 것으로(카드의 기구·전기는 빠지고, 작업 등은 카드 그대로)');
assert.deepStrictEqual(D.mergeSlots(null, '가나다', { useDaily: { pt: true, gi: false }, pt: pmap }).map(s => s.cat), ['운동']); assert.deepStrictEqual(D.mergeSlots(card, '없는사람', { useDaily: { pt: true, gi: true }, pt: pmap, gi: gmap }).map(s => s.cat), ['작업']);
// ── 이 환자에게 그날 시간표를 쓸 수 있는가(층)
const f10 = { floors: { pt: new Set([10]), gi: new Set() }, pt: D.toMap([{ name: '이종희', startM: 545 }], () => '운동'), gi: new Map() };
assert.strictEqual(D.useDaily(f10, 'pt', 10, '이종희'), true, '10층 시간표 + 10층 환자'); assert.strictEqual(D.useDaily(f10, 'pt', 3, '류정자'), false, '10층 것만 올렸고 3층 환자(이름도 없음) → 카드로 비교');
assert.strictEqual(D.useDaily(f10, 'pt', 3, '이종희'), true, '다른 층이라도 시간표에 이름이 있으면 씀'); assert.strictEqual(D.useDaily(f10, 'pt', 0, '류정자'), false, '층을 모르고 이름도 없으면 안 씀');
assert.strictEqual(D.useDaily(f10, 'gi', 10, '이종희'), false, '기구시간표는 안 올렸음');
assert.strictEqual(D.useDaily({ floors: { pt: new Set([0]), gi: new Set() }, pt: new Map(), gi: new Map() }, 'pt', 3, '누구'), true, '층을 모르는 파일은 모두에게');
assert.strictEqual(D.useDaily(null, 'pt', 10, 'x'), false); assert.strictEqual(D.useDaily({ floors: { pt: new Set(), gi: new Set() } }, 'pt', 10, 'x'), false, '날짜 시트가 없어 층이 비어 있으면 안 씀');
console.log('dailyplan: OK');
