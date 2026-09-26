'use strict';
// shell.js — 사이드바 화면 전환 + 폴더 자동 연결 + 3개 도구(iframe) 자동 채움 + 홈 대시보드.
// window.rehab.* 는 preload.js가 노출한 메인프로세스 API(폴더 선택/스캔/파일 읽기)만 제공한다.

// 도구(iframe) 하나를 새로 추가하려면: 여기 TOOLS에 항목 하나 추가 + index.html에 사이드바
// 메뉴/뷰 섹션/iframe/기능 카드(통계박스 id는 statBoxesElId와 맞출 것) + 그 도구 파일에 window.__xxxSummary
// 훅 한 줄만 추가하면 된다. autoFillTool/ensureToolLoaded/readToolSummary/renderHome은 전부 이 표만 본다.
const TOOLS = {
  rm: {
    label: '그랜드라운딩',
    page: 'tools/그랜드라운딩_통합.html',
    // 각 도구 화면의 실제 업로드 칸 selector. core/build_folder_connector.js(HTML판)와 동일한 매핑을 그대로 씀.
    targets: [
      { roles: ['card3', 'card10'], selector: '#fileInput' },
      { role: 'status', selector: '#grandOtFileInput' },
      { role: 'handover', selector: '#grandHandoverFileInput' },
      { role: 'pt10', selector: '#grandPt10FileInput' },
      { role: 'pt3', selector: '#grandPt3FileInput' },
    ],
    readSummary: (w) => w.__rmSummary ? { count: w.__rmSummary.patientCount, label: '환자', ...w.__rmSummary } : null,
    statBoxesElId: 'rmStatBoxes',
    statBoxes: (s) => [
      { cls: 'neutral', num: s ? `${s.patientCount}명` : '-', lbl: '전체 환자' },
      { cls: 'neutral', num: s ? `${s.floor10Count}명` : '-', lbl: '10F' },
    ],
    alertRow: (s) => s && alertRow('그랜드라운딩 데이터', `${s.count}명 준비됨`, 'green',
      `[그랜드라운딩] 오늘 회진 대상 환자 ${s.count}명 준비됨`),
    reportBoxesElId: 'reportRmBoxes', reportStatusElId: 'reportRmStatus',
    reportExportBtnId: 'reportRmExportBtn', toolExportBtnId: 'grandExportSelectedBtn',
  },
  acting: {
    label: '치료기록 QA',
    page: 'tools/치료_액팅_기록_오류_확인_프로그램_언어분류.html',
    targets: [
      { role: 'acting', selector: '#fileInput' },
      { role: 'dailyStats', selector: '#dcFileInput' },
    ],
    readSummary: (w) => w.__actingSummary ? { count: w.__actingSummary.errorCount, label: '오류', ...w.__actingSummary } : null,
    statBoxesElId: 'actingStatBoxes',
    statBoxes: (s) => [
      { cls: 'red', num: s ? `${s.errorCount}건` : '-', lbl: '치료기록 오류' },
      { cls: 'orange', num: s ? `${s.warnCount}건` : '-', lbl: '기타 오류' },
    ],
    alertRow: (s) => s && alertRow('치료기록 오류', `${s.count}건`, s.count ? 'red' : 'green',
      s.count ? `[치료기록 QA] 치료기록 오류 ${s.count}건 발견 — 재활치료부 앱에서 확인` : null),
    reportBoxesElId: 'reportActingBoxes', reportStatusElId: 'reportActingStatus',
    reportExportBtnId: 'reportActingExportBtn', toolExportBtnId: 'downloadCsvBtn',
  },
  cross: {
    label: '교차검증',
    page: 'tools/작업치료_교차검증_도구_core내장.html',
    targets: [
      { role: 'status', selector: 'input[data-key="statusBook"]' },
      { role: 'card10', selector: 'input[data-key="card10Book"]' },
      { role: 'card3', selector: 'input[data-key="card3Book"]' },
      { role: 'mat10', selector: 'input[data-key="mat10Book"]' },
      { role: 'table10', selector: 'input[data-key="table10Book"]' },
      { role: 'mt3', selector: 'input[data-key="mt3Book"]' },
      { role: 'handover', selector: 'input[data-key="handoverBook"]' },
    ],
    readSummary: (w) => w.__crossSummary ? { count: w.__crossSummary.issueCount, label: '검증 결과', ...w.__crossSummary } : null,
    statBoxesElId: 'crossStatBoxes',
    statBoxes: (s) => [
      { cls: 'green', num: s ? `${s.checkedTotal - s.problemTotal}건` : '-', lbl: '정상' },
      { cls: 'red', num: s ? `${s.problemTotal}건` : '-', lbl: '불일치' },
    ],
    alertRow: (s) => s && alertRow('교차검증 결과', `${s.count}건`, s.count ? 'orange' : 'green',
      s.count ? `[교차검증] 불일치 ${s.count}건 발견 — 재활치료부 앱에서 확인` : null),
    reportBoxesElId: 'reportCrossBoxes', reportStatusElId: 'reportCrossStatus',
    reportExportBtnId: 'reportCrossExportBtn', toolExportBtnId: 'btnExcel',
  },
};
// 홈 화면 "오늘 확인할 항목" 표시 순서(오류/불일치를 먼저 보여준다) — TOOLS 순서와는 별개로 관리.
const ALERT_ORDER = ['acting', 'cross', 'rm'];

