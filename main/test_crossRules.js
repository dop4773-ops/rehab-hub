// 실행: node main/test_crossRules.js
// 교차검증 도구의 Phase 6 규칙(PTA 재원현황 파싱·병실 기준, 현황판 전원 표기, 파일명 인식)을 가짜 시트로 확인한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../renderer/tools/작업치료_교차검증_도구_core내장.html'), 'utf8');
const grab = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i + a.length); assert(i >= 0 && j > i, `marker 없음: ${a}`); return html.slice(i, j); };
// 공통 모듈(core)의 파서를 그대로 쓴다. 가짜 워크북은 sheetCache에 시트를 미리 넣어 둔 book — getSheetCells가 그 캐시를 먼저 돌려준다.
let SHEETS = {};
const { parsePtaSheet } = require('../renderer/core/parsers_pta.js');
const { parseStatusSheet } = require('../renderer/core/parsers_status.js');
const { roomDigits } = require('../renderer/core/normalize.js');
const fakeBook = (names) => ({ sheets: names.map(name => ({ name })), sheetCache: new Map(names.map(n => [n, new Map(Object.entries(SHEETS[n] || {}))])) });
// HTML에 남아 있는 화면 쪽 함수(파일명 인식·수정 시각 라벨)만 아직 잘라서 쓴다
const ctx = { console, ...require('../renderer/core/normalize.js') };
vm.createContext(ctx);
vm.runInContext([
  grab('function fileAgeLabel', 'function renderFreshness'),
  grab('function guessKeyFromFilename', '// 화면 어디에 파일을 끌어다'),
  'this.key=guessKeyFromFilename; this.age=fileAgeLabel;',
].join('\n'), ctx);
ctx.room = roomDigits; ctx.pta = (b) => parsePtaSheet(b); ctx.status = (b) => parseStatusSheet(b);
const sheet = (rows) => { const o = {}; rows.forEach((r, i) => r.forEach((v, j) => { if (v !== null && v !== '') o[`${String.fromCharCode(65 + j)}${i + 1}`] = v; })); return o; };

