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
    primaryRoles: ['acting'], // 이 화면은 액팅 기록을 직접 올리는 게 핵심이라, 없으면 업로드 영역을 펼쳐 둔다
    page: 'tools/치료_액팅_기록_오류_확인_프로그램_언어분류.html',
    targets: [
      { role: 'acting', selector: '#fileInput' },
      { role: 'dailySchedule', selector: '#msFileInput' }, // 작업치료실 시간표(평일) — 화면에서 다시 올리지 않게 연결
      { role: 'satSchedule', selector: '#msSatFileInput' }, // 토요일·공휴일 시간표 — 같은 날짜 시트 자동 선택
      { role: 'dailyStats', selector: '#dcFileInput' },    // 1·2·3팀 이번 달 일일통계(여러 파일)
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
      { role: 'pta', selector: 'input[data-key="ptaBook"]' }, // PTA 재원현황(선택) — 병실 대조의 기준
    ],
    readSummary: (w) => w.__crossSummary ? { count: w.__crossSummary.issueCount, label: '검증 결과', ...w.__crossSummary } : null,
    // 이 필수 역할이 폴더 스캔으로 전부 채워지면(=화면을 열지 않아도) 자동으로 전체 교차검증을 한 번 실행한다.
    requiredRoles: ['status', 'card10', 'card3', 'mat10', 'table10', 'mt3'],
    optionalRoles: ['pta'],
    // 파일을 막 채운 직후엔 도구가 각 파일을 비동기로 읽는 중이라(칸마다 "읽는 중…" 표시) 다 끝나길 기다렸다가 실행한다.
    // 인수인계 칸은 실시간 조회라 오래 걸릴 수 있고 handleRun이 알아서 기다리므로 기다릴 대상에서 뺀다.
    autoRunFn: async (w) => {
      if (typeof w.handleRun !== 'function') return false;
      const start = Date.now();
      await new Promise(r => setTimeout(r, 200));
      while (Date.now() - start < 20000 && w.document.querySelector('.prep-item:not([data-key="handoverBook"]) .prep-badge.busy')) {
        await new Promise(r => setTimeout(r, 250));
      }
      await w.handleRun();
      return true;
    },
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
let lastScan = null; // {matched, matchedAll, unmatched, errors, folders, manualRoles}
const fileCache = new Map(); // role -> {sig, files:[File]} — 서명이 같으면 다시 읽지 않는다
const loadedTools = new Set();
const activityLog = [];

// ── 데이터 동기화 상태 ──────────────────────────────────────
// reflected: 프로그램이 마지막으로 반영(읽어들인)한 서명과 시각. 디스크의 현재 서명(lastScan)과 다르면 "업데이트 필요".
const reflected = new Map(); // role -> {sig, at}
const updatingRoles = new Set();
const roleErrors = new Map(); // role -> 오류 메시지
let lastSyncAt = 0;
let syncing = false;
// 설정 값은 settings-core.js(저장·검증)로 한 곳에서 관리한다. 바꿀 때는 setSetting()만 쓴다.
const settings = RehabSettings.load(localStorage);
const settingListeners = []; // (key) => void — 설정 화면이 값이 바뀔 때 자기 표시를 고치려고 등록한다
function setSetting(key, value) {
  settings[key] = RehabSettings.normalize({ ...settings, [key]: value })[key];
  RehabSettings.save(localStorage, settings);
  applySetting(key);
}
function replaceSettings(next) {
  Object.assign(settings, RehabSettings.normalize(next));
  RehabSettings.save(localStorage, settings);
  Object.keys(settings).forEach(applySetting);
}
const SYNC_RETRY_MAX = 3; // 읽기에 실패한 파일은 몇 초 뒤 자동으로 다시 시도(클라우드 폴더는 첫 읽기가 일시적으로 실패하기도 함)
let syncRetries = 0;
let syncMode = settings.syncMode;

function roleStateOf(role) {
  return RehabSync.roleState({
    sig: RehabSync.roleSig(lastScan, role),
    reflectedSig: reflected.get(role) && reflected.get(role).sig,
    updating: updatingRoles.has(role),
    error: roleErrors.get(role),
  });
}
const toolRoles = (key) => [...new Set(TOOLS[key].targets.flatMap(t => t.roles || [t.role]))].filter(r => r !== 'handover');
const consumedRoles = () => new Set(Object.keys(TOOLS).flatMap(toolRoles));
const roleDef = (role) => fileRoles.find(r => r.key === role);

// ── 공용 유틸 ──────────────────────────────────────────────
function logActivity(feature, detail, ok = true) {
  activityLog.unshift({ time: new Date(), feature, detail, ok });
  if (activityLog.length > 12) activityLog.length = 12;
  renderActivity();
}

// 역할의 파일들(multi 역할은 여러 개)을 읽어 File로 돌려준다. 서명이 같으면 캐시를 쓰므로 안 바뀐 파일은 다시 읽지 않는다.
async function getFilesForRole(role) {
  const sig = RehabSync.roleSig(lastScan, role);
  if (!sig) return [];
  const cached = fileCache.get(role);
  if (cached && cached.sig === sig) return cached.files;
  const entries = (lastScan.matchedAll && lastScan.matchedAll[role]) || [lastScan.matched[role]];
  const files = [];
  for (const m of entries) {
    const bytes = await window.rehab.folders.readFile(m.path);
    files.push(new File([bytes], m.name, { lastModified: m.mtimeMs })); // 파일 수정 시각을 도구가 "N일 전 파일" 경고에 쓴다
  }
  fileCache.set(role, { sig, files });
  return files;
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

// onlyRoles를 주면 그 역할이 들어가는 칸만 다시 채운다(바뀐 파일만 다시 읽기).
async function autoFillTool(toolKey, onlyRoles = null) {
  const targets = TOOLS[toolKey] && TOOLS[toolKey].targets;
  const iframe = document.querySelector(`iframe[data-tool="${toolKey}"]`);
  if (!targets || !lastScan || !iframe || !iframe.contentDocument) return 0;
  const doc = iframe.contentDocument;
  let filled = 0;
  for (const t of targets) {
    const roles = t.roles || [t.role];
    if (onlyRoles && !roles.some(r => onlyRoles.includes(r))) continue;
    const files = [];
    for (const r of roles) {
      try { files.push(...await getFilesForRole(r)); roleErrors.delete(r); }
      catch (e) { roleErrors.set(r, (e && e.message) || '파일을 읽지 못했습니다.'); }
    }
    if (files.length && fillInput(doc, t.selector, files)) filled++;
  }
  if (filled) maybeAutoRun(toolKey, iframe);
  return filled;
}

// 필수 파일이 전부 인식됐고, 그 파일들의 서명이 지난번 자동 실행 때와 달라졌을 때만(처음이거나 파일이 바뀐 경우)
// 그 도구의 실행 함수를 자동으로 불러준다(사람이 누르는 실행 버튼은 그대로 — 같은 함수를 대신 호출할 뿐).
const autoRanSig = new Map(); // toolKey -> 마지막으로 자동 실행한 필수 파일 서명
async function maybeAutoRun(toolKey, iframe) {
  const t = TOOLS[toolKey];
  if (!t.requiredRoles || !t.autoRunFn) return;
  if (!t.requiredRoles.every(r => RehabSync.roleSig(lastScan, r))) return;
  const sig = RehabSync.rolesSig(lastScan, t.requiredRoles.concat(t.optionalRoles || [])); // 선택 파일이 바뀌어도 다시 실행
  if (autoRanSig.get(toolKey) === sig) return;
  const prev = autoRanSig.get(toolKey);
  autoRanSig.set(toolKey, sig); // 동시에 두 번 불리지 않게 먼저 표시
  try {
    const ran = await t.autoRunFn(iframe.contentWindow);
    if (ran === false) { autoRanSig.set(toolKey, prev); return; } // 화면이 아직 준비 전 — 다음 기회에 다시
    logActivity(t.label, '필수 파일 인식 완료 · 자동 실행');
    renderHome();
  } catch (e) { autoRanSig.set(toolKey, prev); }
}

// ── 동기화: 변경 감지 → 바뀐 파일만 다시 읽기 → 반영 시각 기록 ──────────
async function refreshScan() { lastScan = await window.rehab.folders.scanAll(); }

async function applyRoles(roles) {
  if (!roles.length) return [];
  for (const role of roles) { updatingRoles.add(role); roleErrors.delete(role); fileCache.delete(role); }
  renderAll();
  const consumed = consumedRoles();
  const ok = [];
  for (const role of roles) {
    const sig = RehabSync.roleSig(lastScan, role);
    try {
      // 화면이 쓰는 파일은 미리 읽어둔다 — 읽기 오류를 바로 알 수 있고, 화면을 여는 순간 곧바로 채워진다.
      if (consumed.has(role)) await getFilesForRole(role);
      reflected.set(role, { sig, at: Date.now() });
      ok.push(role);
    } catch (e) {
      const msg = (e && e.message) || '파일을 읽지 못했습니다.';
      roleErrors.set(role, msg);
      logActivity('데이터 동기화', `${roleDef(role).label} 읽기 오류: ${msg}`, false);
    }
    updatingRoles.delete(role);
  }
  for (const key of loadedTools) {
    if (!TOOLS[key]) continue; // 인수인계 화면은 채울 파일이 없다
    const n = await autoFillTool(key, ok);
    if (n) logActivity(TOOLS[key].label, `${n}개 칸 자동 갱신`);
    scheduleRefresh();
  }
  return ok;
}

async function syncNow({ statusEl = null, skipScan = false } = {}) {
  if (syncing) return;
  syncing = true;
  if (statusEl) statusEl.textContent = '등록된 폴더에서 찾는 중…';
  try {
    if (!skipScan) await refreshScan();
    const pending = fileRoles.map(r => r.key).filter(k => k !== 'handover' && ['stale', 'error'].includes(roleStateOf(k)));
    const ok = await applyRoles(pending);
    lastSyncAt = Date.now();
    const foundCount = Object.keys(lastScan.matched).length;
    if (statusEl) {
      const failed = pending.length - ok.length;
      statusEl.textContent = !lastScan.folders.length && !(lastScan.manualRoles || []).length
        ? '등록된 폴더가 없습니다. "설정"에서 먼저 추가해 주세요.'
        : `폴더 ${lastScan.folders.length}개 확인 · ${foundCount}/${fileRoles.length}개 파일 인식 · ` +
          (ok.length ? `${ok.length}개 파일 업데이트` : '변경 없음(모두 최신)') + (failed ? ` · 읽기 오류 ${failed}개` : '');
    }
    logActivity('데이터 동기화', ok.length ? `${ok.length}개 파일 반영: ${ok.map(k => roleDef(k).label).join(', ')}` : '변경 없음 · 모두 최신');
    if (ok.length < pending.length && syncRetries < SYNC_RETRY_MAX) { syncRetries++; setTimeout(() => syncNow({ skipScan: false }), 5000 * syncRetries); }
    else if (ok.length === pending.length) syncRetries = 0;
  } catch (e) {
    if (statusEl) statusEl.textContent = '자동 불러오기 실패: ' + e.message;
  } finally {
    syncing = false;
    renderAll();
  }
}

// 30초마다 파일 목록·수정시각만 확인해서 바뀐 게 있으면 "업데이트 필요"로 표시하고, 선택한 주기가 됐으면 실제로 반영한다.
async function syncTick() {
  if (syncing || !lastScan) return;
  try { await refreshScan(); } catch (e) { return; }
  const pending = fileRoles.some(r => r.key !== 'handover' && ['stale', 'error'].includes(roleStateOf(r.key)));
  if (pending && RehabSync.isSyncDue({ mode: syncMode, now: Date.now(), lastSyncAt })) await syncNow({ skipScan: true });
  else { renderAll(); notifyStale(); }
}
let syncTickTimer = null;
function scheduleSyncTick() { // 설정 > 변경 감지 간격(기본 30초)
  clearTimeout(syncTickTimer);
  syncTickTimer = setTimeout(async () => { try { await syncTick(); } finally { scheduleSyncTick(); } }, settings.checkSec * 1000);
}
scheduleSyncTick();

// 파일이 바뀌었는데 아직 반영 전이면 화면 위에 작은 알림을 한 번 띄운다(같은 변경으로는 다시 안 띄움)
const toastEl = document.getElementById('toast');
let toastTimer = null, notifiedStaleSig = '';
function showToast(html, ms = 9000) { toastEl.innerHTML = html; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }
function notifyStale() {
  if (!settings.notifyStale || !lastScan) return;
  const stale = fileRoles.filter(r => r.key !== 'handover' && roleStateOf(r.key) === 'stale');
  const sig = stale.map(r => r.key + ':' + RehabSync.roleSig(lastScan, r.key)).join('|');
  if (!stale.length) { notifiedStaleSig = ''; return; }
  if (sig === notifiedStaleSig) return;
  notifiedStaleSig = sig;
  showToast(`📄 파일이 바뀌었어요 · 업데이트 필요 ${stale.length}개 <button class="btn primary" data-sync-now>지금 업데이트</button>`);
}

// 도구 분석은 비동기로 끝나므로, 갱신 직후 몇 번에 나눠 홈/상태 표시를 다시 그린다.
function scheduleRefresh() { [1000, 3000, 7000].forEach(ms => setTimeout(renderAll, ms)); }

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
// 파일 자동 채움·홈 요약·보고서가 필요 없는 화면(인수인계 화면)은 TOOLS 대신 여기에 둔다.
const VIEWER_PAGES = { handover: 'tools/인수인계.html' };
function ensureToolLoaded(key) {
  if (VIEWER_PAGES[key]) {
    if (!loadedTools.has(key)) { loadedTools.add(key); document.querySelector(`iframe[data-tool="${key}"]`).src = VIEWER_PAGES[key]; }
    return;
  }
  if (!TOOLS[key]) return;
  const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
  if (!loadedTools.has(key)) {
    loadedTools.add(key);
    iframe.addEventListener('load', async () => {
      iframe.contentWindow.__schedulesApi = SCHEDULES_BRIDGE;
      applyFilesCollapse(key);
      iframe.contentWindow.__itdaApi = { grandEvents: () => window.rehab.itda.grandEvents(settings.itdaCategory) }; // 그랜드라운딩 일정 불러오기(읽기 전용)
      pushSettingsToTool(iframe);
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

const LASTVIEW_KEY = 'rehab_last_view_v1';
function showView(key) {
  try { localStorage.setItem(LASTVIEW_KEY, key); } catch (e) { /* 기억 못 해도 동작에는 문제 없음 */ }
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === key));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  ensureToolLoaded(key);
  if (key === 'home') { renderHome(); loadHomeGrandEvent(); }
  if (key === 'data') renderDataView();
  if (key === 'settings') renderSettingsView();
  if (key === 'report') renderReportView();
  if (key === 'backup') refreshBackup();
}

document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => showView(n.dataset.nav)));

// 사이드바 접기/펼치기(접으면 아이콘만 남음, 상태는 이 PC에 기억)
const SIDEBAR_KEY = 'rehab_sidebar_collapsed_v1';
const sidebarEl = document.getElementById('sidebar'), sidebarBtn = document.getElementById('sidebarToggle');
const setSidebar = (collapsed) => { sidebarEl.classList.toggle('collapsed', collapsed); sidebarBtn.textContent = collapsed ? '»' : '«'; };
const sidebarStart = () => { // 설정 > 사이드바: 펼침/접힘으로 고정하거나 마지막에 접고 펼친 상태를 기억
  if (settings.sidebar !== 'last') return settings.sidebar === 'closed';
  try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (e) { return false; }
};
setSidebar(sidebarStart());
sidebarBtn.addEventListener('click', () => {
  const c = !sidebarEl.classList.contains('collapsed'); setSidebar(c);
  if (settings.sidebar === 'last') try { localStorage.setItem(SIDEBAR_KEY, c ? '1' : '0'); } catch (e) { /* 저장 실패해도 이번 실행엔 적용됨 */ }
});
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => showView(el.dataset.goto)));