let fileRoles = [];
let lastScan = null; // {matched, unmatched, errors, folders}
const fileCache = new Map(); // role -> File
const loadedTools = new Set();
const activityLog = [];

// ── 공용 유틸 ──────────────────────────────────────────────
function logActivity(feature, detail, ok = true) {
  activityLog.unshift({ time: new Date(), feature, detail, ok });
  if (activityLog.length > 12) activityLog.length = 12;
  renderActivity();
}

async function getFileForRole(role) {
  if (fileCache.has(role)) return fileCache.get(role);
  const m = lastScan && lastScan.matched[role];
  if (!m) return null;
  const bytes = await window.rehab.folders.readFile(m.path);
  const file = new File([bytes], m.name);
  fileCache.set(role, file);
  return file;
}

// core/folder_connector_ui.js의 fillInput과 동일한 방식: 실제 <input>에 DataTransfer로 파일을 넣고
// 기존 change 이벤트를 그대로 발생시킨다 — 도구 내부 로직은 전혀 건드리지 않는다.
function fillInput(doc, selector, files) {
  const input = doc.querySelector(selector);
  if (!input || !files.length) return false;
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

async function autoFillTool(toolKey) {
  const targets = TOOLS[toolKey] && TOOLS[toolKey].targets;
  const iframe = document.querySelector(`iframe[data-tool="${toolKey}"]`);
  if (!targets || !lastScan || !iframe || !iframe.contentDocument) return 0;
  const doc = iframe.contentDocument;
  let filled = 0;
  for (const t of targets) {
    const roles = t.roles || [t.role];
    const files = [];
    for (const r of roles) { const f = await getFileForRole(r); if (f) files.push(f); }
    if (files.length && fillInput(doc, t.selector, files)) filled++;
  }
  return filled;
}

async function autoFillAllLoadedTools() {
  for (const key of loadedTools) {
    const n = await autoFillTool(key);
    if (n) logActivity(TOOLS[key].label, `${n}개 칸 자동 채움`);
    waitForSummaryThenRender(key);
  }
}

// 도구 내부 분석은 change 이벤트 처리 안에서 비동기로 끝나 즉시 값이 안 잡힐 수 있다.
// 짧게 몇 번만 다시 확인해보고, 값이 잡히면(또는 포기 시점이면) 홈을 다시 그린다.
async function waitForSummaryThenRender(key, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if (readToolSummary(key)) { renderHome(); return; }
    await new Promise(r => setTimeout(r, 250));
  }
}

