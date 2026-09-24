'use strict';
// shell.js — 사이드바 화면 전환 + 폴더 자동 연결 + 3개 도구(iframe) 자동 채움 + 홈 대시보드.
// window.rehab.* 는 preload.js가 노출한 메인프로세스 API(폴더 선택/스캔/파일 읽기)만 제공한다.

// 각 도구 화면의 실제 업로드 칸 selector. core/build_folder_connector.js(HTML판)와 동일한 매핑을 그대로 씀.
const TOOL_TARGETS = {
  rm: [
    { roles: ['card3', 'card10'], selector: '#fileInput' },
    { role: 'status', selector: '#grandOtFileInput' },
    { role: 'handover', selector: '#grandHandoverFileInput' },
    { role: 'pt10', selector: '#grandPt10FileInput' },
    { role: 'pt3', selector: '#grandPt3FileInput' },
  ],
  acting: [
    { role: 'acting', selector: '#fileInput' },
    { role: 'dailyStats', selector: '#dcFileInput' },
  ],
  cross: [
    { role: 'status', selector: 'input[data-key="statusBook"]' },
    { role: 'card10', selector: 'input[data-key="card10Book"]' },
    { role: 'card3', selector: 'input[data-key="card3Book"]' },
    { role: 'mat10', selector: 'input[data-key="mat10Book"]' },
    { role: 'table10', selector: 'input[data-key="table10Book"]' },
    { role: 'mt3', selector: 'input[data-key="mt3Book"]' },
    { role: 'handover', selector: 'input[data-key="handoverBook"]' },
  ],
};
const TOOL_PAGES = {
  rm: 'tools/그랜드라운딩_통합.html',
  acting: 'tools/치료_액팅_기록_오류_확인_프로그램_언어분류.html',
  cross: 'tools/작업치료_교차검증_도구_core내장.html',
};
const TOOL_LABELS = { rm: '그랜드라운딩', acting: '치료기록 QA', cross: '교차검증' };

let fileRoles = [];
let lastScan = null; // {matched, unmatched, errors, folders}
const fileCache = new Map(); // role -> File
const loadedTools = new Set();
const activityLog = [];

// ── 공용 유틸 ──────────────────────────────────────────────
function logActivity(feature, detail) {
  activityLog.unshift({ time: new Date(), feature, detail });
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
  const targets = TOOL_TARGETS[toolKey];
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
    if (n) logActivity(TOOL_LABELS[key], `${n}개 칸 자동 채움`);
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

// ── 사이드바 / 화면 전환 ───────────────────────────────────
function ensureToolLoaded(key) {
  if (!TOOL_PAGES[key]) return;
  const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
  if (!loadedTools.has(key)) {
    loadedTools.add(key);
    iframe.addEventListener('load', async () => {
      const n = await autoFillTool(key);
      logActivity(TOOL_LABELS[key], n ? `화면 열림 · ${n}개 칸 자동 채움` : '화면 열림');
      renderHome();
      await waitForSummaryThenRender(key); // 도구의 분석은 change 이벤트 이후 비동기로 끝나므로, 끝날 때까지 기다렸다가 다시 그림
    });
    iframe.src = TOOL_PAGES[key];
  }
}

function showView(key) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === key));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === key));
  ensureToolLoaded(key);
  if (key === 'home') renderHome();
  if (key === 'data') renderDataView();
  if (key === 'settings') renderSettingsView();
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
function fileChecklistHtml() {
  const matched = (lastScan && lastScan.matched) || {};
  return fileRoles.map(r => {
    // 인수인계는 그랜드라운딩·교차검증이 폴더의 파일 없이도 실시간 조회로 자동으로 가져온다 —
    // 폴더 스캔 결과("미발견")로 표시하면 항상 안 찾아진 것처럼 보여 혼란을 준다.
    if (r.key === 'handover') {
      return `<div class="file-row"><span class="name">${r.label} <span class="muted">(선택)</span></span><span class="ok">🌐 실시간 자동연동</span></div>`;
    }
    const m = matched[r.key];
    return `<div class="file-row"><span class="name">${r.label}${r.required ? '' : ' <span class="muted">(선택)</span>'}</span><span class="${m ? 'ok' : 'miss'}">${m ? '✓ ' + m.name : '미발견'}</span></div>`;
  }).join('');
}