// ── 렌더링 ─────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
// 오늘이면 시:분(필요 시 초), 아니면 월.일 시:분
function fmtTime(ms, withSeconds = false) {
  const d = new Date(ms);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${withSeconds ? ':' + pad2(d.getSeconds()) : ''}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${hm}`;
}
const STATE_CLASS = { latest: 'ok', stale: 'stale', updating: 'busy', missing: 'miss', error: 'err' };

// 역할 하나의 표시용 정보: 찾은 파일들, 가장 최근 파일 수정 시각, 프로그램 반영 시각, 상태
function roleInfo(role) {
  const entries = (lastScan && ((lastScan.matchedAll && lastScan.matchedAll[role]) || (lastScan.matched[role] ? [lastScan.matched[role]] : []))) || [];
  return {
    entries,
    modified: entries.length ? Math.max(...entries.map(e => e.mtimeMs)) : 0,
    reflectedAt: (reflected.get(role) || {}).at || 0,
    state: lastScan ? roleStateOf(role) : 'missing',
    error: roleErrors.get(role) || '',
  };
}

function renderActivity() {
  const body = document.getElementById('activityBody');
  if (!body) return;
  body.innerHTML = activityLog.map(a =>
    `<tr><td>${a.time.toTimeString().slice(0, 5)}</td><td>${a.feature}</td><td>${a.detail}</td><td><span class="status-pill" style="color:${a.ok ? 'var(--green)' : 'var(--red)'}">${a.ok ? '✓ 완료' : '✗ 실패'}</span></td></tr>`
  ).join('') || '<tr><td colspan="4" class="muted">아직 작업 내역이 없습니다.</td></tr>';
  const sidebarUpdated = document.getElementById('sidebarUpdated');
  if (sidebarUpdated && (lastSyncAt || activityLog.length)) sidebarUpdated.textContent = `마지막 업데이트 ${lastSyncAt ? fmtTime(lastSyncAt) : activityLog[0].time.toTimeString().slice(0, 5)}`;
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
  const btn = content && settings.itdaPush ? `<button class="btn" style="padding:3px 8px;font-size:11px;margin-left:6px" data-itda-push="${content.replace(/"/g, '&quot;')}">🔗 잇다로 보내기</button>` : '';
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

// ── 홈 ─────────────────────────────────────────────────────
let homeGrandEvent = null, homeGrandEvents = [], homeGrandAt = 0, homeMissOptOpen = false;
document.addEventListener('toggle', (e) => { if (e.target.id === 'homeMissOpt') homeMissOptOpen = e.target.open; }, true);
async function loadHomeGrandEvent() { // 잇다의 다가오는 그랜드라운딩 일정 한 건(읽기 전용). 잇다가 없으면 조용히 넘어간다.
  if (!settings.itda) { homeGrandEvent = null; homeGrandEvents = []; return; }
  if (Date.now() - homeGrandAt < 60 * 1000) return;
  homeGrandAt = Date.now();
  try { const r = await window.rehab.itda.grandEvents(settings.itdaCategory); homeGrandEvents = r && r.ok ? r.events.slice(0, 3) : []; homeGrandEvent = homeGrandEvents[0] || null; } catch (e) { homeGrandEvent = null; homeGrandEvents = []; }
  renderHome();
}
async function applyHomeGrandEvent(i = 0) {
  const ev = homeGrandEvents[i] || homeGrandEvent; if (!ev) return;
  showView('rm');
  const win = () => document.querySelector('iframe[data-tool="rm"]').contentWindow;
  for (let i = 0; i < 80; i++) { try { if (win().grandItdaApply && win().document.getElementById('grandItdaMsg')) break; } catch (e) { /* 아직 로드 중 */ } await new Promise(r => setTimeout(r, 250)); }
  try { win().grandItdaApply(ev, null); } catch (e) { /* 화면이 준비되지 않았으면 직접 선택 */ }
}
const chipHtml = (cls, text, small = '') => `<span class="chip ${cls}"><i></i>${text}${small ? `<small>${small}</small>` : ''}</span>`;
const todoHtml = (cls, icon, title, detail, buttons) => `<div class="todo ${cls}"><span class="ic">${icon}</span><div class="tx"><b>${title}</b><div class="muted">${detail}</div></div><span class="bt">${buttons}</span></div>`;
const fmtDay = (iso) => { const d = new Date(iso + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); const wd = d.toLocaleDateString('ko-KR', { weekday: 'short' }); return d.getTime() === t.getTime() ? `오늘(${wd})` : `${d.getMonth() + 1}/${d.getDate()}(${wd})`; };
const CROSS_CAT_LABEL = { count: '개수', location: '위치', therapist: '치료사', handover: '인수인계', eval: '평가메인', room: 'PTA 대조' };

function handoverCacheStats() {
  try {
    const o = JSON.parse(localStorage.getItem('rehab_handover_cache_v1')); if (!o || !Array.isArray(o.records)) return null;
    const week = Date.now() - 7 * 24 * 3600 * 1000;
    return { total: o.records.length, recent: o.records.filter(r => r.modified && new Date(r.modified).getTime() >= week).length };
  } catch (e) { return null; }
}