// 도구(iframe)는 sandbox라 window.rehab(IPC)에 직접 접근 못 한다 — 대신 같은 출처(app://rehab-shell)라
// iframe.contentWindow에 함수를 직접 심어줄 수 있다. 지금은 그랜드라운딩의 "일정 보관함"만 쓰지만,
// 모든 도구에 공통으로 심어둬서 나중에 다른 도구도 바로 쓸 수 있게 한다(TOOLS 레지스트리와 같은 확장 취지).
const SCHEDULES_BRIDGE = {
  save: (entry) => window.rehab.schedules.save(entry),
  list: () => window.rehab.schedules.list(),
  load: (ids) => window.rehab.schedules.load(ids),
  delete: (id) => window.rehab.schedules.delete(id),
};

// ── 사이드바 / 화면 전환 ───────────────────────────────────
function ensureToolLoaded(key) {
  if (!TOOLS[key]) return;
  const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
  if (!loadedTools.has(key)) {
    loadedTools.add(key);
    iframe.addEventListener('load', async () => {
      iframe.contentWindow.__schedulesApi = SCHEDULES_BRIDGE;
      // 도구 쪽에서 "브리지가 막 연결됐다"는 걸 알아야 하는 화면(그랜드라운딩의 일정 보관함 목록 등)을 위한
      // 선택적 훅 — 함수를 정의해둔 도구만 반응하고, 없으면 그냥 넘어간다.
      iframe.contentWindow.__onSchedulesApiReady?.();
      const n = await autoFillTool(key);
      logActivity(TOOLS[key].label, n ? `화면 열림 · ${n}개 칸 자동 채움` : '화면 열림');
      renderHome();
      await waitForSummaryThenRender(key); // 도구의 분석은 change 이벤트 이후 비동기로 끝나므로, 끝날 때까지 기다렸다가 다시 그림
    });
    iframe.src = TOOLS[key].page;
  }
}

function showView(key) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === key));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  ensureToolLoaded(key);
  if (key === 'home') renderHome();
  if (key === 'data') renderDataView();
  if (key === 'settings') renderSettingsView();
  if (key === 'report') renderReportView();
}

document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => showView(n.dataset.nav)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => showView(el.dataset.goto)));

// ── 폴더 스캔 ──────────────────────────────────────────────
async function runScan(statusEl) {
  if (statusEl) statusEl.textContent = '등록된 폴더에서 찾는 중…';
  try {
    lastScan = await window.rehab.folders.scanAll();
    fileCache.clear();
    const foundCount = Object.keys(lastScan.matched).length;
    if (statusEl) {
      statusEl.textContent = lastScan.folders.length
        ? `폴더 ${lastScan.folders.length}개 확인 · ${foundCount}/${fileRoles.length}개 파일 인식`
        : '등록된 폴더가 없습니다. "설정"에서 먼저 추가해 주세요.';
    }
    logActivity('데이터 준비', `${foundCount}개 파일 자동 불러오기 완료`);
    await autoFillAllLoadedTools();
    renderHome();
    renderDataView();
  } catch (e) {
    if (statusEl) statusEl.textContent = '자동 불러오기 실패: ' + e.message;
  }
}