(async () => {
  // ① 병실 표기: "501:01"(병실:침상)·"501호"·"1001" 모두 병실 번호만 뽑는다
  assert.strictEqual(ctx.room('501:01'), '501'); assert.strictEqual(ctx.room('501호'), '501'); assert.strictEqual(ctx.room(''), '');
  console.log('OK ① 병실 번호 정규화');

  // ② PTA 재원현황: 한 환자가 여러 줄이면 병록#로 합치고, 같은 이름·다른 병록#은 후보 2개
  SHEETS = { Sheet1: sheet([
    ['의사', '병실', '병록#', '성명', '나이', '성별', '재활'],
    ['RM4', '501:01', '2325', '홍길동', '', '', 'Y'],
    ['RM4', '501:01', '2325', '홍길동', '', '', 'X'],       // 같은 병록# 두 번째 줄 — 합쳐짐
    ['RM6', '502:02', '3365', '김동명', '', '', 'A'],
    ['RM7', '703:01', '4001', '김동명', '', '', 'A'],       // 동명이인(다른 병록#)
    ['RM9', '', '5000', '병실없음', '', '', ''],            // 병실 없는 줄은 제외
  ]) };
  const map = await ctx.pta(fakeBook(['Sheet1']));
  assert.strictEqual(map.get('홍길동').length, 1, '병록# 중복 줄은 하나로');
  assert.strictEqual(map.get('홍길동')[0].room, '501'); assert.strictEqual(map.get('홍길동')[0].bed, '01'); assert.strictEqual(map.get('홍길동')[0].rm, 'RM4');
  assert.strictEqual(map.get('김동명').length, 2, '같은 이름 다른 병록#은 후보가 둘');
  assert(!map.has('병실없음'));
  await assert.rejects(() => { SHEETS = { Sheet1: sheet([['a', 'b']]) }; return ctx.pta(fakeBook(['Sheet1'])); }, /찾지 못했습니다|병실\/성명/, '엉뚱한 파일이면 오류');
  console.log('OK ② PTA 재원현황 파싱(병록# 합치기·동명이인 후보)');

  // ③ 현황판: 전원은 "입원" 열이 아니라 특이사항 글자에서만 표시 → transfer 플래그, 퇴원은 따로
  SHEETS = { '현황(회복기)': sheet([
    ['순번', '구분', '진료과', '병실', '성명', '입원일', '회복기', '입원', '특이사항', 'SOT', 'RDT'],
    [1, '일반', 'RM4', '501', '정상환자', '', '', '입원', '', 2, 0],
    [2, '일반', 'RM4', '502', '전원환자', '', '', '입원', '10/6 타병원 전원 예정', 2, 0],
    [3, '일반', 'RM6', '503', '퇴원환자', '', '', '퇴원', '9/30 퇴원', 2, 0],
    [4, '일반', 'RM6', '504', '재입원환자', '', '', '재입원', '', 1, 1],
    [5, '일반', 'RM6', '505', '과거전원환자', '', '', '입원', '4/29 타병원 전원/5/2 재입원', 1, 0],
    [6, '일반', 'RM6', '506', '재입원전원기록', '', '', '재입원', '8/13 전원', 1, 0],
  ]) };
  const st = await ctx.status(fakeBook(['현황(회복기)']));
  const by = (n) => st.list.find(r => r.name === n);
  assert.strictEqual(by('정상환자').transfer, false); assert.strictEqual(by('전원환자').transfer, true);
  assert.strictEqual(by('재입원환자').admit, '재입원');
  assert.strictEqual(by('과거전원환자').transfer, false, '전원 뒤에 재입원이 적혀 있으면 과거 기록');
  assert.strictEqual(by('재입원전원기록').transfer, false, '이미 재입원 상태면 과거 전원 기록');
  assert.strictEqual(st.dischargedList.length, 1); assert.strictEqual(st.dischargedList[0].name, '퇴원환자');
  assert(!st.list.some(r => r.name === '퇴원환자'), '퇴원 환자는 활성 목록에 들어가지 않는다(기존 동작 유지)');
  console.log('OK ③ 현황판 전원 표기·퇴원·재입원 구분');

  // ④ 파일명 인식: "재원현황"이 작업치료현황으로 오인되지 않는다
  assert.strictEqual(ctx.key('재원현황.xlsx'), 'ptaBook'); assert.strictEqual(ctx.key('작업치료현황.xlsx'), 'statusBook');
  assert.strictEqual(ctx.key('3F 환자전체시간표(원본).xlsx'), 'card3Book');
  console.log('OK ④ 파일명 인식');

  // ⑤ 추가 검증용 필드: 현황판 진료과(RM) · PTA 재활 코드
  SHEETS = { '현황(회복기)': sheet([['진료과', '병실', '성명', '입원'], ['RM 4', '501', '가나다', '입원'], [6, '502', '라마바', '재입원']]) };
  const st2 = await ctx.status(fakeBook(['현황(회복기)']));
  assert.strictEqual(st2.list[0].dept, 'RM4', '"RM 4"처럼 띄어 써도 RM4'); assert.strictEqual(st2.list[1].dept, 'RM6', '숫자만 저장된 칸도 RM6');
  SHEETS = { Sheet1: sheet([['의사', '병실', '병록#', '성명', '재활', '재활종료일'], ['RM4', '501:01', '1', '재활환자', 'B_06', ''], ['RM4', '501:01', '1', '재활환자', 'X', '']]) };
  const pm = await ctx.pta(fakeBook(['Sheet1']));
  assert.strictEqual(pm.get('재활환자')[0].rehab, 'B_06', '재활 열(재활종료일과 구분)을 읽는다');
  SHEETS = { '현황(회복기)': sheet([['진료과', '병실', '성명', '입원일', '입원'], ['RM4', '501', '날짜환자', '45398', '입원'], ['RM4', '502', '문자날짜', '2026-06-26', '재입원'], ['RM4', '503', '날짜없음', '', '입원']]) };
  const st3 = await ctx.status(fakeBook(['현황(회복기)']));
  assert.strictEqual(st3.list[0].admitDate, '2024-04-16', '엑셀 날짜 일련번호'); assert.strictEqual(st3.list[1].admitDate, '2026-06-26'); assert.strictEqual(st3.list[2].admitDate, '');
  SHEETS = { Sheet1: sheet([['의사', '병실', '병록#', '성명', '재활', '입원일', '재활시작일'], ['RM4', '501:01', '1', '날짜환자', 'Y', '2026-06-26', '2025-05-29']]) };
  const pm2 = await ctx.pta(fakeBook(['Sheet1'])); assert.strictEqual(pm2.get('날짜환자')[0].adm, '2026-06-26'); assert.strictEqual(pm2.get('날짜환자')[0].start, '2025-05-29');
  console.log('OK ⑤ 현황판 진료과·PTA 재활 코드·입원일');

  // ⑥ 파일 수정 시각 라벨: 달력 날짜 기준, 2일 이상 지나면 old
  const now = new Date(2026, 9, 4, 9, 0);
  const lab = (d, h = 23) => ctx.age(new Date(2026, 9, d, h).getTime(), now);
  assert.strictEqual(lab(4).text, '오늘 수정'); assert.strictEqual(lab(3).text, '어제 수정'); assert(!lab(3).old);
  assert.strictEqual(lab(1).text, '3일 전 수정 (10/1)'); assert(lab(1).old); assert(lab(2).old);
  console.log('OK ⑥ 파일 수정 시각 라벨');
  console.log('ALL PASS');
})().catch((e) => { console.error(e); process.exit(1); });