function renderHome() {
  const matched = (lastScan && lastScan.matched) || {};
  const localRoles = fileRoles.filter(r => r.key !== 'handover'); // 인수인계는 실시간 연동이라 파일 수에 넣지 않는다
  const reqRoles = localRoles.filter(r => r.required), optRoles = localRoles.filter(r => !r.required);
  const reqFound = reqRoles.filter(r => matched[r.key]).length, optFound = optRoles.filter(r => matched[r.key]).length;
  const stateOf = (r) => roleStateOf(r.key);
  const staleRoles = lastScan ? localRoles.filter(r => stateOf(r) === 'stale') : [], errRoles = lastScan ? localRoles.filter(r => stateOf(r) === 'error') : [];
  const missReq = lastScan ? reqRoles.filter(r => !matched[r.key]) : [], missOpt = lastScan ? optRoles.filter(r => !matched[r.key]) : [];

  const summaries = {};
  for (const key of Object.keys(TOOLS)) {
    summaries[key] = readToolSummary(key);
    const boxesEl = document.getElementById(TOOLS[key].statBoxesElId);
    if (boxesEl) boxesEl.innerHTML = TOOLS[key].statBoxes(summaries[key]).map(b => `<div class="statbox ${b.cls}"><span class="num">${b.num}</span><span class="lbl">${b.lbl}</span></div>`).join('');
  }
  const cross = summaries.cross, acting = summaries.acting, bk = backupStatus;
  const ho = handoverCacheStats();

  // 1) 맨 위 한 줄 요약
  const o = syncOverview(scanRoles());
  const bkChip = !bk || bk.level === 'off' ? '' : bk.level === 'ok' ? chipHtml('ok', '백업 정상') : chipHtml('warn', bk.level === 'unknown' ? '백업 기록 없음' : '백업 확인 필요');
  document.getElementById('homeBand').innerHTML = `<b class="band-title ${o.cls}">${o.cls === 'ok' ? '● 오늘 상태 정상' : o.text}</b>`
    + (settings.homeLayout === 'classic' ? '' : '<span data-files-pop class="band-click" title="파일 상태 보기·바꾸기">')
    + chipHtml(!lastScan ? 'off' : missReq.length ? 'err' : 'ok', `필수 파일 ${reqFound}/${reqRoles.length}`, lastScan && !missReq.length ? '최신' : '')
    + chipHtml(optFound ? 'ok' : 'off', `선택 파일 ${optFound}/${optRoles.length}`)
    + (settings.homeLayout === 'classic' ? '' : '</span>')
    + (cross ? (cross.count ? chipHtml('warn', `교차검증 불일치 ${cross.count}건`, (() => { const d = crossTrend().delta; return d ? (d > 0 ? `▲${d}` : `▼${-d}`) : ''; })()) : chipHtml('ok', '교차검증 이상 없음')) : chipHtml('off', '교차검증 확인 전'))
    + (acting && acting.count ? chipHtml('err', `치료기록 오류 ${acting.count}건`) : acting ? chipHtml('ok', '치료기록 오류 없음') : chipHtml('off', '치료기록 QA 파일 없음'))
    + bkChip
    + `<span class="when">${lastSyncAt ? '마지막 동기화 ' + fmtDateTime(lastSyncAt) : '아직 동기화 전'}</span>${settings.homeLayout === 'classic' ? '' : '<button class="btn" data-today-summary title="카톡에 붙여넣을 오늘 현황 글을 복사해요">📋 오늘 요약</button>'}<button class="btn primary" id="homeScanBtn" data-sync-now>🔄 지금 업데이트</button>`;

  // 2) 오늘 할 일(확인이 필요한 것만)
  const itda = (content) => !settings.itdaPush ? '' : `<button class="btn" data-itda-push="${content.replace(/"/g, '&quot;')}">🔗 잇다로 보내기</button>`;
  const todos = [];
  if (missReq.length) todos.push(todoHtml('err', '📦', `필수 파일 ${missReq.length}개를 못 찾았어요`, missReq.map(r => r.label).join(' · '), missReq.map(r => `<button class="btn primary" data-manual-pick="${r.key}" title="${updEsc(r.label)} — 파일을 직접 골라서 불러오기">📂 ${CHIP_NAME[r.key] || r.label}</button>`).join('') + '<button class="btn" data-goto="data">데이터 준비 →</button>'));
  if (errRoles.length) todos.push(todoHtml('err', '⚠️', `읽기 오류 ${errRoles.length}개`, errRoles.map(r => r.label).join(' · '), '<button class="btn" data-goto="data">데이터 준비 →</button>'));
  if (staleRoles.length) todos.push(todoHtml('warn', '🔄', `업데이트 필요 ${staleRoles.length}개`, staleRoles.map(r => r.label).join(' · ') + ' — 파일이 바뀌었어요', '<button class="btn primary" data-sync-now>지금 업데이트</button>'));
  if (cross && cross.count) {
    const cats = cross.cats ? Object.keys(CROSS_CAT_LABEL).filter(k => cross.cats[k]).map(k => `${CROSS_CAT_LABEL[k]} ${cross.cats[k]}`).join(' · ') : '';
    todos.push(todoHtml('warn', '🔍', `교차검증 불일치 ${cross.count}건`, cats || '자세한 내용은 교차검증 화면에서 확인하세요', `<button class="btn" data-open-fixplan>🛠 수정 지시서</button><button class="btn purple" data-goto="cross">열기 →</button>` + itda(`[교차검증] 불일치 ${cross.count}건 발견 — 재활치료부 앱에서 확인`)));
  }
  if (acting && acting.count) todos.push(todoHtml('err', '📋', `치료기록 오류 ${acting.count}건`, '치료기록 QA 화면에서 오류 목록을 확인하세요', '<button class="btn green" data-goto="acting">열기 →</button>' + itda(`[치료기록 QA] 치료기록 오류 ${acting.count}건 발견 — 재활치료부 앱에서 확인`)));
  else if (!acting) todos.push(todoHtml('off', '📋', '치료기록 QA — 액팅 기록 파일을 올려 주세요', '담당자별 기록통계.xlsx를 올리면 오류를 바로 검사합니다.', '<button class="btn green" data-goto="acting">파일 올리기 →</button>'));
  if (bk && bk.level !== 'ok' && bk.level !== 'off') todos.push(todoHtml('warn', '💾', bk.level === 'unknown' ? '백업 기록 없음' : '백업 확인 필요', bk.detail || bk.title || '', '<button class="btn" data-goto="backup">백업 상태 보기 →</button>' + itda(`[백업] ${bk.title}`)));
  if (homeGrandEvent && settings.homeLayout !== 'workbench') todos.push(todoHtml('teal', '📅', `다가오는 그랜드라운딩 · ${fmtDay(homeGrandEvent.date)} ${homeGrandEvent.rm || homeGrandEvent.title}${homeGrandEvent.wards ? ' ' + homeGrandEvent.wards.replace(',', '·') + '병동' : ''}`, '잇다 일정에서 가져왔어요. 누르면 회차·RM·요일이 맞춰진 채로 열립니다.', '<button class="btn primary" data-grand-apply>설정 적용하고 열기 →</button>'));
  document.getElementById('homeTodo').innerHTML = todos.join('') || '<div class="muted" style="padding:10px 2px">오늘 확인할 항목이 없어요 ✅</div>';
  if (settings.homeLayout === 'workbench') document.querySelectorAll('#homeTodo .todo').forEach((t, i) => t.insertAdjacentHTML('afterbegin', `<span class="k" title="숫자 ${i + 1} 키로 바로 실행">${i + 1}</span>`));
  wireItdaPushButtons();

  // 3) 파일 현황(문제 있는 것만)
  const total = localRoles.length, found = Object.keys(matched).filter(k => localRoles.some(r => r.key === k)).length;
  document.getElementById('homeDonut').style.background = lastScan ? `conic-gradient(var(--green) ${total ? Math.round(found / total * 100) : 0}%, var(--border) 0)` : '';
  document.getElementById('homeDonutText').textContent = lastScan ? `${found}/${total}` : '-';
  document.getElementById('homeChecklist').innerHTML = `
    <div class="row"><span>필수 파일</span><b class="${missReq.length ? 'bad' : 'good'}">${reqFound}/${reqRoles.length}${missReq.length ? '' : ' ✔'}</b></div>
    <div class="row"><span>선택 파일</span><b>${optFound}/${optRoles.length}</b></div>
    <div class="row"><span>실시간 인수인계</span><b class="good">연동 ✔</b></div>`;
  document.getElementById('homeFileChips').innerHTML = lastScan ? chipHtml(staleRoles.length ? 'warn' : 'off', `업데이트 필요 ${staleRoles.length}`) + chipHtml(errRoles.length ? 'err' : 'off', `읽기 오류 ${errRoles.length}`) : '';
  // 펼친 목록에서 바로 파일을 직접 고를 수 있다(화면이 다시 그려져도 펼친 상태는 유지)
  document.getElementById('homeFileProblems').innerHTML = (missOpt.length
    ? `<details class="miss-opt" id="homeMissOpt"${homeMissOptOpen ? ' open' : ''}><summary>파일 없음(선택) ${missOpt.length}개 <small>펼치기</small></summary><div class="mo-list">${missOpt.map(r => `<div class="mo-row"><span>· ${r.label}</span><button class="btn" data-manual-pick="${r.key}" title="이 파일을 직접 골라서 불러오기">📂 파일 고르기</button></div>`).join('')}</div></details>` : '');

  // 4) 화면별 카드 배지·인수인계 카드
  const badge = (id, cls, text) => { const el = document.getElementById(id); if (el) el.innerHTML = chipHtml(cls, text); };
  const rmS = summaries.rm;
  badge('rmBadge', rmS ? 'ok' : 'off', rmS ? '준비됨' : '확인 전');
  badge('actingBadge', acting ? (acting.count ? 'err' : 'ok') : 'off', acting ? (acting.count ? '확인 필요' : '정상') : '파일 없음');
  badge('crossBadge', cross ? (cross.count ? 'warn' : 'ok') : 'off', cross ? (cross.count ? '확인 필요' : '정상') : '확인 전');
  badge('hoBadge', ho ? 'ok' : 'off', ho ? '실시간' : '조회 전');
  document.getElementById('hoStatBoxes').innerHTML = ho
    ? `<div class="statbox neutral"><span class="num">${ho.total}</span><span class="lbl">환자</span></div><div class="statbox teal"><span class="num">${ho.recent}</span><span class="lbl">최근 7일 수정</span></div>`
    : '<div class="statbox neutral"><span class="num">-</span><span class="lbl">환자</span></div>';

  renderSysInfo(matched, localRoles);
  renderActivity();
  renderSyncPill();
  renderToolStrips();
  if (settings.homeLayout === 'workbench') renderWorkbench(summaries, { o, missReq });
}

// ── 홈 작업대 ──────────────────────────────────────────────
// 교차검증 7일 추세·어제 대비: 교차검증이 매일 마지막 결과를 저장해 둔 값을 읽기만 한다(없으면 표시 없음)
function crossTrend() {
  try {
    const snaps = (JSON.parse(localStorage.getItem('rehab_cross_history_v1')) || {}).snaps || [];
    const totals = snaps.map(s => Object.values(s.counts || {}).reduce((a, b) => a + b, 0));
    const n = totals.length;
    return { series: totals.slice(-7), delta: n >= 2 ? totals[n - 1] - totals[n - 2] : 0, hasPrev: n >= 2 };
  } catch (e) { return { series: [], delta: 0, hasPrev: false }; }
}
const sparkSvg = (pts, color) => {
  if (pts.length < 2) return '';
  const w = 62, h = 20, max = Math.max(...pts), min = Math.min(...pts), rng = max - min || 1;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map((v, i) => `${Math.round(i * w / (pts.length - 1))},${Math.round(h - 2 - (v - min) / rng * (h - 4))}`).join(' ')}"/></svg>`;
};
const handoverModifiedToday = () => {
  try { const o = JSON.parse(localStorage.getItem('rehab_handover_cache_v1')), t = new Date().toDateString(); return o.records.filter(r => r.modified && new Date(r.modified).toDateString() === t).length; } catch (e) { return null; }
};
function renderWorkbench(sm, ctx) {
  const cross = sm.cross, acting = sm.acting, rm = sm.rm, bk = backupStatus, ho = handoverCacheStats(), tr = crossTrend();
  // 담당자별 확인 필요(수정 지시서 기준 건수, 이름을 누르면 그 담당자의 지시서)
  const who = (cross && cross.byWho) || [], mx = who.length ? who[0].count : 1;
  document.getElementById('wbWho').innerHTML = who.length
    ? who.slice(0, 5).map(w => `<div class="wb-who" data-who-plan="${updEsc(w.name)}" title="${updEsc(w.name)} 수정 지시서 열기"><b>${updEsc(w.name)}</b><div class="b"><i style="width:${Math.max(8, Math.round(w.count / mx * 100))}%"></i></div><span>${w.count}</span></div>`).join('') + '<div class="muted" style="font-size:11px;margin-top:4px">이름을 누르면 그 담당자의 수정 지시서가 열려요</div>'
    : `<div class="muted" style="padding:6px 2px;font-size:12px">${cross ? '지금은 확인할 담당자가 없어요 ✅' : '교차검증을 실행하면 담당자별로 보여드려요'}</div>`;
  // 다가오는 일정(최대 3건) + 오늘의 흐름
  document.getElementById('wbEvents').innerHTML = homeGrandEvents.length
    ? homeGrandEvents.map((ev, i) => `<div class="wb-ev"><b>${fmtDay(ev.date)} ${updEsc(ev.rm || ev.title)}${ev.wards ? ' · ' + updEsc(ev.wards.replace(',', '·')) + '병동' : ''}</b><small>${updEsc(settings.grandTime)}시</small><button class="btn${i ? '' : ' primary'}" data-grand-apply="${i}" title="회차·RM·요일을 맞춰서 그랜드라운딩 열기">${i ? '적용' : '적용·열기'}</button></div>`).join('')
    : `<div class="muted" style="padding:6px 2px;font-size:12px">${settings.itda ? '오늘 이후 그랜드라운딩 일정이 없어요' : '잇다 연동이 꺼져 있어요(설정 › 잇다 연동)'}</div>`;
  const steps = [
    ['파일 최신', ctx.o.cls === 'ok' && !ctx.missReq.length ? 'ok' : ctx.o.cls === 'busy' ? 'now' : 'bad', ctx.o.cls === 'ok' ? '모든 파일이 최신이에요' : ctx.o.text],
    ['교차검증 실행', cross ? 'ok' : 'now', cross ? `실행됨 · 불일치 ${cross.count}건` : '아직 실행 전이에요'],
    ['치료기록 QA', acting ? 'ok' : 'bad', acting ? `분석됨 · 오류 ${acting.count}건` : '액팅 기록 파일이 없어요'],
    ['그랜드라운딩 준비', rm ? 'ok' : 'now', rm ? `환자 ${rm.count}명 준비됨` : '시간표를 불러오는 중이에요'],
    ['백업 확인', !bk || bk.level === 'off' ? 'off' : bk.level === 'ok' ? 'ok' : 'now', bk ? (bk.title || '') : '확인 중'],
  ];
  const okN = steps.filter(s => s[1] === 'ok').length;
  document.getElementById('wbFlow').innerHTML = '오늘 ' + steps.map((s, i) => `${i ? '<i class="ln"></i>' : ''}<span class="dot ${s[1] === 'ok' ? '' : s[1]}" title="${updEsc(s[0] + ' — ' + s[2])}">${s[1] === 'ok' ? '✓' : s[1] === 'bad' ? '!' : s[1] === 'off' ? '–' : i + 1}</span>`).join('') + `<span style="margin-left:6px">${okN}/${steps.length}</span>`;
  // 도구 타일: 핵심 숫자 · 추세/증감 · 바로 하는 일
  const dl = tr.hasPrev && tr.delta ? `<span class="${tr.delta > 0 ? 'up' : 'dn'}">${tr.delta > 0 ? '▲' : '▼'}${Math.abs(tr.delta)}</span>` : '';
  const hoT = handoverModifiedToday();
  const tile = (goto, ic, name, num, numCls, sub, act) => `<div class="wb-tile" data-goto-tile="${goto}"><div class="a"><span>${ic}</span><b>${name}</b><span class="n ${numCls}">${num}</span></div><div class="s">${sub}${act}</div></div>`;
  document.getElementById('wbTiles').innerHTML =
    tile('cross', '🔍', '교차검증', cross ? cross.count : '–', cross ? (cross.count ? 'r' : '') : 'off', cross ? `${sparkSvg(tr.series, '#d4606c')}${dl}` : '<span>확인 전</span>', '<a class="act" data-open-fixplan>수정 지시서 →</a>')
    + tile('acting', '📋', '치료기록 QA', acting ? acting.count : '–', acting ? (acting.count ? 'r' : '') : 'off', acting ? `<span>오류 ${acting.count} · 주의 ${acting.warnCount || 0}</span>` : '<span>파일 없음</span>', `<a class="act">${acting ? '오류 확인 →' : '파일 올리기 →'}</a>`)
    + tile('rm', '👤', '그랜드라운딩', rm ? rm.count : '–', rm ? '' : 'off', rm ? `<span>10F ${rm.floor10Count}명 · 준비됨</span>` : '<span>확인 전</span>', '<a class="act">열기 →</a>')
    + tile('handover', '📝', '인수인계', ho ? ho.total : '–', ho ? '' : 'off', ho ? `<span class="${hoT ? 'dn' : ''}">${hoT != null ? `오늘 수정 ${hoT}` : '실시간'}</span>` : '<span>조회 전</span>', '<a class="act" data-new-patient>새 환자 →</a>');
}
// 오늘 요약(카톡에 붙여넣을 글)
function todaySummaryText() {
  const d = new Date(), wd = '일월화수목금토'[d.getDay()], lines = [`[${d.getMonth() + 1}/${d.getDate()}(${wd}) 재활치료부 현황]`];
  const cross = readToolSummary('cross'), acting = readToolSummary('acting'), tr = crossTrend();
  if (cross) {
    const cats = cross.cats ? Object.keys(CROSS_CAT_LABEL).filter(k => cross.cats[k]).map(k => `${CROSS_CAT_LABEL[k]} ${cross.cats[k]}`).join(' · ') : '';
    lines.push(`· 교차검증 불일치 ${cross.count}건${tr.hasPrev && tr.delta ? ` (어제 ${tr.delta > 0 ? '+' : ''}${tr.delta})` : ''}${cats ? ' — ' + cats : ''}`);
  } else lines.push('· 교차검증: 아직 실행 전');
  lines.push(acting ? `· 치료기록 QA: 오류 ${acting.count}건` : '· 치료기록 QA: 파일 대기 중');
  const ev = homeGrandEvents[0]; if (ev) lines.push(`· 다음 그랜드라운딩: ${fmtDay(ev.date)} ${ev.rm || ev.title}${ev.wards ? ' ' + ev.wards.replace(',', '·') + '병동' : ''} ${settings.grandTime}시`);
  const who = (cross && cross.byWho) || []; if (who.length) lines.push(`· 확인 필요 담당: ${who.slice(0, 3).map(w => `${w.name} ${w.count}`).join(' · ')}`);
  if (backupStatus && !['ok', 'off'].includes(backupStatus.level)) lines.push('· 백업: 확인 필요');
  return lines.join('\n');
}
async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* 아래 방식으로 */ }
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 실패 */ } ta.remove(); return ok;
}
// "필수 파일" 칩 → 파일 상태 작은 창(큰 파일 현황 카드를 대신): 파일별 최신/오래됨/미선택, 직접 고르기·하나만 다시 읽기
function openFilesPop(anchor) {
  closeChipMenu();
  const roles = fileRoles.filter(r => r.key !== 'handover'), rows = roles.map(r => {
    const i = roleInfo(r.key), st = i.state, cls = st === 'latest' ? 'ok' : st === 'stale' ? 'stale' : st === 'error' ? 'err' : st === 'updating' ? 'stale' : 'off';
    const label = st === 'missing' ? (r.required ? '없음' : '선택 안 함') : RehabSync.STATE_LABEL[st].replace(/^[^\s]+\s/, '');
    const manual = (lastScan && lastScan.manualRoles || []).includes(r.key);
    return { r, i, cls: st === 'missing' && r.required ? 'err' : cls, label, manual };
  }).sort((a, b) => ({ err: 0, stale: 1, ok: 2, off: 3 }[a.cls] - { err: 0, stale: 1, ok: 2, off: 3 }[b.cls]));
  const m = document.createElement('div'); m.className = 'chip-menu wide';
  m.innerHTML = rows.map(x => `<div class="fp-row"><b title="${updEsc(x.r.label)}">${updEsc(CHIP_NAME[x.r.key] || x.r.label)}</b><span class="w">${x.i.entries.length ? fmtTime(x.i.modified) + (x.manual ? ' · 직접' : '') : '-'}</span><span class="fp-st ${x.cls}">${x.label}</span>`
    + (x.i.entries.length ? `<button class="btn" data-chip-resync="${x.r.key}" title="이 파일만 다시 읽기">↻</button>` : '') + `<button class="btn" data-manual-pick="${x.r.key}" title="파일 직접 고르기">📂</button></div>`).join('')
    + '<div class="muted" style="font-size:11px;margin-top:6px;padding:0 4px">전체 동기화는 🔄 · 자세한 내용은 데이터 준비 화면에서 볼 수 있어요</div>';
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  chipMenu = m; chipMenu.dataset.for = 'files-pop';
}

