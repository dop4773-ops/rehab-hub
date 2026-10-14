// envReport.js — 설정 › 환경 점검 결과를 사람이 읽는 목록으로 만드는 순수 함수(화면·파일 접근 없음).
// 브라우저: <script src="core/envReport.js"> / Node: require() (테스트용)
// env: main/ipc/env.ipc.js가 돌려준 값 · scan: 폴더 스캔 결과({matched, unmatched, errors, folders}) · roles: FILE_ROLES
'use strict';
(function (root) {
const isOneDrivePath = (p) => /[\\/]OneDrive[^\\/]*(?:[\\/]|$)/i.test(String(p || ''));
const ageText = (mtimeMs, now) => {
  const d = Math.floor((now - mtimeMs) / 86400000);
  return d <= 0 ? '오늘 수정' : d === 1 ? '어제 수정' : `${d}일 전 수정`;
};
const osName = (e) => (e.platform === 'win32' ? `Windows ${e.release}` : e.platform === 'darwin' ? `macOS (Darwin ${e.release})` : `${e.platform} ${e.release}`);

// 반환: {items:[{level:'ok'|'warn'|'err'|'info', group, title, detail}], counts:{ok,warn,err,info}, text}
function build({ env, scan, roles, now = Date.now(), schedule = null }) {
  const items = [], add = (level, group, title, detail = '') => items.push({ level, group, title, detail });
  const e = env || {}, s = scan || { matched: {}, unmatched: [], errors: [], folders: [] };

  add('info', '프로그램', `재활치료부 통합 시스템 ${e.app || '?'}`, `${osName(e)} · ${e.arch || ''} · Electron ${e.electron || '?'}`);

  for (const [key, label] of [['dataDir', '데이터 저장 폴더'], ['exportDir', '엑셀·CSV 저장 폴더']]) {
    const d = e[key]; if (!d) continue;
    if (d.writable) add('ok', '저장 공간', `${label}에 쓸 수 있어요`, d.path);
    else add('err', '저장 공간', `${label}에 쓸 수 없어요`, `${d.path} (${d.error || '권한 없음'}) — 설정 › 파일 저장에서 다른 폴더를 고르세요.`);
  }

  const folders = e.folders || [];
  if (!folders.length && !(s.manualRoles || []).length) add('err', '폴더 연결', '연결된 폴더가 없어요', '설정 › 데이터·동기화에서 시간표·현황이 있는 폴더를 추가하세요.');
  for (const f of folders) {
    if (!f.exists) add('err', '폴더 연결', `「${f.label}」 폴더를 찾을 수 없어요`, `${f.dirPath} — 이동·삭제됐거나 OneDrive가 아직 내려받지 않았을 수 있어요.`);
    else if (f.error) add('err', '폴더 연결', `「${f.label}」 폴더를 읽을 수 없어요`, `${f.dirPath} (${f.error})`);
    else if (!f.xlsx) add('warn', '폴더 연결', `「${f.label}」 폴더에 엑셀 파일이 없어요`, f.dirPath);
    else add('ok', '폴더 연결', `「${f.label}」 엑셀 ${f.xlsx}개`, f.dirPath);
  }
  for (const er of s.errors || []) add('err', '폴더 연결', `${er.folder}: 읽기 실패`, er.error);

  const probe = new Map((e.files || []).map(f => [f.path, f]));
  let oneDriveFiles = 0;
  for (const r of roles || []) {
    const f = (s.matched || {})[r.key];
    if (!f) { add(r.required ? 'err' : 'info', '파일 인식', `${r.label}: 못 찾았어요`, r.required ? '연결한 폴더에서 이 파일을 찾지 못했어요. 파일 이름에 "전체시간표·매트·테이블·현황" 같은 글자가 있어야 인식돼요.' : '선택 파일이라 없어도 돼요.'); continue; }
    if (isOneDrivePath(f.path)) oneDriveFiles++;
    const p = probe.get(f.path), base = `${r.label}: ${f.name}`, age = ageText(f.mtimeMs, now);
    if (!p) { add('ok', '파일 인식', base, age); continue; }
    if (p.placeholder) add('warn', '파일 읽기', `${base} — OneDrive에서 아직 내려받지 않은 파일이에요`, '「필요할 때 다운로드」 상태라 처음 열 때 오래 걸리거나 실패할 수 있어요. 파일을 우클릭 › 「항상 이 장치에 유지」로 바꿔 두세요.');
    else if (p.readable === false) add('err', '파일 읽기', `${base} — 열 수 없어요`, `${p.error || '권한 없음'} — 다른 곳에서 잠겨 있거나 접근 권한이 없을 수 있어요.`);
    else if (p.size === 0) add('err', '파일 읽기', `${base} — 파일이 비어 있어요(0바이트)`, 'OneDrive 동기화 중 깨졌을 수 있어요. 원본을 다시 저장해 주세요.');
    else if (p.zip === false) add('err', '파일 읽기', `${base} — 엑셀 형식이 아니거나 손상됐어요`, '엑셀에서 열어 다시 저장해 보세요.');
    else if (p.ms >= 3000) add('warn', '파일 읽기', `${base} — 여는 데 ${(p.ms / 1000).toFixed(1)}초 걸렸어요`, '네트워크 폴더이거나 동기화 중일 수 있어요.');
    else add('ok', '파일 읽기', base, `${age} · 읽기 정상`);
  }
  if ((s.unmatched || []).length) {
    const names = s.unmatched.slice(0, 5).map(u => u.name).join(', ');
    add('info', '파일 인식', `이름으로 역할을 알 수 없는 엑셀 ${s.unmatched.length}개`, `${names}${s.unmatched.length > 5 ? ' …' : ''} — 이 프로그램이 쓰는 파일이라면 파일 이름에 역할 글자가 있는지 확인하세요.`);
  }

  if (oneDriveFiles) {
    if (e.oneDriveRunning === false) add('err', 'OneDrive', 'OneDrive가 꺼져 있어요', '연결한 파일이 OneDrive 폴더에 있는데 프로그램이 실행 중이 아니에요. 작업 표시줄에서 OneDrive를 켜세요.');
    else if (e.oneDriveRunning === true) add('ok', 'OneDrive', `OneDrive 실행 중 · 연결 파일 ${oneDriveFiles}개가 OneDrive 폴더에 있어요`);
    else add('info', 'OneDrive', `연결 파일 ${oneDriveFiles}개가 OneDrive 폴더에 있어요`, '이 PC에서는 OneDrive 실행 여부를 확인할 수 없어요(Windows에서만 확인).');
  }

  if (schedule && (schedule.files || schedule.items.length)) {
    for (const x of schedule.items) add('warn', '시간표 파일', x.text);
    if (schedule.robot && schedule.robot.length) add('warn', '시간표 파일', `로봇재활 종료일 확인: ${schedule.robot.slice(0, 5).map(r => `${r.name}(${r.left < 0 ? Math.abs(r.left) + '일 지남' : r.left === 0 ? '오늘 종료' : r.left + '일 뒤 종료'})`).join(', ')}`);
    if (!schedule.items.length && !(schedule.robot && schedule.robot.length)) add('ok', '시간표 파일', `오늘 시트·제목 날짜 정상 (${schedule.files}개 파일 확인)`);
  }
  const counts = { ok: 0, warn: 0, err: 0, info: 0 }; for (const i of items) counts[i.level]++;
  const mark = { ok: '✔', warn: '⚠', err: '✖', info: 'ℹ' };
  const text = `[환경 점검 ${new Date(now).toLocaleString('ko-KR')}] 문제 ${counts.err} · 주의 ${counts.warn} · 정상 ${counts.ok}\n` +
    items.map(i => `${mark[i.level]} [${i.group}] ${i.title}${i.detail ? ' — ' + i.detail : ''}`).join('\n');
  return { items, counts, text };
}
const api = { build, isOneDrivePath, ageText };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RehabEnvReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
