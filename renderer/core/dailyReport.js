// dailyReport.js — 홈의 「오늘 점검」 결과를 구역별 목록(과 복사용 글)으로 만드는 순수 함수(화면·파일 접근 없음).
// 브라우저: <script src="core/dailyReport.js"> / Node: require() (테스트용)
// in: { files:{reqFound,reqTotal,missReq:[라벨],stale:[라벨],err:[라벨],synced:n},
//       handover:{cls:'ok'|'warn'|'err'|..., text}, cross:요약|null, acting:요약|null,
//       sync:{level,title,detail}, backup:{level,title,detail}|null, now:ms }
// 반환: { level:'ok'|'warn'|'err', sections:[{key,title,level,lines:[{level,text}]}], text }
'use strict';
(function (root) {
const RANK = { ok: 0, info: 0, warn: 1, err: 2 };
const worst = (ls) => ls.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
const MARK = { ok: '✔', info: 'ℹ', warn: '⚠', err: '✖' };

function build(inp) {
  const { files = {}, handover = null, cross = null, acting = null, sync = null, backup = null } = inp || {};
  const now = new Date(inp && inp.now != null ? inp.now : Date.now());
  const secs = [], sec = (key, title, lines) => secs.push({ key, title, lines, level: worst(lines.map(l => l.level)) });
  const L = (level, text) => ({ level, text });

  // 1) 파일
  { const ls = [];
    if (files.missReq && files.missReq.length) ls.push(L('err', `필수 파일 ${files.missReq.length}개를 못 찾았어요: ${files.missReq.join(' · ')}`));
    if (files.err && files.err.length) ls.push(L('err', `읽기 오류 ${files.err.length}개: ${files.err.join(' · ')}`));
    if (files.stale && files.stale.length) ls.push(L('warn', `아직 반영 안 된 파일 ${files.stale.length}개: ${files.stale.join(' · ')}`));
    if (!ls.length) ls.push(L('ok', `필수 파일 ${files.reqFound}/${files.reqTotal} 최신${files.synced ? ` · 이번에 ${files.synced}개 새로 반영` : ''}`));
    if (sync && (sync.level === 'err' || sync.level === 'warn')) ls.push(L(sync.level, sync.title + (sync.detail ? ` — ${sync.detail}` : '')));
    sec('files', '파일', ls); }

  // 2) 인수인계
  if (handover) sec('handover', '인수인계', [L(handover.cls === 'ok' ? 'ok' : handover.cls === 'err' ? 'err' : 'warn', handover.text)]);

  // 3) 교차검증
  { const ls = [];
    if (!cross) ls.push(L('warn', '교차검증을 실행하지 못했어요 — 필수 파일이 모두 있는지 확인하세요'));
    else {
      const since = cross.since ? `${cross.since.slice(5).replace('-', '/')} 이후 ` : '';
      const chg = cross.since ? ` (${since}새로 ${cross.newCount} · 해결 ${cross.resolvedCount})` : '';
      ls.push(L(cross.count ? 'warn' : 'ok', cross.count ? `불일치 ${cross.count}건${chg}` : `불일치 없음${chg}`));
      if (cross.carry && cross.carry.count) ls.push(L(cross.carry.hot ? 'err' : 'warn', `어제부터 계속된 불일치 ${cross.carry.count}건${cross.carry.hot ? ` (3일 이상 ${cross.carry.hot}건)` : ''}`));
      for (const a of cross.anomalies || []) ls.push(L('warn', `자료가 평소와 달라요: ${a}`));
      if (cross.skipNotes && cross.skipNotes.length) ls.push(L('info', `이번에 검사하지 못한 것: ${cross.skipNotes.join(' · ')}`));
      if (cross.byWho && cross.byWho.length) ls.push(L('info', `확인 필요 담당: ${cross.byWho.slice(0, 3).map(w => `${w.name} ${w.count}`).join(' · ')}`));
    }
    sec('cross', '교차검증', ls); }

  // 4) 치료기록 QA
  sec('acting', '치료기록 QA', [!acting ? L('info', '액팅 기록 파일이 없어 검사하지 않았어요') : acting.count ? L('err', `치료기록 오류 ${acting.count}건${acting.warnCount ? ` · 기타 ${acting.warnCount}건` : ''}`) : L('ok', '치료기록 오류 없음')]);

  // 5) 백업
  if (backup && backup.level !== 'off') sec('backup', '백업', [L(backup.level === 'ok' ? 'ok' : 'warn', backup.title || (backup.level === 'ok' ? '백업 정상' : '백업 확인 필요') + (backup.detail ? ` — ${backup.detail}` : ''))]);

  const level = worst(secs.map(s => s.level));
  const head = `[${now.getMonth() + 1}/${now.getDate()}(${'일월화수목금토'[now.getDay()]}) 오늘 점검] ${level === 'ok' ? '이상 없음' : level === 'warn' ? '확인할 것이 있어요' : '바로 확인이 필요해요'}`;
  const text = head + '\n' + secs.flatMap(s => s.lines.map(l => `${MARK[l.level]} ${s.title}: ${l.text}`)).join('\n');
  return { level, sections: secs, text };
}
const api = { build };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RehabDailyReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