let sysInfoRequestId = 0;
async function renderSysInfo(matched, localFileRoles) {
  document.getElementById('sysTotalFiles').textContent = localFileRoles.length;
  document.getElementById('sysOkFiles').textContent = Object.keys(matched).length;
  document.getElementById('sysLastUpdate').textContent = lastSyncAt ? fmtTime(lastSyncAt, true) : '-';
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

// 데이터 준비 화면: 목록형(필수/선택/실시간 묶음) 또는 보드형(최신 / 확인 필요 / 선택 안 함 열)으로 보여준다.
// 기본 보기는 이 PC에 저장(설정 > 화면 기본값, 또는 위의 "기본으로" 버튼)하고, 화면 위 버튼으로 언제든 바꿔 볼 수 있다.
let dataViewDefault = settings.dataView, dataViewMode = dataViewDefault;
const setDataViewDefault = (mode) => setSetting('dataView', mode);
function renderDataView() {
  const box = document.getElementById('dataFileList');
  const banner = document.getElementById('dataBanner');
  if (!box) return;
  const matched = (lastScan && lastScan.matched) || {};
  const detail = (r) => {
    const i = roleInfo(r.key), st = i.state;
    const cls = st === 'latest' ? 'ok' : st === 'stale' ? 'warn' : st === 'updating' ? 'busy' : st === 'error' ? 'err' : r.required ? 'err' : 'off';
    const manual = (lastScan && lastScan.manualRoles || []).includes(r.key);
    const names = i.entries.length ? i.entries.map(e => e.name).join(', ') : '못 찾음';
    const when = i.entries.length ? `${st === 'stale' ? '<b class="amber">' : ''}파일 ${fmtTime(i.modified)}${st === 'stale' ? '</b>' : ''} → ${i.reflectedAt ? '반영 ' + fmtTime(i.reflectedAt) : '<span class="muted">반영 전</span>'}` : '<span class="muted">-</span>';
    const label = st === 'missing' ? (r.required ? '없음' : '선택 안 함') : RehabSync.STATE_LABEL[st].replace(/^[^\s]+\s/, '');
    const btns = `<button class="btn" data-manual-pick="${r.key}" title="직접 선택">📂</button>${manual ? `<button class="btn" data-manual-clear="${r.key}" title="직접 선택 해제">✕</button>` : ''}`;
    return { r, i, st, cls, manual, names, when, label, btns };
  };
  const fileRow = (r) => {
    const d = detail(r);
    return `<div class="frow ${d.cls}"><b>${r.label}${d.manual ? ' <span class="muted man">직접 선택</span>' : ''}</b><span class="muted fn" title="${updEsc(d.names)}">${updEsc(d.names)}${d.i.error ? `<span class="errtxt"> · ${updEsc(d.i.error)}</span>` : ''}</span><span class="wh">${d.when}</span>`
      + `<span class="chip ${d.cls}"><i></i>${d.label}</span><span class="ac">${d.btns}</span></div>`;
  };
  const boardCard = (r) => {
    const d = detail(r);
    return `<div class="bcard ${d.cls}"><div class="bt"><b>${r.label}</b>${r.required ? '<span class="req">필수</span>' : ''}${d.manual ? '<span class="muted man">직접</span>' : ''}<span class="rt"><span class="chip ${d.cls}"><i></i>${d.label}</span><span class="ac">${d.btns}</span></span></div>`
      + `<div class="bf2"><span class="muted fn" title="${updEsc(d.names)}">${updEsc(d.names)}${d.i.error ? `<span class="errtxt"> · ${updEsc(d.i.error)}</span>` : ''}</span><span class="bw">${d.when}</span></div></div>`;
  };
  const roles = fileRoles.filter(r => r.key !== 'handover');
  // 설정 > 확인 필요 파일을 맨 위로: 읽기 오류 → 업데이트 필요 → 업데이트 중 → 없는 필수 → 나머지(같은 등급은 원래 순서)
  const attn = (r) => { const st = roleStateOf(r.key); return st === 'error' ? 0 : st === 'stale' ? 1 : st === 'updating' ? 2 : (st === 'missing' && r.required) ? 3 : 4; };
  const order = (list) => settings.dataStaleFirst ? [...list].sort((a, b) => attn(a) - attn(b)) : list;
  const req = order(roles.filter(r => r.required)), opt = roles.filter(r => !r.required);
  const optHave = order(opt.filter(r => matched[r.key] || roleInfo(r.key).entries.length)), optMiss = opt.filter(r => !optHave.includes(r));
  const ho = handoverCacheStats();
  const hasHo = fileRoles.some(r => r.key === 'handover');
  if (dataViewMode === 'board') {
    const need = roles.filter(r => { const st = roleStateOf(r.key); return ['stale', 'error', 'updating'].includes(st) || (st === 'missing' && r.required); });
    const fresh = roles.filter(r => roleStateOf(r.key) === 'latest');
    const none = optMiss.filter(r => !need.includes(r));
    const col = (title, cls, list, extra = '') => `<div class="bcol ${cls}"><div class="bh"><b>${title}</b><span class="chip ${cls === 'ok' ? 'ok' : cls === 'warn' ? 'warn' : 'off'}">${list.length + (extra ? 1 : 0)}</span></div>${list.map(boardCard).join('')}${extra}${(list.length || extra) ? '' : '<div class="muted bempty">없음</div>'}</div>`;
    const hoCard = hasHo ? `<div class="bcard live"><div class="bt"><b>🌐 OT 인수인계</b><span class="rt"><span class="chip ok"><i></i>연동됨</span></span></div><div class="bf2"><span class="muted fn">구글 시트에서 읽기${ho ? ` · 환자 ${ho.total}명` : ''}</span><span class="bw">실시간</span></div></div>` : '';
    box.innerHTML = `<div class="board${settings.dataHideUnused ? ' two' : ''}">${col('✅ 최신', 'ok', fresh, hoCard)}${col('⚠ 확인 필요', 'warn', need)}${settings.dataHideUnused ? '' : col('⬜ 선택 안 함', 'off', none)}</div>`;
  } else {
    const hoRow = hasHo ? `<div class="frow live"><b>🌐 OT 인수인계</b><span class="muted fn">구글 시트에서 읽기${ho ? ` · 환자 ${ho.total}명` : ''}</span><span class="wh">실시간</span><span class="chip ok"><i></i>연동됨</span><span class="ac"></span></div>` : '';
    box.innerHTML = `<div class="grp"><b>필수 파일</b><span class="muted">${req.length}개 · 모두 있어야 검증이 정확해요</span></div>${req.map(fileRow).join('')}`
      + `<div class="grp"><b>선택 파일</b><span class="muted">있으면 더 많이 검증해요</span></div>${optHave.map(fileRow).join('')}`
      + (optMiss.length && !settings.dataHideUnused ? `<details class="miss-opt wide"><summary>파일 없음 ${optMiss.length}개 <small>펼치기</small></summary>${optMiss.map(fileRow).join('')}</details>` : '')
      + (hoRow ? `<div class="grp"><b>실시간 연동</b></div>${hoRow}` : '');
  }

  // 보기 전환·기본값 표시
  document.querySelectorAll('#dataViewSeg [data-dv]').forEach(b => b.classList.toggle('active', b.dataset.dv === dataViewMode));
  const defBtn = document.getElementById('dataViewDefault');
  if (defBtn) { const isDef = dataViewMode === dataViewDefault; defBtn.textContent = isDef ? '★ 기본 보기' : '☆ 이 보기를 기본으로'; defBtn.disabled = isDef; }

  const states = lastScan ? roles.map(r => roleStateOf(r.key)) : [];
  const n = (st) => states.filter(x => x === st).length;
  const reqOk = req.filter(r => roleStateOf(r.key) === 'latest').length;
  document.getElementById('dataChips').innerHTML = lastScan
    ? chipHtml(reqOk === req.length ? 'ok' : 'err', `필수 ${reqOk}/${req.length} 최신`) + chipHtml(optHave.length ? 'ok' : 'off', `선택 ${optHave.length} 있음`)
      + (n('stale') ? chipHtml('warn', `업데이트 필요 ${n('stale')}`) : '') + (n('error') ? chipHtml('err', `읽기 오류 ${n('error')}`) : '') + chipHtml('off', `없음 ${optMiss.length + req.filter(r => !matched[r.key]).length}`)
    : '';

  // "파일은 바뀌었는데 아직 프로그램에 반영되지 않은" 경우를 단순히 '최신'으로 두지 않고 따로 알린다.
  const stale = lastScan ? roles.filter(r => roleStateOf(r.key) === 'stale') : [];
  if (stale.length) {
    const min = RehabSync.MODE_MINUTES[syncMode];
    banner.innerHTML = `<div class="sync-banner"><b>⚠ 새로운 데이터 발견</b> · ` + stale.map(r => { const i = roleInfo(r.key); return `${r.label} — 파일 ${fmtTime(i.modified)} (마지막 반영 ${i.reflectedAt ? fmtTime(i.reflectedAt) : '없음'})`; }).join(' / ')
      + ` &nbsp;${min ? `자동 동기화(${min}분 주기)가 켜져 있어 곧 반영됩니다. ` : ''}<button class="btn primary" data-sync-now>지금 업데이트</button></div>`;
  } else banner.innerHTML = '';

  document.getElementById('dataStatus').textContent = lastScan
    ? `${lastSyncAt ? '마지막 동기화 ' + fmtDateTime(lastSyncAt) + ' · ' : ''}폴더 ${lastScan.folders.length}개`
      + (lastScan.unmatched.length ? ` · 미인식 파일 ${lastScan.unmatched.length}건` : '')
      + (lastScan.errors.length ? ` · 폴더 읽기 오류 ${lastScan.errors.length}건(${lastScan.errors.map(e => e.error).join(' / ')})` : '')
    : '아직 불러오지 않았습니다.';
}

// 전체 상태(상단 pill·도구 화면 띠 공용): updating > error > stale > 필수 파일 없음 > 정상
function syncOverview(roles) {
  if (!lastScan) return { cls: 'busy', text: '데이터 확인 중…' };
  const states = roles.map(r => [r, roleStateOf(r)]);
  const count = (st) => states.filter(x => x[1] === st).length;
  const missingRequired = states.filter(x => x[1] === 'missing' && (roleDef(x[0]) || {}).required).map(x => roleDef(x[0]).label);
  if (syncing || count('updating')) return { cls: 'busy', text: '↻ 업데이트 중…' };
  if (count('error')) return { cls: 'err', text: `! 읽기 오류 ${count('error')}개` };
  if (count('stale')) return { cls: 'stale', text: `⚠ 업데이트 필요 ${count('stale')}개` };
  if (missingRequired.length) return { cls: 'err', text: `✕ 필수 파일 없음: ${missingRequired.join(', ')}` };
  return { cls: 'ok', text: '● 정상' };
}
const scanRoles = () => fileRoles.map(r => r.key).filter(k => k !== 'handover');

function renderSyncPill() {
  const el = document.getElementById('syncPill');
  if (!el) return;
  const o = syncOverview(scanRoles());
  el.className = `pill sync-pill ${o.cls}`;
  el.textContent = o.text + (lastSyncAt ? ` · 마지막 동기화 ${fmtTime(lastSyncAt, true)}` : '');
}

// 각 도구 화면 위의 파일 상태 띠 — 이 화면이 쓰는 파일이 올라와 있는지(색 칩), 마지막 동기화 일시, 불러오기·직접 넣기 버튼을 한 줄로 보여준다.
// 도구 안의 큰 업로드 영역은 기본으로 접어 두고(아래 FILES_CSS), 필요한 파일이 없거나 사용자가 "직접 넣기"를 누르면 펼친다.
const CHIP_NAME = { card3: '3F 시간표', card10: '10F 시간표', pt3: '3F 물리치료', pt10: '10F 물리치료', mt3: '3F 매트·테이블', mat10: '10F 매트', table10: '10F 테이블',
  dailyStats: '일일통계', acting: '액팅 기록', status: '작업치료현황', dailySchedule: 'OT 시간표(평일)', satSchedule: 'OT 시간표(토·공)', pta: 'PTA 재원현황' };
const FILES_CSS = {
  rm: 'body.rh-collapsed .upload-grid,body.rh-collapsed .grand-pt-upload{display:none!important}'
    + 'body.rh-collapsed section.panel:has(.upload-grid)>.panel-head{display:none!important}body.rh-collapsed section.panel:has(.upload-grid)>.panel-body{padding:8px 18px!important}body.rh-collapsed #statusLine{margin:0!important}'
    + 'body.rh-collapsed .grand-ot-upload>:not(#grandHandoverStatus):not(#grandHandoverMatchSummary):not(#grandHandoverRefreshBtn){display:none!important}',
  acting: 'body.rh-collapsed #dropZone,body.rh-collapsed #msDropZone,body.rh-collapsed #dcDropZone,body.rh-collapsed #dcFolderPickBtn,body.rh-collapsed label[for=dcFileInput]{display:none!important}',
  cross: 'body.rh-collapsed #prepPanel:not(:has(.prep-badge.err)){display:none!important}body.rh-collapsed .toprow{grid-template-columns:1fr!important}',
};
const filesOpen = {}; // 사용자가 직접 펼침/접음을 정한 도구(없으면 자동 판단)
const primaryRolesOf = (key) => TOOLS[key].primaryRoles || toolRoles(key).filter(r => (roleDef(r) || {}).required);
// 자동 판단: 꼭 필요한 파일이 없거나 읽기 오류가 있고, 도구에도 직접 올린 분석 결과가 없으면 펼쳐서 바로 넣을 수 있게 한다
const filesIsOpen = (key) => (key in filesOpen) ? filesOpen[key]
  : settings.filesArea === 'open' ? true
  : primaryRolesOf(key).some(r => ['missing', 'error'].includes(roleStateOf(r))) && !readToolSummary(key);
function applyFilesCollapse(key) {
  const doc = viewDoc(key); if (!doc || !doc.body || !FILES_CSS[key]) return;
  if (!doc.getElementById('rh-collapse-css')) { const st = doc.createElement('style'); st.id = 'rh-collapse-css'; st.textContent = FILES_CSS[key]; doc.head.appendChild(st); }
  doc.body.classList.toggle('rh-collapsed', !filesIsOpen(key));
}
function fileChip(role, key) {
  const i = roleInfo(role), def = roleDef(role) || {}, st = i.state;
  const manualLoaded = key === 'acting' && role === 'acting' && st === 'missing' && readToolSummary('acting'); // 화면에서 직접 올린 경우
  let dcLocal = null; // 일일통계를 화면 안에서 직접 올린 경우: 팀별 인식 수를 칩에 보여준다
  if (key === 'acting' && role === 'dailyStats' && st === 'missing') { try { const q = document.querySelector('iframe[data-tool="acting"]').contentWindow.__dcSummary; if (q && q.ok) dcLocal = q; } catch (e) { /* 아직 로드 전 */ } }
  const cls = dcLocal ? (dcLocal.ok === dcLocal.total ? 'ok' : 'stale') : manualLoaded ? 'ok' : st === 'latest' ? 'ok' : st === 'stale' ? 'stale' : st === 'updating' ? 'busy' : st === 'error' ? 'err' : def.required ? 'err' : 'off';
  const manual = (lastScan && lastScan.manualRoles || []).includes(role);
  const when = dcLocal ? `직접 올림 · ${dcLocal.ok}/${dcLocal.total}팀` : manualLoaded ? '직접 올림' : st === 'missing' ? (def.required ? '없음' : '미선택') : (i.modified ? fmtTime(i.modified) : '') + (manual ? ' · 직접' : '');
  const tip = [def.label, i.entries.length ? '파일: ' + i.entries.map(e => e.name).join(', ') : '파일 없음', i.modified ? '파일 수정: ' + fmtTime(i.modified) : '', i.reflectedAt ? '프로그램 반영: ' + fmtTime(i.reflectedAt) : '', RehabSync.STATE_LABEL[st], i.error || ''].filter(Boolean).join('\n');
  // 칩을 누르면 그 파일을 바꾸거나(직접 선택) 자동 인식으로 되돌리는 작은 메뉴가 뜬다
  return `<span class="fchip ${cls} click" data-chip="${role}" data-chip-tool="${key}" title="${updEsc(tip + '\n클릭: 파일 변경')}"><i></i>${CHIP_NAME[role] || def.label || role}<small>${updEsc(when)}</small><small>▾</small></span>`;
}
// 파일 하나만 다시 읽어 도구 화면에 반영한다(바뀐 게 없어도 다시 읽음 — 전체 동기화와 달리 이 파일만)
async function resyncRole(role) {
  if (syncing) return;
  syncing = true;
  const label = (roleDef(role) || {}).label || role;
  try {
    await refreshScan();
    const ok = await applyRoles([role]);
    logActivity('데이터 동기화', ok.length ? `${label} 다시 불러옴` : `${label} 읽기 오류`, ok.length > 0);
    showToast(ok.length ? `✅ ${updEsc(label)} 다시 불러왔어요` : `⚠ ${updEsc(label)}을(를) 읽지 못했어요`, 3500);
  } catch (e) { showToast(`⚠ 다시 불러오지 못했어요: ${updEsc(e.message)}`, 5000); }
  finally { syncing = false; renderAll(); }
}
let chipMenu = null;
const closeChipMenu = () => { if (chipMenu) { chipMenu.remove(); chipMenu = null; } };
function openChipMenu(chipEl) {
  closeChipMenu();
  const role = chipEl.dataset.chip, key = chipEl.dataset.chipTool, def = roleDef(role) || {}, i = roleInfo(role);
  const manual = (lastScan && lastScan.manualRoles || []).includes(role);
  const files = i.entries.length ? i.entries.map(e => `<div class="cm-file" title="${updEsc(e.path || e.name)}">${updEsc(e.name)}</div>`).join('') : '<div class="cm-file none">지금 연결된 파일이 없어요</div>';
  const m = document.createElement('div'); m.className = 'chip-menu';
  m.innerHTML = `<div class="cm-h"><b>${updEsc(def.label || CHIP_NAME[role] || role)}</b><span>${manual ? '직접 선택한 파일' : '폴더에서 자동 인식'}</span></div>${files}`
    + (i.entries.length ? `<button type="button" data-chip-resync="${role}">🔄 이 파일만 다시 불러오기</button>` : '')
    + `<button type="button" data-manual-pick="${role}">📂 파일 변경…</button>`
    + (manual ? `<button type="button" data-manual-clear="${role}">↩ 직접 선택 해제 (자동 인식으로)</button>` : '')
    + (key === 'acting' && role === 'dailyStats' ? '<button type="button" data-open-dc>📊 팀별 인식 현황 보기</button>' : '');
  document.body.appendChild(m);
  const r = chipEl.getBoundingClientRect(), w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  chipMenu = m;
}
const fmtDateTime = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
function renderToolStrips() {
  for (const key of Object.keys(TOOLS)) {
    const el = document.querySelector(`[data-tool-status="${key}"]`);
    if (!el) continue;
    const roles = toolRoles(key);
    const o = syncOverview(roles);
    const hasHandover = TOOLS[key].targets.some(t => (t.roles || [t.role]).includes('handover'));
    const open = filesIsOpen(key);
    el.className = `tool-status ${o.cls}`;
    el.innerHTML = `<b>${o.cls === 'ok' ? '● 데이터 최신' : o.text}</b>`
      + `<span class="when">${lastSyncAt ? '마지막 동기화 ' + fmtDateTime(lastSyncAt) : '아직 동기화 전'}</span>`
      + `<span class="chips">${roles.map(r => fileChip(r, key)).join('')}${hasHandover ? '<span class="fchip ok" title="인수인계 구글 시트에서 실시간으로 읽어옵니다"><i></i>인수인계<small>실시간</small></span>' : ''}</span>`
      + `<span class="acts"><button class="btn${o.cls === 'ok' ? '' : ' primary'}" data-sync-now>🔄 불러오기</button>`
      + `<button class="btn" data-files-toggle="${key}">📂 직접 넣기 ${open ? '▴' : '▾'}</button></span>`;
    if (loadedTools.has(key)) applyFilesCollapse(key);
  }
}

function renderAll() { renderHome(); renderDataView(); }

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

// ── 백업 상태(읽기 전용) ───────────────────────────────────
// 백업은 PowerShell(OneDrive_Backup.ps1)이 하고, 여기서는 그 로그를 읽어 상태만 보여준다. 60초마다 가볍게 다시 읽는다.
let backupStatus = null;
const BK_LEVEL = { ok: 'green', warn: 'orange', err: 'red' };
function backupAlertRow() {
  const b = backupStatus; if (!b || b.level === 'off') return '';
  return alertRow('백업 상태', b.level === 'unknown' ? '기록 없음' : b.level === 'ok' ? '정상' : '확인 필요', BK_LEVEL[b.level] || 'orange',
    b.level === 'ok' ? null : `[백업] ${b.title}`);
}
const bkAgo = (ms, now) => { if (!ms) return '-'; const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 90 ? `${s}초 전` : s < 5400 ? `${Math.round(s / 60)}분 전` : s < 172800 ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 86400)}일 전`; };
const bkTime = (ms) => { if (!ms) return '-'; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const bkEsc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BK_TICK_LABEL = { done: '완료', interrupted: '중단', missed: '놓침', running: '진행 중', upcoming: '예정', off: '꺼져 있었음' };

async function refreshBackup() {
  try { backupStatus = await window.rehab.backup.status(); } catch (e) { backupStatus = { level: 'unknown', title: '백업 상태를 읽지 못했어요', detail: String((e && e.message) || e), logFound: false }; }
  renderBackupView(); renderHome();
}
function renderBackupView() {
  const el = document.getElementById('backupBody'); const b = backupStatus; if (!el || !b) return;
  const now = b.now || Date.now();
  const head = `<div class="card bk-banner ${b.level}"><div><div class="t">${bkEsc(b.title)}</div><div class="d">${bkEsc(b.detail)}</div></div>
    <div class="acts"><button class="btn" id="bkReload">🔄 새로고침</button><button class="btn" data-bk-open="log">📄 로그 위치 열기</button>
    <button class="btn" data-bk-open="schedule">📁 예약 백업 폴더</button><button class="btn" data-bk-open="realtime">📁 실시간 백업 폴더</button></div></div>`;
  if (!b.logFound) { el.innerHTML = head + bkLogCard(b); wireBackupView(); return; }
  const cfg = b.config || {}, ls = b.lastScheduled;
  const facts = `<div class="bk-grid">
    <div class="bk-fact"><div class="k">마지막 실시간 동기화</div><div class="v">${bkAgo(b.lastRealtimeEndMs, now)}</div><div class="s">${(b.lastRealtime || []).map(r => `${bkEsc(r.name)} ${r.ok ? '✓' : '✕ 코드 ' + r.code}`).join(' · ') || '-'}</div></div>
    <div class="bk-fact"><div class="k">마지막 예약 백업(구글 드라이브)</div><div class="v">${ls ? bkTime(ls.startMs) : '-'}</div><div class="s">${ls ? (ls.state === 'done' ? '완료' : ls.state === 'running' ? '진행 중' : '<span style="color:var(--red)">끝까지 기록되지 않음(중단)</span>') : '기록 없음'}${b.lastDoneMs ? ` · 마지막 완료 ${bkTime(b.lastDoneMs)}` : ''}</div></div>
    <div class="bk-fact"><div class="k">다음 예약 백업</div><div class="v">${bkTime(b.nextMs)}</div><div class="s">${b.running ? `${Math.max(0, Math.round((b.nextMs - now) / 60000))}분 뒤 · 프로그램이 켜져 있을 때만 실행` : '프로그램이 꺼져 있으면 실행되지 않아요'}</div></div>
    <div class="bk-fact"><div class="k">프로그램 마지막 시작</div><div class="v">${bkTime(b.lastStartMs)}</div><div class="s">${b.running ? '가동 ' + bkAgo(b.lastStartMs, now).replace(' 전', '') : '현재 꺼짐'} · 기록상 시작 ${b.restartsTotal}회</div></div>
    <div class="bk-fact" style="grid-column:1/-1"><div class="k">오늘 예약 백업 (${cfg.startHour}~${cfg.endHour}시 정각) — ${b.today.done}/${b.today.expected}회 완료</div>
      <div class="bk-ticks">${b.today.ticks.filter(t => t.state !== 'off').map(t => `<span class="bk-tick ${t.state}">${t.hour}시 ${BK_TICK_LABEL[t.state]}</span>`).join('') || '<span class="muted">오늘은 아직 프로그램이 켜진 기록이 없어요</span>'}</div></div></div>`;
  const dayRows = (b.days || []).map(d => d.active
    ? `<tr><td>${d.day.slice(5)}</td><td>${bkTime(d.firstMs).slice(-5)} ~ ${bkTime(d.lastMs).slice(-5)}</td><td>${d.scheduledDone}회</td><td class="${d.interrupted ? 'bad' : 'dim'}">${d.interrupted || '-'}</td><td class="${d.problems ? 'bad' : 'dim'}">${d.problems || '-'}</td><td class="${d.restarts > 1 ? '' : 'dim'}">${d.restarts || '-'}</td></tr>`
    : `<tr><td class="dim">${d.day.slice(5)}</td><td class="dim" colspan="5">기록 없음 (꺼져 있었음)</td></tr>`).join('');
  const f = b.folders || {};
  const sched = f.schedule ? (f.schedule.exists ? `날짜 폴더 ${f.schedule.count}개${f.schedule.count > (cfg.retentionDays || 7) ? ' <span style="color:var(--orange)">(보관 기간보다 많아요 — 다음 예약 백업 때 정리돼요)</span>' : ''} · 최근 ${f.schedule.dates.slice(-3).map(d => `${d.name.slice(5)}(${d.runs}회)`).join(', ') || '-'}` : '<span style="color:var(--orange)">이 PC에서 폴더를 열 수 없어요(G 드라이브 연결 확인)</span>') : '-';
  const rt = f.realtime ? (f.realtime.exists ? `있음 · 마지막 변경 ${bkTime(f.realtime.mtimeMs)}` : '<span style="color:var(--orange)">이 PC에서 폴더를 찾을 수 없어요</span>') : '-';
  const conf = `<div class="card" style="margin-top:14px"><h2>⚙️ 백업 설정 (스크립트 기준)</h2>${b.scriptFound ? '' : '<p class="muted">OneDrive_Backup.ps1 을 찾지 못해 기본 설정(08~17시, 7일 보관)으로 표시해요. 로그 판정은 그대로 정확해요.</p>'}
    <table class="bk-table bk-kv"><tbody>
    <tr><td>백업 대상</td><td>${(b.script && b.script.sources.length ? b.script.sources.map(s => `${bkEsc(s.name)} <code>${bkEsc(s.source)}</code>`).join('<br>') : '-')}</td></tr>
    <tr><td>실시간 백업</td><td>${cfg.realtimeEverySec}초마다 · ${b.script && b.script.mirrorRealtime ? '미러(원본에서 지운 파일은 백업에서도 지워져요)' : '-'}<br><code>${bkEsc((b.script && b.script.realtimeRoot) || '-')}</code> — ${rt}</td></tr>
    <tr><td>예약 백업</td><td>매일 ${cfg.startHour}~${cfg.endHour}시 정각 · 구글 드라이브에 날짜/시각 폴더로 누적(삭제 반영 안 함)<br><code>${bkEsc((b.script && b.script.scheduleRoot) || '-')}</code> — ${sched}</td></tr>
    <tr><td>보관 기간</td><td>날짜 폴더 ${cfg.retentionDays}개(${cfg.retentionDays}일)까지 보관, 초과한 오래된 날짜부터 자동 삭제${b.lastDeleted ? `<br>마지막 자동 삭제: ${bkEsc(b.lastDeleted.name)} (${bkTime(b.lastDeleted.ms)} 기록)` : '<br>기록된 자동 삭제 없음'}</td></tr>
    </tbody></table></div>`;
  const hist = `<div class="card" style="margin-top:14px"><h2>📅 최근 7일</h2><table class="bk-table"><thead><tr><th>날짜</th><th>가동 시간</th><th>예약 완료</th><th>중단</th><th>오류</th><th>재시작</th></tr></thead><tbody>${dayRows}</tbody></table></div>`;
  const probs = `<div class="card" style="margin-top:14px"><h2>⚠ 최근 문제 (7일)</h2>${(b.problems.length || b.interrupted.length) ? `<table class="bk-table"><tbody>${b.interrupted.map(r => `<tr><td>${bkTime(r.startMs)}</td><td class="bad">예약 백업(${bkEsc(r.key)})이 끝까지 기록되지 않았어요</td></tr>`).join('')}${b.problems.map(p => `<tr><td>${bkTime(p.ms)}</td><td class="bad">${bkEsc(p.msg)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">최근 7일 동안 문제 기록이 없어요.</p>'}</div>`;
  el.innerHTML = head + facts + conf + hist + probs + bkLogCard(b);
  wireBackupView();
}
function bkLogCard(b) {
  return `<div class="card" style="margin-top:14px"><h2>📄 로그 위치</h2><table class="bk-table bk-kv"><tbody>
    <tr><td>로그 파일</td><td><code>${bkEsc(b.logPath || '-')}</code>${b.logFound ? ` · ${(b.logSize / 1024).toFixed(0)}KB` : ''}</td></tr>
    <tr><td>스크립트</td><td><code>${bkEsc(b.scriptPath || '-')}</code> ${b.scriptFound ? '' : '(없음)'}</td></tr></tbody></table>
    <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="bkResetLog">기본 위치로</button><button class="btn" id="bkChooseLog">로그 위치 바꾸기…</button></div>
    <div class="status-line">백업 프로그램이 다른 PC에서 돌고 있다면 그 PC의 backup.log를 이 PC로 동기화한 경로를 골라 주세요. 이 화면은 로그를 읽기만 하고 백업을 시작·중지하지 않아요.</div></div>`;
}
function wireBackupView() {
  const q = (id) => document.getElementById(id);
  if (q('bkReload')) q('bkReload').onclick = refreshBackup;
  document.querySelectorAll('[data-bk-open]').forEach(btn => btn.onclick = async () => { if (!(await window.rehab.backup.open(btn.dataset.bkOpen))) btn.textContent = '열 수 없어요'; });
  if (q('bkChooseLog')) q('bkChooseLog').onclick = async () => { if (await window.rehab.backup.chooseLog()) refreshBackup(); };
  if (q('bkResetLog')) q('bkResetLog').onclick = async () => { await window.rehab.backup.resetLog(); refreshBackup(); };
}
setInterval(() => refreshBackup(), 60 * 1000);

async function renderSettingsView() {
  const folders = await window.rehab.folders.list();
  document.getElementById('folderList').innerHTML = folders.length
    ? folders.map(f => `<div class="st-fold">📁 <b>${updEsc(f.label)}</b><code>${updEsc(f.dirPath)}</code><button class="btn" data-remove="${f.id}">제거</button></div>`).join('')
    : '<p class="st-note">등록된 폴더가 없습니다. "폴더 추가"를 눌러 시간표·현황 파일이 있는 폴더를 선택해 주세요.</p>';
  document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
    await window.rehab.folders.remove(b.dataset.remove);
    renderSettingsView();
  }));
  if (window.__renderSettingsUi) window.__renderSettingsUi();
}