// ── 렌더링 ─────────────────────────────────────────────────
function formatFileTime(mtimeMs) {
  const d = new Date(mtimeMs);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fileChecklistHtml() {
  const matched = (lastScan && lastScan.matched) || {};
  return fileRoles.map(r => {
    // 인수인계는 그랜드라운딩·교차검증이 폴더의 파일 없이도 실시간 조회로 자동으로 가져온다 —
    // 폴더 스캔 결과("미발견")로 표시하면 항상 안 찾아진 것처럼 보여 혼란을 준다.
    if (r.key === 'handover') {
      return `<div class="file-card"><span class="ico">🌐</span><div class="info"><div class="n">${r.label}</div><div class="m">실시간 자동연동</div></div><span class="st ok">정상</span></div>`;
    }
    const m = matched[r.key];
    return `<div class="file-card"><span class="ico">📊</span><div class="info"><div class="n">${r.label}${r.required ? '' : ' <span class="muted">(선택)</span>'}</div><div class="m">${m ? 'Excel · ' + formatFileTime(m.mtimeMs) : '아직 못 찾음'}</div></div><span class="st ${m ? 'ok' : 'miss'}">${m ? '정상' : '미발견'}</span></div>`;
  }).join('');
}

function renderActivity() {
  const body = document.getElementById('activityBody');
  if (!body) return;
  body.innerHTML = activityLog.map(a =>
    `<tr><td>${a.time.toTimeString().slice(0, 5)}</td><td>${a.feature}</td><td>${a.detail}</td><td><span class="status-pill" style="color:${a.ok ? 'var(--green)' : 'var(--red)'}">${a.ok ? '✓ 완료' : '✗ 실패'}</span></td></tr>`
  ).join('') || '<tr><td colspan="4" class="muted">아직 작업 내역이 없습니다.</td></tr>';
  const sidebarUpdated = document.getElementById('sidebarUpdated');
  if (sidebarUpdated && activityLog.length) sidebarUpdated.textContent = `마지막 업데이트 ${activityLog[0].time.toTimeString().slice(0, 5)}`;
}

// 세 도구 모두 top-level let으로 상태를 가지고 있어 iframe.contentWindow로 직접 못 읽는다(let/const는
// window 프로퍼티가 안 됨) — 그래서 각 도구에 __xxxSummary 훅을 한 줄씩 추가해 명시적으로 읽는다.
function readToolSummary(key) {
  if (!loadedTools.has(key)) return null;
  const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
  try {
    const w = iframe.contentWindow;
    return w ? TOOLS[key].readSummary(w) : null;
  } catch (e) { return null; }
}

// content가 있으면 "잇다로 보내기" 버튼을 같이 붙인다 — 자동으로 보내지 않고, 사용자가 누를 때만
// 잇다의 Inbox에 한 줄 들어간다(잇다 Inbox 철학과 동일: 자동 분류 없음, 단순 저장).
function alertRow(label, badgeText, badgeClass, content) {
  const btn = content ? `<button class="btn" style="padding:3px 8px;font-size:11px;margin-left:6px" data-itda-push="${content.replace(/"/g, '&quot;')}">🔗 잇다로 보내기</button>` : '';
  return `<div class="row ${badgeClass}"><span class="lbl"><span class="dot ${badgeClass}"></span>${label}</span><span><span class="badge ${badgeClass}">${badgeText}</span>${btn}</span></div>`;
}

function wireItdaPushButtons() {
  document.querySelectorAll('[data-itda-push]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '보내는 중…';
      const r = await window.rehab.itda.pushInboxItem(btn.dataset.itdaPush);
      if (r.ok) { btn.textContent = '보냄 ✓'; logActivity('잇다 연동', '잇다 Inbox로 보냄'); }
      else { btn.textContent = '실패'; btn.disabled = false; logActivity('잇다 연동', r.message, false); }
    });
  });
}

function renderHome() {
  document.getElementById('homeFileList').innerHTML = fileChecklistHtml();

  const matched = (lastScan && lastScan.matched) || {};
  const required = fileRoles.filter(r => r.required);
  const requiredFound = required.filter(r => matched[r.key]).length;
  const pct = required.length ? Math.round((requiredFound / required.length) * 100) : 0;
  document.getElementById('homeDonut').style.background = lastScan ? `conic-gradient(var(--green) ${pct}%, var(--border) 0)` : '';
  document.getElementById('homeDonutText').textContent = lastScan ? `${pct}%` : '-';
  // 인수인계는 폴더 파일이 아니라 실시간 연동이라 "전체 파일" 분모/분자 어디에도 안 넣는다.
  const localFileRoles = fileRoles.filter(r => r.key !== 'handover');
  document.getElementById('homeChecklist').innerHTML = `
    <div class="row"><span>필수 파일</span><b>${requiredFound}/${required.length}</b></div>
    <div class="row"><span>전체 파일</span><b>${Object.keys(matched).length}/${localFileRoles.length}</b></div>`;

  const summaries = {};
  for (const key of Object.keys(TOOLS)) {
    const s = readToolSummary(key);
    summaries[key] = s;
    const boxesEl = document.getElementById(TOOLS[key].statBoxesElId);
    if (boxesEl) boxesEl.innerHTML = TOOLS[key].statBoxes(s).map(b =>
      `<div class="statbox ${b.cls}"><span class="num">${b.num}</span><span class="lbl">${b.lbl}</span></div>`).join('');
  }
  const alerts = ALERT_ORDER.map(key => TOOLS[key].alertRow(summaries[key])).filter(Boolean);
  document.getElementById('homeAlerts').innerHTML = alerts.join('') || '<div class="muted">화면을 열면 요약이 표시됩니다.</div>';
  wireItdaPushButtons();

  const refreshNote = document.getElementById('homeRefreshNote');
  if (refreshNote) refreshNote.textContent = lastScan ? `마지막 확인: 폴더 ${lastScan.folders.length}개 · ${Object.keys(matched).length}/${localFileRoles.length}개 파일 인식` : '아직 자동 불러오기를 하지 않았습니다.';

  renderSysInfo(matched, localFileRoles);
  renderActivity();
}