function renderActivity() {
  const body = document.getElementById('activityBody');
  if (!body) return;
  body.innerHTML = activityLog.map(a =>
    `<tr><td>${a.time.toTimeString().slice(0, 5)}</td><td>${a.feature}</td><td>${a.detail}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">아직 작업 내역이 없습니다.</td></tr>';
}

// 세 도구 모두 top-level let으로 상태를 가지고 있어 iframe.contentWindow로 직접 못 읽는다(let/const는
// window 프로퍼티가 안 됨) — 그래서 각 도구에 __xxxSummary 훅을 한 줄씩 추가해 명시적으로 읽는다.
function readToolSummary(key) {
  if (!loadedTools.has(key)) return null;
  const iframe = document.querySelector(`iframe[data-tool="${key}"]`);
  try {
    const w = iframe.contentWindow;
    if (!w) return null;
    if (key === 'cross') return w.__crossSummary ? { count: w.__crossSummary.issueCount, label: '검증 결과' } : null;
    if (key === 'rm') return w.__rmSummary ? { count: w.__rmSummary.patientCount, label: '환자' } : null;
    if (key === 'acting') return w.__actingSummary ? { count: w.__actingSummary.errorCount, label: '오류' } : null;
  } catch (e) { return null; }
  return null;
}

// content가 있으면 "잇다로 보내기" 버튼을 같이 붙인다 — 자동으로 보내지 않고, 사용자가 누를 때만
// 잇다의 Inbox에 한 줄 들어간다(잇다 Inbox 철학과 동일: 자동 분류 없음, 단순 저장).
function alertRow(label, badgeText, badgeClass, content) {
  const btn = content ? `<button class="btn" style="padding:3px 8px;font-size:11px;margin-left:6px" data-itda-push="${content.replace(/"/g, '&quot;')}">잇다로 보내기</button>` : '';
  return `<div class="row"><span>${label}</span><span><span class="badge ${badgeClass}">${badgeText}</span>${btn}</span></div>`;
}

function wireItdaPushButtons() {
  document.querySelectorAll('[data-itda-push]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '보내는 중…';
      const r = await window.rehab.itda.pushInboxItem(btn.dataset.itdaPush);
      if (r.ok) { btn.textContent = '보냄 ✓'; logActivity('잇다 연동', '잇다 Inbox로 보냄'); }
      else { btn.textContent = '실패'; btn.disabled = false; logActivity('잇다 연동', r.message); }
    });
  });
}

function renderHome() {
  document.getElementById('homeFileList').innerHTML = fileChecklistHtml();

  const matched = (lastScan && lastScan.matched) || {};
  const required = fileRoles.filter(r => r.required);
  const requiredFound = required.filter(r => matched[r.key]).length;
  const pct = required.length ? Math.round((requiredFound / required.length) * 100) : 0;
  document.getElementById('homeDonut').textContent = lastScan ? `${pct}%` : '-';
  // 인수인계는 폴더 파일이 아니라 실시간 연동이라 "전체 파일" 분모/분자 어디에도 안 넣는다.
  const localFileRoles = fileRoles.filter(r => r.key !== 'handover');
  document.getElementById('homeChecklist').innerHTML = `
    <div class="row"><span>필수 파일</span><b>${requiredFound}/${required.length}</b></div>
    <div class="row"><span>전체 파일</span><b>${Object.keys(matched).length}/${localFileRoles.length}</b></div>`;

  const cross = readToolSummary('cross'), rm = readToolSummary('rm'), acting = readToolSummary('acting');
  const alerts = [];
  if (acting) alerts.push(alertRow('치료기록 오류', `${acting.count}건`, acting.count ? 'red' : 'green',
    acting.count ? `[치료기록 QA] 치료기록 오류 ${acting.count}건 발견 — 재활치료부 앱에서 확인` : null));
  if (cross) alerts.push(alertRow('교차검증 결과', `${cross.count}건`, cross.count ? 'orange' : 'green',
    cross.count ? `[교차검증] 불일치 ${cross.count}건 발견 — 재활치료부 앱에서 확인` : null));
  if (rm) alerts.push(alertRow('그랜드라운딩 데이터', `${rm.count}명 준비됨`, 'green',
    `[그랜드라운딩] 오늘 회진 대상 환자 ${rm.count}명 준비됨`));
  document.getElementById('homeAlerts').innerHTML = alerts.join('') || '<div class="muted">화면을 열면 요약이 표시됩니다.</div>';
  wireItdaPushButtons();

  document.getElementById('rmStat').innerHTML = `환자 데이터: <b>${rm ? rm.count + '명' : '-'}</b>`;
  document.getElementById('actingStat').innerHTML = `오늘의 오류: <b>${acting ? acting.count + '건' : '-'}</b>`;
  document.getElementById('crossStat').innerHTML = `검증 결과: <b>${cross ? cross.count + '건' : '-'}</b>`;

  renderActivity();
}

function renderDataView() {
  document.getElementById('dataFileList').innerHTML = fileChecklistHtml();
  document.getElementById('dataStatus').textContent = lastScan
    ? `마지막 확인: 폴더 ${lastScan.folders.length}개 · 미인식 파일 ${lastScan.unmatched.length}건`
    : '아직 불러오지 않았습니다.';
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