document.getElementById('addFolderBtn').addEventListener('click', async () => {
  const entry = await window.rehab.folders.choose();
  if (entry) { logActivity('설정', `폴더 등록: ${entry.label}`); renderSettingsView(); }
});
document.getElementById('dataScanBtn').addEventListener('click', () => syncNow({ statusEl: document.getElementById('dataStatus') }));
// "지금 업데이트"/"데이터 업데이트" 버튼은 화면을 다시 그릴 때마다 새로 생기므로 위임으로 한 번만 연결한다.
document.addEventListener('click', async (e) => {
  const fp = e.target.closest('[data-files-pop]');
  if (fp) { chipMenu && chipMenu.dataset.for === 'files-pop' ? closeChipMenu() : openFilesPop(fp); return; }
  const ts = e.target.closest('[data-today-summary]');
  if (ts) { closeChipMenu(); const ok = await copyText(todaySummaryText()); showToast(ok ? '✔ 오늘 요약을 복사했어요 — 카톡에 붙여넣기(Ctrl+V)' : '⚠ 복사하지 못했어요', 3500); return; }
  const wp = e.target.closest('[data-who-plan]');
  if (wp) { showView('cross'); setTimeout(() => { try { document.querySelector('iframe[data-tool="cross"]').contentWindow.__openFixPlan(wp.dataset.whoPlan); } catch (err) { /* 교차검증 결과가 아직 없음 */ } }, 450); return; }
  const np = e.target.closest('[data-new-patient]');
  if (np) { e.stopPropagation(); showView('handover'); setTimeout(() => viewDoc('handover')?.getElementById('newPatientBtn')?.click(), 600); return; }
  const wt = e.target.closest('[data-goto-tile]');
  if (wt && !e.target.closest('a,button')) { showView(wt.dataset.gotoTile); return; }
  if (wt && e.target.closest('a:not([data-open-fixplan]):not([data-new-patient])')) { showView(wt.dataset.gotoTile); return; }
  const chip = e.target.closest('[data-chip]');
  if (chip) { chipMenu && chipMenu.dataset.for === chip.dataset.chip + chip.dataset.chipTool ? closeChipMenu() : (openChipMenu(chip), chipMenu.dataset.for = chip.dataset.chip + chip.dataset.chipTool); return; }
  if (chipMenu) closeChipMenu(); // 메뉴 안 버튼은 아래 처리기가 이어서 실행한다(눌린 버튼 요소는 그대로 남아 있음)
  const rs = e.target.closest('[data-chip-resync]'); if (rs) { resyncRole(rs.dataset.chipResync); return; }
  if (e.target.closest('[data-sync-now]')) { toastEl.classList.remove('show'); syncNow(); return; }
  const dv = e.target.closest('[data-dv]'); if (dv) { dataViewMode = dv.dataset.dv; renderDataView(); return; }
  if (e.target.closest('#dataViewDefault')) { setDataViewDefault(dataViewMode); return; }
  if (e.target.closest('[data-open-dc]')) { try { document.querySelector('iframe[data-tool="acting"]').contentWindow.__showDcStatus(); } catch (err) { /* 화면이 아직 로드 전 */ } return; }
  const ga = e.target.closest('[data-grand-apply]'); if (ga) { applyHomeGrandEvent(+ga.dataset.grandApply || 0); return; }
  if (e.target.closest('[data-open-fixplan]')) { showView('cross'); setTimeout(() => viewDoc('cross')?.getElementById('btnFixPlan')?.click(), 300); return; }
  const ft = e.target.closest('[data-files-toggle]'); if (ft) { const k = ft.dataset.filesToggle; filesOpen[k] = !filesIsOpen(k); renderToolStrips(); return; }
  const pick = e.target.closest('[data-manual-pick]');
  if (pick) {
    const r = await window.rehab.folders.chooseFile(pick.dataset.manualPick);
    if (r) { logActivity('데이터 준비', `직접 선택: ${roleDef(r.role).label}`); syncNow(); }
    return;
  }
  const clear = e.target.closest('[data-manual-clear]');
  if (clear) { await window.rehab.folders.clearManual(clear.dataset.manualClear); logActivity('데이터 준비', `직접 선택 해제: ${roleDef(clear.dataset.manualClear).label}`); syncNow(); }
});
// 컴팩트 홈: 도구 타일 어디를 눌러도 열린다(타일 안의 열기 버튼은 숨김)
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('home-compact')) return;
  const c = e.target.closest('.hcard'); if (c && !e.target.closest('button')) c.querySelector('button[data-goto]')?.click();
});
document.getElementById('syncPill').addEventListener('click', () => {
  const o = syncOverview(scanRoles());
  if (o.cls === 'stale' || o.cls === 'err') syncNow(); else showView('data');
});
document.getElementById('topbarSettingsBtn').addEventListener('click', () => showView('settings'));

