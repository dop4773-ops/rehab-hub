// cards.js — 환자전체시간표(원본)의 "환자 카드" 읽기 공통 모듈. 그랜드라운딩(parsePatientsFromBook)과 교차검증(parsePatientCards)이
// 각자 갖고 있던 카드 위치 찾기·요일 칸 찾기·시간 줄 읽기를 한 곳으로 합친 것. 두 도구가 이 위에서 각자 필요한 값(일정표 / 위치·횟수 검증용 목록)을 만든다.
// 카드 한 장 = "이름" 머리글(row,col) 기준 상대 위치: 이름 +1줄, 등록번호 +3열, 병실 +6열, 성별 +8열, 나이 +10열,
// RM·주치료실·onset은 +5줄, 작성일은 +7줄, 그 아래 "시간 | (치료위치) | 월~금 | 토요일/공휴일" 표.
// 브라우저: <script src="../core/cards.js"> 로 전역 RehabCore 사용 / Node: require() (테스트용)
'use strict';
(function (root) {
const { splitRef, getCell } = (typeof require === 'function' && typeof module !== 'undefined') ? require('./xlsx-reader.js') : root.RehabCore;
const { normalizeText } = (typeof require === 'function' && typeof module !== 'undefined') ? require('./normalize.js') : root.RehabCore;

const DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일/공휴일'];
function dayLabel(v) {
  const s = normalizeText(v).replace(/\s+/g, '');
  if (s === '토요일/공휴일' || s === '토요일공휴일') return '토요일/공휴일';
  return DAYS.slice(0, 5).includes(s) ? s : '';
}

// 시트에서 "이름" 머리글을 전부 찾는다(위→아래, 왼→오른). hasRegLabel = 같은 줄 +3열이 "등록번호"인 진짜 카드 머리글.
function findCardBlocks(cells) {
  const out = [];
  for (const [ref, val] of cells.entries()) {
    if (normalizeText(val) !== '이름') continue;
    const rc = splitRef(ref); if (!rc) continue;
    out.push({ row: rc.row, col: rc.col, hasRegLabel: normalizeText(getCell(cells, rc.row, rc.col + 3)) === '등록번호' });
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

// 이름·번호·병실 등 머리 정보(원본 셀 값 그대로 — 가공은 각 도구가 한다)
function readCardHead(cells, b) {
  const r = b.row, c = b.col, g = (dr, dc) => getCell(cells, r + dr, c + dc);
  return { name: normalizeText(g(1, 0)), reg: normalizeText(g(1, 3)), room: normalizeText(g(1, 6)), gender: normalizeText(g(1, 8)), age: normalizeText(g(1, 10)),
    rmRaw: g(5, 0), primaryRaw: g(5, 3), onsetRaw: g(5, 8), writtenRaw: g(7, 8) };
}

// "시간" 머리글 줄 찾기. 1순위: 같은 줄 +2열이 "치료위치"(입원·7병동 카드) 또는 "월요일"(외래 카드, 치료위치 칸 없음)인 줄 — 이름 줄 아래 end 줄까지.
// 2순위(옛 그랜드라운딩 규칙): 이름 줄 +7~+10 사이의 "시간" 줄. 못 찾으면 null.
function findTimeHeader(cells, b, end) {
  const lim = end == null ? b.row + 40 : end;
  for (let r = b.row; r <= lim; r++) {
    if (normalizeText(getCell(cells, r, b.col)) !== '시간') continue;
    const x = normalizeText(getCell(cells, r, b.col + 2));
    if (/치료위치/.test(x)) return { row: r, hasLocCol: true };
    if (/월요일/.test(x)) return { row: r, hasLocCol: false };
  }
  for (let r = b.row + 7; r <= b.row + 10; r++) {
    if (normalizeText(getCell(cells, r, b.col)) === '시간') return { row: r, hasLocCol: /치료위치/.test(normalizeText(getCell(cells, r, b.col + 2))) };
  }
  return null;
}

// 요일별 열 위치: 머리글 글자로 찾고, 머리글 칸이 비어 있는 요일은 표준 간격(3열씩; 입원 카드 +4,+7…+19 / 외래 카드 +2,+5…+17)으로 보충한다.
// (보충은 다른 요일 머리글이 표준 위치에 있고 그 칸이 비어 있을 때만 — 실제 시간표에서 금요일 머리글 칸이 빈 카드가 있어 그 환자의 금요일 일정이 통째로 빠지던 문제)
function cardDayCols(cells, b, hdrRow, hasLocCol) {
  const cols = {};
  for (let cc = b.col + 1; cc <= b.col + 21; cc++) { const d = dayLabel(getCell(cells, hdrRow, cc)); if (d) cols[d] = cc; }
  const std = (hasLocCol ? [4, 7, 10, 13, 16, 19] : [2, 5, 8, 11, 14, 17]).map(o => b.col + o);
  const missing = DAYS.filter(d => !cols[d]);
  if (missing.length && missing.length <= 2 && DAYS.every((d, i) => !cols[d] || cols[d] === std[i])) {
    DAYS.forEach((d, i) => { if (!cols[d] && !normalizeText(getCell(cells, hdrRow, std[i]))) cols[d] = std[i]; });
  }
  return cols;
}

// 시간 칸이 비어 있지 않은 줄들: [{row, timeRaw, locRaw, texts:{요일: 글자}}] — 시간 해석과 치료 문구 필터는 각 도구가 한다.
function cardRows(cells, b, hdr, dayCols, end) {
  const out = [];
  for (let r = hdr.row + 1; r <= end; r++) {
    const timeRaw = getCell(cells, r, b.col); if (timeRaw === '') continue;
    const texts = {}; for (const d of Object.keys(dayCols)) texts[d] = normalizeText(getCell(cells, r, dayCols[d]));
    out.push({ row: r, timeRaw, locRaw: hdr.hasLocCol ? getCell(cells, r, b.col + 2) : '', texts });
  }
  return out;
}

const api = { DAYS, dayLabel, findCardBlocks, readCardHead, findTimeHeader, cardDayCols, cardRows };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
