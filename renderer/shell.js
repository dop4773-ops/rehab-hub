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
      { role: 'dailySchedule', selector: '#msFileInput' }, // 작업치료실 시간표(평일) — 화면에서 다시 올리지 않게 연결
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
    ],
    readSummary: (w) => w.__crossSummary ? { count: w.__crossSummary.issueCount, label: '검증 결과', ...w.__crossSummary } : null,
    // 이 필수 역할이 폴더 스캔으로 전부 채워지면(=화면을 열지 않아도) 자동으로 전체 교차검증을 한 번 실행한다.
    requiredRoles: ['status', 'card10', 'card3', 'mat10', 'table10', 'mt3'],
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
const SYNC_MODE_KEY = 'rehab_sync_mode';
const SYNC_CHECK_MS = 30 * 1000; // 파일 목록·수정시각만 보는 가벼운 확인 주기
const SYNC_RETRY_MAX = 3; // 읽기에 실패한 파일은 몇 초 뒤 자동으로 다시 시도(클라우드 폴더는 첫 읽기가 일시적으로 실패하기도 함)
let syncRetries = 0;
let syncMode = 'launch';
try { const saved = localStorage.getItem(SYNC_MODE_KEY); if (RehabSync.isValidMode(saved)) syncMode = saved; } catch (e) { /* 저장소를 못 써도 기본값으로 동작 */ }

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
    files.push(new File([bytes], m.name));
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
  const sig = RehabSync.rolesSig(lastScan, t.requiredRoles);
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
  else renderAll();
}
setInterval(syncTick, SYNC_CHECK_MS);

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