// ── 업데이트(GitHub Releases) ─────────────────────────────
let updaterMode = 'manual';
// 설정 > 업데이트·정보 화면과 오른쪽 아래 안내(토스트)는 연차관리 앱과 같은 모양·흐름으로 맞췄다
function setUpdateStatus(text, isError) {
  const el = document.getElementById('updaterStatus');
  el.textContent = text; el.classList.toggle('error', !!isError);
}
function onUpdaterStatus(s) {
  const progress = document.getElementById('updProgress'), installBtn = document.getElementById('updaterInstallBtn'), notes = document.getElementById('updNotes');
  progress.style.display = s.status === 'downloading' ? '' : 'none';
  installBtn.style.display = s.status === 'downloaded' ? '' : 'none';
  if (s.status === 'checking') setUpdateStatus('업데이트를 확인하는 중...');
  else if (s.status === 'not-available') setUpdateStatus('최신 버전을 사용하고 있습니다. ✅');
  else if (s.status === 'available') {
    setUpdateStatus(`새 버전 v${s.version}을 받는 중입니다...`);
    if (s.releaseNotes) { notes.style.display = ''; notes.textContent = String(s.releaseNotes).replace(/<[^>]+>/g, ''); }
  }
  else if (s.status === 'downloading') { setUpdateStatus(`새 버전을 받는 중... ${s.percent ?? 0}%`); progress.firstElementChild.style.width = (s.percent ?? 0) + '%'; }
  else if (s.status === 'downloaded') setUpdateStatus(`v${s.version} 준비 완료. ` + (s.postponed ? '프로그램을 끌 때 자동으로 설치됩니다. 지금 하려면 「재시작하여 설치」를 누르세요.' : '「재시작하여 설치」를 누르면 설치합니다. (그냥 두면 프로그램을 끌 때 설치)'));
  else if (s.status === 'auto-install-pending') setUpdateStatus(`v${s.version} 준비 완료. 잠시 후 자동으로 다시 시작합니다.`);
  else if (s.status === 'updated') setUpdateStatus(`v${s.version}(으)로 업데이트되었습니다. ✅`);
  else if (s.status === 'dev-mode') setUpdateStatus(s.message);
  else if (s.status === 'error') setUpdateStatus('업데이트 확인 실패: ' + s.message, true);
}
// 오른쪽 아래 안내: 자동 설치 카운트다운 / 받는 중 / 설치 준비 완료 / 업데이트 완료
let updateToastTimer = null;
function showUpdateToast(s) {
  let el = document.getElementById('update-toast');
  const close = () => { clearInterval(updateToastTimer); clearTimeout(updateToastTimer); if (el) el.remove(); };
  const ensure = () => { if (!el) { el = document.createElement('div'); el.id = 'update-toast'; el.className = 'update-toast'; document.body.appendChild(el); } return el; };
  if (s.status === 'auto-install-pending') {
    let left = s.seconds || 10;
    ensure().innerHTML = `<b>🔄 새 버전 v${updEsc(s.version)} 준비 완료</b><div class="ut-msg"><span id="ut-left">${left}</span>초 후 자동으로 다시 시작해서 설치합니다.</div>`
      + '<div class="ut-actions"><button class="btn" id="ut-later">나중에 (끌 때 설치)</button><button class="btn primary" id="ut-now">지금 재시작</button></div>';
    clearInterval(updateToastTimer);
    updateToastTimer = setInterval(() => { left--; const n = document.getElementById('ut-left'); if (n) n.textContent = Math.max(left, 0); if (left <= 0) clearInterval(updateToastTimer); }, 1000);
    document.getElementById('ut-later').addEventListener('click', () => { close(); window.rehab.updater.postpone(); });
    document.getElementById('ut-now').addEventListener('click', () => window.rehab.updater.quitAndInstall());
  } else if (s.status === 'downloading' && s.auto) {
    ensure().innerHTML = `<b>🔄 새 버전을 받는 중… ${s.percent ?? 0}%</b><div class="update-progress"><div style="width:${s.percent ?? 0}%"></div></div>`;
  } else if (s.status === 'downloaded' && !s.postponed && currentView() !== 'settings') {
    ensure().innerHTML = `<b>🔄 새 버전 v${updEsc(s.version)} 준비 완료</b><div class="ut-msg">재시작하면 설치됩니다. (그냥 두면 프로그램을 끌 때 설치)</div>`
      + '<div class="ut-actions"><button class="btn" id="ut-close">닫기</button><button class="btn primary" id="ut-now">재시작하여 설치</button></div>';
    document.getElementById('ut-close').addEventListener('click', close);
    document.getElementById('ut-now').addEventListener('click', () => window.rehab.updater.quitAndInstall());
  } else if (s.status === 'updated') {
    ensure().innerHTML = `<b>✅ v${updEsc(s.version)}(으)로 업데이트되었습니다</b><div class="ut-msg">이전 버전: v${updEsc(s.from)} · 바뀐 내용은 설정 &gt; 업데이트·정보 &gt; 「업데이트 로그」에서 볼 수 있어요.</div>`;
    clearInterval(updateToastTimer); updateToastTimer = setTimeout(close, 8000);
  } else if (s.status === 'error' && s.auto !== false && el) close(); // 자동 진행 중 실패하면 안내를 정리(자세한 내용은 기록 파일)
}
window.rehab.updater.onStatus(s => { onUpdaterStatus(s); showUpdateToast(s); });
document.getElementById('updaterCheckBtn').addEventListener('click', async () => {
  setUpdateStatus('업데이트를 확인하는 중...');
  const r = await window.rehab.updater.checkNow();
  if (r.status === 'dev-mode' || r.status === 'error') setUpdateStatus(r.message || '업데이트 확인에 실패했습니다.', r.status === 'error');
});
document.getElementById('updaterInstallBtn').addEventListener('click', () => window.rehab.updater.quitAndInstall());
document.getElementById('updaterOpenLogBtn').addEventListener('click', async () => { const r = await window.rehab.updater.openLog(); if (r) setUpdateStatus(r); });
document.getElementById('updaterRepoBtn').addEventListener('click', () => window.rehab.updater.openUrl('repo'));