let sysInfoRequestId = 0;
async function renderSysInfo(matched, localFileRoles) {
  document.getElementById('sysTotalFiles').textContent = localFileRoles.length;
  document.getElementById('sysOkFiles').textContent = Object.keys(matched).length;
  document.getElementById('sysLastUpdate').textContent = lastScan ? new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  // renderHome()이 폴링·스캔·탭전환마다 자주 겹쳐 불릴 수 있어서, 먼저 시작한 호출의 IPC 응답이
  // 나중에 도착해 최신 상태를 덮어쓰지 않도록 요청번호로 마지막 호출만 반영한다.
  const requestId = ++sysInfoRequestId;
  let folders;
  try { folders = await window.rehab.folders.list(); }
  catch (e) { return; }
  if (requestId !== sysInfoRequestId) return; // 그 사이 더 최신 renderHome()이 또 불렸으면 이 결과는 버린다
  const pathEl = document.getElementById('sysDataFolder');
  if (folders.length) pathEl.textContent = `데이터 폴더: ${folders[0].dirPath}${folders.length > 1 ? ` 외 ${folders.length - 1}개` : ''}`;
  else pathEl.textContent = '데이터 폴더: 등록된 폴더 없음';
  const openBtn = document.getElementById('sysOpenFolderBtn');
  openBtn.disabled = !folders.length;
  openBtn.onclick = () => folders.length && window.rehab.folders.openFolder(folders[0].dirPath);
}

function renderDataView() {
  document.getElementById('dataFileList').innerHTML = fileChecklistHtml();
  document.getElementById('dataStatus').textContent = lastScan
    ? `마지막 확인: 폴더 ${lastScan.folders.length}개 · 미인식 파일 ${lastScan.unmatched.length}건`
    : '아직 불러오지 않았습니다.';
}

// 보고서/출력 화면 — 각 도구가 이미 분석해둔 결과를 요약해 보여주고, 그 도구의 실제 내보내기 버튼을
// (화면으로 이동하지 않고) 여기서 그대로 눌러준다. 새 내보내기 로직을 만들지 않고 기존 버튼을 그대로 재사용.
function renderReportView() {
  for (const key of Object.keys(TOOLS)) {
    const t = TOOLS[key];
    const s = readToolSummary(key);
    const boxesEl = document.getElementById(t.reportBoxesElId);
    if (boxesEl) boxesEl.innerHTML = t.statBoxes(s).map(b =>
      `<div class="statbox ${b.cls}"><span class="num">${b.num}</span><span class="lbl">${b.lbl}</span></div>`).join('');
    const statusEl = document.getElementById(t.reportStatusElId);
    if (statusEl) statusEl.textContent = loadedTools.has(key)
      ? '' : '아직 이 화면을 안 열었습니다 — "화면 열기"에서 먼저 데이터를 불러와 주세요.';
  }
}