function fileChecklistHtml() {
  return fileRoles.map(r => {
    // 인수인계는 그랜드라운딩·교차검증이 폴더의 파일 없이도 실시간 조회로 자동으로 가져온다 —
    // 폴더 스캔 결과("미발견")로 표시하면 항상 안 찾아진 것처럼 보여 혼란을 준다.
    if (r.key === 'handover') {
      return `<div class="file-card"><span class="ico">🌐</span><div class="info"><div class="n">${r.label}</div><div class="m">실시간 자동연동</div></div><span class="st ok">정상</span></div>`;
    }
    const i = roleInfo(r.key);
    const times = i.entries.length
      ? `${i.entries.length > 1 ? i.entries.length + '개 파일 · ' : ''}수정 ${fmtTime(i.modified)}${i.reflectedAt ? ' · 반영 ' + fmtTime(i.reflectedAt) : ''}`
      : (lastScan ? '아직 못 찾음' : '확인 중…');
    return `<div class="file-card"><span class="ico">📊</span><div class="info"><div class="n">${r.label}${r.required ? '' : ' <span class="muted">(선택)</span>'}</div><div class="m" title="${i.error}">${times}</div></div><span class="st ${STATE_CLASS[i.state]}">${RehabSync.STATE_LABEL[i.state]}</span></div>`;
  }).join('');
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
  if (refreshNote) refreshNote.textContent = lastScan ? `${lastSyncAt ? '마지막 동기화 ' + fmtTime(lastSyncAt, true) + ' · ' : ''}폴더 ${lastScan.folders.length}개 · ${Object.keys(matched).length}/${localFileRoles.length}개 파일 인식` : '아직 자동 불러오기를 하지 않았습니다.';

  renderSysInfo(matched, localFileRoles);
  renderActivity();
  renderSyncPill();
  renderToolStrips();
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

// 데이터 준비 화면: 역할별로 파일 수정 시각 / 프로그램 반영 시각 / 상태를 따로 보여준다.
function renderDataView() {
  const box = document.getElementById('dataFileList');
  const banner = document.getElementById('dataBanner');
  if (!box) return;
  const rows = fileRoles.map(r => {
    if (r.key === 'handover') {
      return `<tr><td>${r.label}</td><td class="fname">실시간 연동(파일 없음)</td><td>-</td><td>-</td><td><span class="st ok">✓ 최신</span></td><td></td></tr>`;
    }
    const i = roleInfo(r.key);
    const names = i.entries.length ? i.entries.map(e => `${e.name}${e.manual ? ' <span class="muted">(직접 선택)</span>' : ''}`).join('<br>') : '<span class="muted">못 찾음</span>';
    const manual = (lastScan && lastScan.manualRoles || []).includes(r.key);
    const actions = `<button class="btn" data-manual-pick="${r.key}">직접 선택</button>${manual ? `<button class="btn" data-manual-clear="${r.key}">해제</button>` : ''}`;
    return `<tr><td>${r.label}${r.required ? '' : ' <span class="muted">(선택)</span>'}</td><td class="fname">${names}</td>`
      + `<td class="nowrap">${i.modified ? fmtTime(i.modified) : '-'}</td><td class="nowrap">${i.reflectedAt ? fmtTime(i.reflectedAt) : '-'}</td>`
      + `<td><span class="st ${STATE_CLASS[i.state]}" title="${i.error}">${RehabSync.STATE_LABEL[i.state]}</span>${i.error ? `<div class="muted">${i.error}</div>` : ''}</td><td class="nowrap">${actions}</td></tr>`;
  }).join('');
  box.innerHTML = `<table class="data-table"><thead><tr><th>종류</th><th>파일</th><th>파일 수정</th><th>프로그램 반영</th><th>상태</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;

  // "파일은 바뀌었는데 아직 프로그램에 반영되지 않은" 경우를 단순히 '최신'으로 두지 않고 따로 알린다.
  const stale = lastScan ? fileRoles.filter(r => r.key !== 'handover' && roleStateOf(r.key) === 'stale') : [];
  if (stale.length) {
    const min = RehabSync.MODE_MINUTES[syncMode];
    banner.innerHTML = `<div class="sync-banner"><b>⚠ 새로운 데이터 발견</b>`
      + stale.map(r => { const i = roleInfo(r.key); return `<div class="row"><span>${r.label} — 파일 수정 ${fmtTime(i.modified)} · 마지막 반영 ${i.reflectedAt ? fmtTime(i.reflectedAt) : '없음'}</span></div>`; }).join('')
      + `<div class="hint">${min ? `자동 동기화(${min}분 주기)가 켜져 있어 곧 반영됩니다. ` : ''}<button class="btn primary" data-sync-now>지금 업데이트</button></div></div>`;
  } else banner.innerHTML = '';

  document.getElementById('dataStatus').textContent = lastScan
    ? `${lastSyncAt ? '마지막 동기화 ' + fmtTime(lastSyncAt, true) + ' · ' : ''}폴더 ${lastScan.folders.length}개 · 미인식 파일 ${lastScan.unmatched.length}건`
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

// 각 도구 화면 위의 데이터 상태 띠 — 지금 화면의 검증/출력이 어떤 데이터 기준인지 바로 보이게 한다.
function renderToolStrips() {
  for (const key of Object.keys(TOOLS)) {
    const el = document.querySelector(`[data-tool-status="${key}"]`);
    if (!el) continue;
    const roles = toolRoles(key);
    const o = syncOverview(roles);
    const need = o.cls === 'stale' || o.cls === 'err';
    el.className = `tool-status ${o.cls}`;
    el.innerHTML = `<span><b>${o.cls === 'ok' ? '● 데이터 최신' : o.text}</b></span>`
      + `<span>${lastSyncAt ? '마지막 동기화 ' + fmtTime(lastSyncAt, true) : '아직 동기화 전'}</span>`
      + (need ? '<button class="btn primary" data-sync-now>데이터 업데이트</button>' : '');
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
document.getElementById('homeScanBtn').addEventListener('click', () => syncNow());
document.getElementById('dataScanBtn').addEventListener('click', () => syncNow({ statusEl: document.getElementById('dataStatus') }));
document.getElementById('homeRefreshBtn').addEventListener('click', () => syncNow());
// "지금 업데이트"/"데이터 업데이트" 버튼은 화면을 다시 그릴 때마다 새로 생기므로 위임으로 한 번만 연결한다.
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-sync-now]')) { syncNow(); return; }
  const pick = e.target.closest('[data-manual-pick]');
  if (pick) {
    const r = await window.rehab.folders.chooseFile(pick.dataset.manualPick);
    if (r) { logActivity('데이터 준비', `직접 선택: ${roleDef(r.role).label}`); syncNow(); }
    return;
  }
  const clear = e.target.closest('[data-manual-clear]');
  if (clear) { await window.rehab.folders.clearManual(clear.dataset.manualClear); logActivity('데이터 준비', `직접 선택 해제: ${roleDef(clear.dataset.manualClear).label}`); syncNow(); }
});
document.getElementById('syncPill').addEventListener('click', () => {
  const o = syncOverview(scanRoles());
  if (o.cls === 'stale' || o.cls === 'err') syncNow(); else showView('data');
});
document.querySelectorAll('input[name="syncMode"]').forEach(radio => {
  radio.checked = radio.value === syncMode;
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    syncMode = radio.value;
    try { localStorage.setItem(SYNC_MODE_KEY, syncMode); } catch (e) { /* 저장 실패해도 이번 실행엔 적용됨 */ }
    logActivity('설정', `데이터 동기화: ${radio.parentElement.textContent.trim()}`);
    renderAll();
  });
});
document.getElementById('topbarSettingsBtn').addEventListener('click', () => showView('settings'));

// ── 업데이트(GitHub Releases) ─────────────────────────────
let updaterMode = 'manual';
function updaterStatusText(s) {
  switch (s.status) {
    case 'dev-mode': return s.message;
    case 'checking': return '업데이트 확인 중…';
    case 'available': return `새 버전 ${s.version} 다운로드 중…`;
    case 'not-available': return '최신 버전을 사용 중입니다.';
    case 'downloading': return `다운로드 중… ${s.percent ?? 0}%`;
    case 'downloaded': return updaterMode === 'auto'
      ? `새 버전 ${s.version} 다운로드 완료 — 곧 자동으로 재시작해 설치합니다.`
      : `새 버전 ${s.version} 설치 준비 완료 — "지금 재시작하고 설치"를 눌러주세요.`;
    case 'error': return `업데이트 확인 실패: ${s.message}`;
    default: return '';
  }
}
window.rehab.updater.onStatus(s => {
  document.getElementById('updaterStatus').textContent = updaterStatusText(s);
  // 자동 모드에서는 어차피 알아서 재시작되므로 수동 설치 버튼을 보여줄 필요가 없다.
  document.getElementById('updaterInstallBtn').style.display = (s.status === 'downloaded' && updaterMode !== 'auto') ? 'inline-block' : 'none';
});
document.getElementById('updaterCheckBtn').addEventListener('click', async () => {
  document.getElementById('updaterStatus').textContent = '확인 중…';
  const r = await window.rehab.updater.checkNow();
  if (r.status === 'dev-mode' || r.status === 'error') document.getElementById('updaterStatus').textContent = r.message || updaterStatusText(r);
});
document.getElementById('updaterInstallBtn').addEventListener('click', () => window.rehab.updater.quitAndInstall());
document.getElementById('updaterAutoToggle').addEventListener('change', async (e) => {
  updaterMode = await window.rehab.updater.setMode(e.target.checked ? 'auto' : 'manual');
});

// ── 초기화 ─────────────────────────────────────────────────
(async function init() {
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  fileRoles = await window.rehab.folders.fileRoles();
  document.getElementById('updaterVersion').textContent = await window.rehab.updater.getVersion();
  updaterMode = await window.rehab.updater.getMode();
  document.getElementById('updaterAutoToggle').checked = updaterMode === 'auto';
  renderHome();
  // 교차검증 화면을 아직 한 번도 안 열었어도, 화면 밖에서 미리 로드해둬야 "자동 불러오기"가
  // 그 도구까지 채워줄 수 있다(loadedTools에 들어있는 도구만 동기화 때 갱신 대상이 됨).
  ensureToolLoaded('cross');
  // 시작할 때 파일 상태를 확인하고, 수동 모드가 아니면 곧바로 반영한다(등록된 폴더가 없으면 조용히 넘어감).
  try { await refreshScan(); } catch (e) { /* 아래 syncNow가 같은 오류를 상태줄에 보여준다 */ }
  if (syncMode !== 'manual' || !lastScan) await syncNow({ skipScan: !!lastScan });
  else renderAll();
})();