// 업데이트 로그 창: ① GitHub 릴리즈 이력(버전별 변경 내용) ② 이 PC에서 있었던 확인·다운로드·설치·오류 기록
const UPD_EVENT = { check: '확인 시작', available: '새 버전 발견', 'not-available': '최신 버전', downloaded: '다운로드 완료', install: '설치·재시작', error: '오류', 'dev-mode': '개발 모드' };
const updEsc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const updWhen = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
let updLogToken = 0; // 탭을 빠르게 바꿔도 늦게 도착한 이전 결과가 화면을 덮어쓰지 않게
async function renderUpdLog(tab) {
  const my = ++updLogToken, body = document.getElementById('updLogBody');
  document.querySelectorAll('.upd-tabs button').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
  body.innerHTML = '<p class="muted">불러오는 중…</p>';
  if (tab === 'local') {
    const log = await window.rehab.updater.getLog(); if (my !== updLogToken) return;
    body.innerHTML = log.length ? log.map(e => `<div class="upd-ev ${e.event === 'error' ? 'err' : ''}"><span class="t">${updWhen(e.t)}</span><span class="e">${updEsc(UPD_EVENT[e.event] || e.event)}</span><span>${updEsc([e.source, e.version && 'v' + e.version, e.message].filter(Boolean).join(' · '))}</span></div>`).join('')
      : '<p class="muted">아직 기록이 없어요. "지금 확인"을 누르거나 자동 확인이 돌면 여기에 쌓여요.</p>';
    return;
  }
  const [info, r] = await Promise.all([window.rehab.updater.getInfo(), window.rehab.updater.releases()]); if (my !== updLogToken) return;
  if (r.error) { body.innerHTML = `<p class="muted">GitHub에서 릴리즈 이력을 가져오지 못했어요 (${updEsc(r.error)}). 인터넷 연결을 확인하거나 아래 버튼으로 GitHub에서 직접 보세요.</p><button class="btn" id="updOpenRel">GitHub 릴리즈 페이지 열기</button>`; document.getElementById('updOpenRel').onclick = () => window.rehab.updater.openUrl('releases'); return; }
  const offNote = r.offline ? `<p class="muted">GitHub에 연결하지 못해(${updEsc(r.error || '')}) 앱에 들어 있는 변경 내용을 보여드려요. 이 PC 버전까지만 나옵니다.</p>` : '';
  body.innerHTML = offNote + r.list.map(x => `<div class="upd-rel ${x.version === info.version ? 'cur' : ''}"><div class="h">${updEsc(x.name || 'v' + x.version)}${x.version === info.version ? '<span class="upd-tag">현재 버전</span>' : ''}<small>${x.date ? updWhen(Date.parse(x.date)) : ''}</small></div>
    <div class="b ${x.body ? '' : 'none'}">${updEsc(x.body || '(등록된 변경 내용이 없어요)')}</div></div>`).join('') || '<p class="muted">릴리즈가 없어요.</p>';
}
document.getElementById('updaterLogBtn').addEventListener('click', () => { document.getElementById('updLogModal').classList.add('show'); renderUpdLog('rel'); });
document.getElementById('updLogClose').addEventListener('click', () => document.getElementById('updLogModal').classList.remove('show'));
document.getElementById('updLogModal').addEventListener('click', (e) => { if (e.target.id === 'updLogModal') e.currentTarget.classList.remove('show'); });
document.querySelector('.upd-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) renderUpdLog(b.dataset.t); });
document.querySelectorAll('input[name=updMode]').forEach(r => r.addEventListener('change', async () => {
  if (r.checked) updaterMode = await window.rehab.updater.setMode(r.value);
}));

// ── 단축키 ─────────────────────────────────────────────────
// Ctrl(맥은 ⌘)+키. 도구 화면은 iframe이라 키 이벤트가 셸까지 안 올라오므로, 로드될 때마다 같은 처리기를 달아 준다.
// Alt를 두 번 누르거나 길게 누르면 전체 단축키 + 지금 보는 화면의 단축키를 보여 준다(잇다와 같은 방식).
const NAV_ORDER = ['home', 'data', 'rm', 'acting', 'cross', 'handover', 'report', 'backup', 'settings'];
const currentView = () => document.querySelector('.view.active')?.dataset.view;
const viewDoc = (v) => (['home', 'data', 'report', 'settings', 'backup'].includes(v) ? document : document.querySelector(`iframe[data-tool="${v}"]`)?.contentDocument);
const clickIn = (v, id) => () => viewDoc(v)?.getElementById(id)?.click();
const focusIn = (v, id) => () => { const el = viewDoc(v)?.getElementById(id); if (el) { el.focus(); el.select && el.select(); } };
const GLOBAL_KEYS = [
  ...NAV_ORDER.map((v, i) => ({ id: `nav:${v}`, keys: `Ctrl+${i + 1}`, label: `${document.querySelector(`.nav-item[data-nav=${v}] .nl`).textContent.trim()} 화면으로 이동`, run: () => showView(v) })),
  { id: 'sidebar', keys: 'Ctrl+\\', label: '사이드바 접기/펼치기', run: () => sidebarBtn.click() },
];
// run이 없는 항목은 그 화면이 스스로 처리하는 키(안내용)
const VIEW_KEYS = {
  home: [{ id: 'home.scan', keys: 'Ctrl+R', label: '파일 자동 불러오기', run: clickIn('home', 'homeScanBtn') }, { keys: '1~9', label: '오늘 할 일 n번 바로 실행 (작업대 배치)' }],
  data: [{ id: 'data.scan', keys: 'Ctrl+R', label: '지금 업데이트', run: clickIn('data', 'dataScanBtn') }],
  rm: [{ id: 'rm.export', keys: 'Ctrl+E', label: '출력하기(Excel)', run: clickIn('rm', 'grandExportSelectedBtn') }],
  acting: [{ id: 'acting.find', keys: 'Ctrl+F', label: '환자·처방 검색', run: focusIn('acting', 'searchInput') }],
  cross: [
    { id: 'cross.find', keys: 'Ctrl+F', label: '검색', run: focusIn('cross', 'searchInput') },
    { id: 'cross.run', keys: 'Ctrl+Enter', label: '교차검증 실행 / 다시 검증', run: () => { const d = viewDoc('cross'); (d.getElementById('btnRerun')?.offsetParent ? d.getElementById('btnRerun') : d.getElementById('btnRun'))?.click(); } },
    { id: 'cross.fix', keys: 'Ctrl+Shift+F', label: '수정 지시서', run: clickIn('cross', 'btnFixPlan') },
    { id: 'cross.excel', keys: 'Ctrl+E', label: '결과 Excel 저장', run: clickIn('cross', 'btnExcel') },
    { id: 'cross.print', keys: 'Ctrl+P', label: '인쇄', run: clickIn('cross', 'btnPrint') },
  ],
  handover: [
    { id: 'handover.find', keys: 'Ctrl+F', label: '이름 검색', run: focusIn('handover', 'searchName') },
    { keys: 'F2', label: '이름 검색 (같은 기능)' },
    { id: 'handover.reload', keys: 'Ctrl+R', label: '지금 새로고침', run: clickIn('handover', 'reloadBtn') },
    { id: 'handover.new', keys: 'Ctrl+N', label: '새 환자 추가', run: clickIn('handover', 'newPatientBtn') },
    { keys: 'Esc', label: '창 닫기 / 선택 해제' },
  ],
  backup: [{ id: 'backup.reload', keys: 'Ctrl+R', label: '백업 상태 새로고침', run: () => refreshBackup() }],
};
const matchKeys = (e, keys) => {
  const parts = keys.split('+'), key = parts.pop();
  if ((e.ctrlKey || e.metaKey) !== parts.includes('Ctrl') || e.shiftKey !== parts.includes('Shift') || e.altKey) return false;
  return (e.key.length === 1 ? e.key.toLowerCase() : e.key) === (key.length === 1 ? key.toLowerCase() : key);
};
const effKeys = (x) => settings.keymap[x.id] || x.keys; // 설정 > 단축키에서 바꾼 키가 있으면 그것
// 설정 화면이 목록을 그리고 충돌을 검사할 때 쓰는 전체 단축키(공통 + 화면별)
const keyItems = () => [...GLOBAL_KEYS.map(x => ({ ...x, scope: 'global' })),
  ...Object.entries(VIEW_KEYS).flatMap(([v, l]) => l.map((x, i) => ({ ...x, id: x.id || `${v}.fixed${i}`, scope: v })))];
let keyRecording = false; // 설정 화면에서 새 단축키를 받는 중이면 다른 단축키가 반응하지 않게 한다
const keyLabel = (k) => (/Mac/i.test(navigator.platform) ? k.replace('Ctrl', '⌘') : k);

let altOverlay = null, altHold = null, altHeld = false, altCombo = false, altLastUp = 0;
const hideAlt = () => { altOverlay?.remove(); altOverlay = null; altHeld = false; };
function showAlt(byHold) {
  if (altOverlay) return;
  altHeld = byHold;
  const view = currentView(), vname = document.querySelector(`.nav-item[data-nav=${view}] .nl`)?.textContent.trim() || '';
  const rows = (list) => list.map(x => `<div class="alt-row"><span>${updEsc(x.label)}</span><kbd>${updEsc(keyLabel(effKeys(x)))}</kbd></div>`).join('');
  altOverlay = document.createElement('div'); altOverlay.className = 'alt-overlay';
  altOverlay.innerHTML = `<div class="alt-card"><h3>단축키</h3>${rows(GLOBAL_KEYS)}${(VIEW_KEYS[view] || []).length ? `<div class="alt-sub">지금 화면 · ${updEsc(vname)}</div>${rows(VIEW_KEYS[view])}` : ''}<p class="alt-hint">Alt를 떼거나 Esc를 누르면 닫혀요</p></div>`;
  document.body.appendChild(altOverlay);
}
function onKeyDown(e) {
  if (keyRecording) return;
  if (e.key === 'Escape' && chipMenu) { closeChipMenu(); return; }
  if (e.key === 'Alt') { if (!e.repeat) { altCombo = false; clearTimeout(altHold); altHold = setTimeout(() => showAlt(true), 500); } return; }
  if (e.altKey) altCombo = true;
  // 홈 작업대: 숫자 키 1~9 = 오늘 할 일 n번의 주 버튼 실행(입력칸에 글을 쓰는 중이면 무시)
  if (settings.shortcuts && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key) && currentView() === 'home' && document.body.classList.contains('home-wb') && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) {
    const t = document.querySelectorAll('#homeTodo .todo')[+e.key - 1];
    if (t) { e.preventDefault(); (t.querySelector('.btn.primary') || t.querySelector('.btn'))?.click(); return; }
  }
  if (e.key === 'Escape' && altOverlay) { hideAlt(); return; }
  if (!settings.shortcuts || !(e.ctrlKey || e.metaKey)) return;
  const hit = [...(VIEW_KEYS[currentView()] || []), ...GLOBAL_KEYS].find(x => x.run && matchKeys(e, effKeys(x)));
  if (hit) { e.preventDefault(); hit.run(); }
}
function onKeyUp(e) {
  if (e.key !== 'Alt') return;
  clearTimeout(altHold);
  if (altCombo) { altCombo = false; return; }
  if (altHeld) { hideAlt(); return; }
  const now = Date.now();
  if (now - altLastUp < 400) { showAlt(false); altLastUp = 0; } else altLastUp = now;
}
const onBlur = () => { clearTimeout(altHold); altCombo = false; if (altHeld) hideAlt(); }; // Alt+Tab으로 나가면 keyup을 못 받는다
const bindKeys = (doc, win) => { doc.addEventListener('keydown', onKeyDown, true); doc.addEventListener('keyup', onKeyUp, true); win.addEventListener('blur', onBlur); };
bindKeys(document, window);
document.querySelectorAll('iframe[data-tool]').forEach(f => f.addEventListener('load', () => { try { bindKeys(f.contentDocument, f.contentWindow); } catch (e) { /* 같은 출처가 아니면 건너뜀 */ } }));