// 내보내기 버튼은 정적 요소라 한 번만 연결한다(렌더마다 다시 붙일 필요 없음).
for (const key of Object.keys(TOOLS)) {
  const t = TOOLS[key];
  const btn = document.getElementById(t.reportExportBtnId);
  if (!btn) continue;
  btn.addEventListener('click', () => {
    const statusEl = document.getElementById(t.reportStatusElId);
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
    if (!loadedTools.has(key)) { setStatus('먼저 사이드바에서 화면을 한 번 열어 데이터를 불러와 주세요.'); return; }
    const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
    const toolBtn = iframe?.contentDocument?.getElementById(t.toolExportBtnId);
    if (!toolBtn || toolBtn.disabled) { setStatus(`${t.label} 화면에서 먼저 파일을 업로드/분석해 주세요.`); return; }
    toolBtn.click();
    setStatus(`${t.label} 내보내기를 실행했습니다 — 다운로드를 확인해 주세요.`);
    logActivity(t.label, '보고서 화면에서 내보내기 실행');
  });
}

async function renderSettingsView() {
  const folders = await window.rehab.folders.list();
  document.getElementById('folderList').innerHTML = folders.length
    ? folders.map(f => `<div class="folder-row"><span style="flex:1">📁 ${f.label} <span class="muted">${f.dirPath}</span></span><button class="btn" data-remove="${f.id}">제거</button></div>`).join('')
    : '<p class="muted">등록된 폴더가 없습니다. "폴더 추가"를 눌러 시간표·현황 파일이 있는 폴더를 선택해 주세요.</p>';
  document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    await window.rehab.folders.remove(b.dataset.remove);
    renderSettingsView();
  }));
}

document.getElementById('addFolderBtn').addEventListener('click', async () => {
  const entry = await window.rehab.folders.choose();
  if (entry) { logActivity('설정', `폴더 등록: ${entry.label}`); renderSettingsView(); }
});
document.getElementById('homeScanBtn').addEventListener('click', () => runScan(null));
document.getElementById('dataScanBtn').addEventListener('click', () => runScan(document.getElementById('dataStatus')));
document.getElementById('homeRefreshBtn').addEventListener('click', () => runScan(null));
document.getElementById('topbarSettingsBtn').addEventListener('click', () => showView('settings'));

// ── 업데이트(GitHub Releases) ─────────────────────────────
function updaterStatusText(s) {
  switch (s.status) {
    case 'dev-mode': return s.message;
    case 'checking': return '업데이트 확인 중…';
    case 'available': return `새 버전 ${s.version} 다운로드 중…`;
    case 'not-available': return '최신 버전을 사용 중입니다.';
    case 'downloading': return `다운로드 중… ${s.percent ?? 0}%`;
    case 'downloaded': return `새 버전 ${s.version} 설치 준비 완료 — "지금 재시작하고 설치"를 눌러주세요.`;
    case 'error': return `업데이트 확인 실패: ${s.message}`;
    default: return '';
  }
}
window.rehab.updater.onStatus(s => {
  document.getElementById('updaterStatus').textContent = updaterStatusText(s);
  document.getElementById('updaterInstallBtn').style.display = s.status === 'downloaded' ? 'inline-block' : 'none';
});
document.getElementById('updaterCheckBtn').addEventListener('click', async () => {
  document.getElementById('updaterStatus').textContent = '확인 중…';
  const r = await window.rehab.updater.checkNow();
  if (r.status === 'dev-mode' || r.status === 'error') document.getElementById('updaterStatus').textContent = r.message || updaterStatusText(r);
});
document.getElementById('updaterInstallBtn').addEventListener('click', () => window.rehab.updater.quitAndInstall());

// ── 초기화 ─────────────────────────────────────────────────
(async function init() {
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  fileRoles = await window.rehab.folders.fileRoles();
  document.getElementById('updaterVersion').textContent = await window.rehab.updater.getVersion();
  renderHome();
  runScan(null); // 시작할 때 한 번 자동으로 불러오기 시도(등록된 폴더가 없으면 조용히 넘어감)
})();
