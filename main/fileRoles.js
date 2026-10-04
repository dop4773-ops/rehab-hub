// fileRoles.js — 파일명만으로 역할을 추측하는 순수 함수. Electron에 의존하지 않아 plain Node로 테스트 가능.
// 원본: 재활치료부 통합 프로그램(HTML판) core/folder_registry.js의 FILE_ROLES/guessFileRole을 그대로 옮김.
'use strict';

// required: 홈 화면 "오늘의 데이터"에서 필수/선택 구분에 쓴다.
// multi: 같은 역할의 파일이 여러 개 있어도 전부 쓴다(예: 팀별 일일통계 1·2·3팀). 아니면 가장 최근 파일 1개만 쓴다.
const FILE_ROLES = [
  { key: 'card3', label: '3F 환자전체시간표(원본)', required: true },
  { key: 'card10', label: '10F 환자전체시간표(원본)', required: true },
  { key: 'pt3', label: '3F 물리치료시간표', required: false },
  { key: 'pt10', label: '10F 물리치료시간표', required: false },
  { key: 'mt3', label: '3F 매트·테이블현황', required: true },
  { key: 'mat10', label: '10F 매트현황', required: true },
  { key: 'table10', label: '10F 테이블현황', required: true },
  { key: 'handover', label: 'OT 인수인계', required: false },
  { key: 'dailyStats', label: '일일통계(팀별·당월)', required: false, multi: true },
  { key: 'grandSource', label: '그랜드라운딩 원본', required: false },
  { key: 'acting', label: '치료 액팅 기록', required: false },
  { key: 'status', label: '작업치료현황', required: true },
  { key: 'dailySchedule', label: '작업치료실 시간표(평일)', required: false },
  { key: 'pta', label: 'PTA 재원현황', required: false },
];

function guessFileRole(name) {
  const n = String(name || '').normalize('NFC').replace(/\.[^.]+$/, '');
  const is3 = /(?:^|[^0-9])3\s*(?:F|층)(?![0-9])/i.test(n);
  const is10 = /(?:^|[^0-9])10\s*(?:F|층)(?![0-9])/i.test(n);
  // 토요일/공휴일 시간표 파일("...액팅검사용" 포함)은 아래 "액팅" 규칙에 걸려 액팅 기록으로 오인되던 문제 —
  // 이 파일들은 어느 화면의 업로드 칸에도 해당하지 않으므로 먼저 걸러서 미인식으로 둔다.
  if (/토요일|공휴일/.test(n) && /시간표/.test(n)) return null;
  if (/전체시간표/.test(n)) return is3 && !is10 ? 'card3' : 'card10';
  if (/물리치료.*시간표|PT\s*시간표/i.test(n)) return (is3 && !is10) ? 'pt3' : 'pt10';
  if (/매트/.test(n) && /테이블/.test(n)) return 'mt3';
  if (/매트/.test(n)) return (is3 && !is10) ? 'mt3' : 'mat10';
  if (/테이블/.test(n)) return (is3 && !is10) ? 'mt3' : 'table10';
  if (/인수인계/.test(n)) return 'handover';
  // "재원현황"은 아래 /현황/ 규칙(작업치료현황)에 걸려 오인되므로 그보다 먼저 판단한다.
  if (/재원\s*현황/.test(n)) return 'pta';
  if (/일일\s*통계/.test(n)) return 'dailyStats';
  if (/그랜드라운딩/.test(n)) return 'grandSource';
  if (/액팅|기록통계/.test(n)) return 'acting';
  if (/현황/.test(n)) return 'status';
  // 치료기록 QA의 시간표 칸은 "작업치료실 시간표"(평일)만 받는다 — 통합치료시간표 등 "시간표"만 들어간 다른 파일이
  // 더 최근이라고 이 역할을 가로채던 문제를 막기 위해 작업치료실 시간표로 한정한다.
  if (/작업치료실/.test(n) && /시간표/.test(n)) return 'dailySchedule';
  return null;
}

// 일일통계 파일명이 "이번 달" 것인지(예: "미래병원_1팀_9월_일일통계.xlsm", "09월"). 1월이 11월에 걸리지 않게 앞 글자가 숫자가 아닐 때만 인정한다.
function isCurrentMonthStats(name, now = new Date()) {
  const n = String(name || '').normalize('NFC');
  if (!/일일\s*통계/.test(n)) return false;
  return new RegExp(`(?:^|[^0-9])0?${now.getMonth() + 1}월`).test(n);
}

module.exports = { FILE_ROLES, guessFileRole, isCurrentMonthStats };
