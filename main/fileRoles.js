// fileRoles.js — 파일명만으로 역할을 추측하는 순수 함수. Electron에 의존하지 않아 plain Node로 테스트 가능.
// 원본: 재활치료부 통합 프로그램(HTML판) core/folder_registry.js의 FILE_ROLES/guessFileRole을 그대로 옮김.
'use strict';

// required: 홈 화면 "오늘의 데이터"에서 필수/선택 구분에 쓴다.
const FILE_ROLES = [
  { key: 'card3', label: '3F 환자전체시간표(원본)', required: true },
  { key: 'card10', label: '10F 환자전체시간표(원본)', required: true },
  { key: 'pt3', label: '3F 물리치료시간표', required: false },
  { key: 'pt10', label: '10F 물리치료시간표', required: false },
  { key: 'mt3', label: '3F 매트·테이블현황', required: true },
  { key: 'mat10', label: '10F 매트현황', required: true },
  { key: 'table10', label: '10F 테이블현황', required: true },
  { key: 'handover', label: 'OT 인수인계', required: false },
  { key: 'dailyStats', label: '일일통계', required: false },
  { key: 'grandSource', label: '그랜드라운딩 원본', required: false },
  { key: 'acting', label: '치료 액팅 기록', required: false },
  { key: 'status', label: '작업치료현황', required: true },
  { key: 'dailySchedule', label: '작업치료실 시간표(일별)', required: false },
];

function guessFileRole(name) {
  const n = String(name || '').normalize('NFC').replace(/\.[^.]+$/, '');
  const is3 = /(?:^|[^0-9])3\s*(?:F|층)(?![0-9])/i.test(n);
  const is10 = /(?:^|[^0-9])10\s*(?:F|층)(?![0-9])/i.test(n);
  if (/전체시간표/.test(n)) return is3 && !is10 ? 'card3' : 'card10';
  if (/물리치료.*시간표|PT\s*시간표/i.test(n)) return (is3 && !is10) ? 'pt3' : 'pt10';
  if (/매트/.test(n) && /테이블/.test(n)) return 'mt3';
  if (/매트/.test(n)) return (is3 && !is10) ? 'mt3' : 'mat10';
  if (/테이블/.test(n)) return (is3 && !is10) ? 'mt3' : 'table10';
  if (/인수인계/.test(n)) return 'handover';
  if (/일일\s*통계/.test(n)) return 'dailyStats';
  if (/그랜드라운딩/.test(n)) return 'grandSource';
  if (/액팅|기록통계/.test(n)) return 'acting';
  if (/현황/.test(n)) return 'status';
  if (/시간표/.test(n)) return 'dailySchedule';
  return null;
}

module.exports = { FILE_ROLES, guessFileRole };
