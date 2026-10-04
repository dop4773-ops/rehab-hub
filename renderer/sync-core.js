// sync-core.js — 데이터 동기화 상태 판정(순수 함수). 브라우저에서는 전역 RehabSync, Node에서는 require로 테스트한다.
// "파일 수정 시각"(디스크의 현재 상태)과 "프로그램 반영 시각"(프로그램이 마지막으로 읽어들인 시점)을 분리해서
// 서명(경로|수정시각|크기)이 다르면 단순히 "최신"이라 하지 않고 "업데이트 필요"로 구분한다.
'use strict';
(function (root) {
  const entrySig = (e) => (e ? `${e.path}|${e.mtimeMs}|${e.size}` : '');

  // 스캔 결과에서 역할 하나의 현재 서명. multi 역할(일일통계)은 파일 전체의 서명을 합친다.
  function roleSig(scan, role) {
    if (!scan) return '';
    const all = scan.matchedAll && scan.matchedAll[role];
    if (all && all.length) return all.map(entrySig).sort().join(';');
    return entrySig(scan.matched && scan.matched[role]);
  }
  function rolesSig(scan, roles) { return roles.map(r => roleSig(scan, r)).join('#'); }

  // missing(파일 없음) · updating(업데이트 중) · error(읽기 오류) · latest(최신) · stale(업데이트 필요)
  function roleState({ sig, reflectedSig, updating, error }) {
    if (!sig) return 'missing';
    if (updating) return 'updating';
    if (error) return 'error';
    return reflectedSig === sig ? 'latest' : 'stale';
  }

  const STATE_LABEL = {
    latest: '✓ 최신', stale: '⚠ 업데이트 필요', updating: '↻ 업데이트 중', missing: '✕ 파일 없음', error: '! 읽기 오류',
  };

  // 자동 동기화 주기(분). launch/manual은 주기 반영 없음(launch=앱 실행 때 한 번만, manual=사용자가 누를 때만).
  const MODE_MINUTES = { launch: 0, manual: 0, '5': 5, '10': 10, '30': 30, '60': 60 };
  const isValidMode = (m) => Object.prototype.hasOwnProperty.call(MODE_MINUTES, m);
  function isSyncDue({ mode, now, lastSyncAt }) {
    const min = MODE_MINUTES[mode];
    return !!min && now - lastSyncAt >= min * 60000;
  }

  root.RehabSync = { entrySig, roleSig, rolesSig, roleState, STATE_LABEL, MODE_MINUTES, isValidMode, isSyncDue };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RehabSync;
})(typeof window !== 'undefined' ? window : globalThis);