// 도구가 분석을 끝내 요약이 바뀌면 알려 준다(화면 안에서 직접 파일을 올린 경우도 홈·상단 띠가 바로 바뀜)
let toolSummaryTimer = null;
window.__onToolSummary = () => { clearTimeout(toolSummaryTimer); toolSummaryTimer = setTimeout(renderHome, 200); };

// ── 설정 적용 ──────────────────────────────────────────────
// 도구(iframe)는 settings 객체를 그대로 받고(window.__rhSettings), 바뀔 때마다 __onSettingsChanged()가 불린다.
// 각 도구는 자기 기본값(오류 확인 필터, 분석 결과 접힘, 시작 시각, 잇다 불러오기 영역)만 이 훅에서 반영한다.
function pushSettingsToTool(iframe) {
  try { iframe.contentWindow.__rhSettings = settings; iframe.contentWindow.__onSettingsChanged?.(); } catch (e) { /* 아직 로드 전이거나 훅이 없는 도구 */ }
}
const pushSettingsToTools = () => document.querySelectorAll('iframe[data-tool]').forEach(pushSettingsToTool);
const applyZoom = () => { try { window.rehab.app.setZoom(RehabSettings.ZOOM[settings.fontSize]); } catch (e) { /* 개발용 화면 등 */ } };
const applyHomeLayout = () => { document.body.classList.toggle('home-compact', settings.homeLayout !== 'classic'); document.body.classList.toggle('home-wb', settings.homeLayout === 'workbench'); renderHome(); };
const applyColor = () => { document.documentElement.style.filter = settings.color === 'vivid' ? RehabSettings.VIVID_FILTER : ''; };
function applySetting(key) {
  switch (key) {
    case 'syncMode': syncMode = settings.syncMode; renderAll(); break;
    case 'checkSec': scheduleSyncTick(); break;
    case 'dataView': dataViewDefault = dataViewMode = settings.dataView; renderDataView(); break;
    case 'dataStaleFirst': case 'dataHideUnused': renderDataView(); break;
    case 'sidebar': setSidebar(sidebarStart()); break;
    case 'fontSize': applyZoom(); break;
    case 'color': applyColor(); break;
    case 'homeLayout': applyHomeLayout(); break;
    case 'filesArea': Object.keys(filesOpen).forEach(k => delete filesOpen[k]); renderToolStrips(); break;
    case 'itda': case 'itdaCategory': homeGrandAt = 0; homeGrandEvent = null; loadHomeGrandEvent(); renderHome(); pushSettingsToTools(); break;
    case 'itdaPush': renderHome(); break;
    case 'actingSeverity': case 'grandStats': case 'grandTime': pushSettingsToTools(); break;
    default: break; // startView·notifyStale·shortcuts·keymap은 쓰는 쪽이 설정 값을 그때그때 읽는다
  }
  settingListeners.forEach(fn => fn(key));
}

// ── 초기화 ─────────────────────────────────────────────────
(async function init() {
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  fileRoles = await window.rehab.folders.fileRoles();
  document.getElementById('updaterVersion').textContent = await window.rehab.updater.getVersion();
  document.getElementById('updaterRepoUrl').textContent = (await window.rehab.updater.getInfo()).repoUrl || '-';
  updaterMode = await window.rehab.updater.getMode();
  document.querySelectorAll('input[name=updMode]').forEach(r => { r.checked = r.value === updaterMode; });
  // 업데이트 직후 첫 실행이면 "v으로 업데이트되었습니다" 안내(이전 버전은 이 PC에 기억해 둔 값)
  try {
    const cur = await window.rehab.updater.getVersion(), prev = localStorage.getItem('rehab_last_version_v1');
    localStorage.setItem('rehab_last_version_v1', cur);
    if (prev && prev !== cur) { const st = { status: 'updated', version: cur, from: prev }; onUpdaterStatus(st); showUpdateToast(st); }
  } catch (e) { /* 기억 못 해도 동작에는 문제 없음 */ }
  applyZoom(); applyColor(); applyHomeLayout();
  { const memo = document.getElementById('wbMemo'); try { memo.value = localStorage.getItem('rehab_home_memo_v1') || ''; } catch (e) { /* 기억 못 해도 동작 */ } memo.addEventListener('input', () => { try { localStorage.setItem('rehab_home_memo_v1', memo.value); } catch (e) { /* 저장 실패해도 화면은 그대로 */ } }); }
  renderHome();
  loadHomeGrandEvent();
  // 시작 화면(설정): 홈 / 데이터 준비 / 마지막에 쓴 화면
  let startView = settings.startView;
  if (startView === 'last') { try { startView = localStorage.getItem(LASTVIEW_KEY); } catch (e) { startView = null; } }
  if (startView && startView !== 'home' && NAV_ORDER.includes(startView)) showView(startView);
  // 교차검증 화면을 아직 한 번도 안 열었어도, 화면 밖에서 미리 로드해둬야 "자동 불러오기"가
  // 그 도구까지 채워줄 수 있다(loadedTools에 들어있는 도구만 동기화 때 갱신 대상이 됨).
  ensureToolLoaded('cross');
  ensureToolLoaded('rm'); // 홈 카드에 환자 수가 바로 보이도록 화면 밖에서 미리 로드
  refreshBackup();
  // 시작할 때 파일 상태를 확인하고, 수동 모드가 아니면 곧바로 반영한다(등록된 폴더가 없으면 조용히 넘어감).
  try { await refreshScan(); } catch (e) { /* 아래 syncNow가 같은 오류를 상태줄에 보여준다 */ }
  if (syncMode !== 'manual' || !lastScan) await syncNow({ skipScan: !!lastScan });
  else renderAll();
})();
