'use strict';
// settings-ui.js — 설정 화면(탭·검색·한 줄 설정 행·단축키 편집·설정 옮기기). shell.js 다음에 불러와서 shell.js의 settings/setSetting 등을 그대로 쓴다.
const stq = (sel, root = document) => root.querySelector(sel);
const stAll = (sel, root = document) => [...root.querySelectorAll(sel)];
let stTab = 'data';

function stShowTab(tab) {
  stTab = tab;
  stAll('#stTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  stAll('.st-page').forEach(p => p.classList.toggle('on', p.dataset.page === tab));
  if (tab === 'save') stRenderExportDir();
  if (tab === 'itda') stRenderItdaStatus();
  if (tab === 'admin') stRenderBackupText();
  if (tab === 'about') stRenderDataDir();
}
stq('#stTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { stq('#stSearch').value = ''; stSearch(''); stShowTab(b.dataset.tab); } });

// 컨트롤 ↔ 설정 값
function stRefreshControls() {
  stAll('[data-set]').forEach(el => {
    const key = el.dataset.set, v = String(settings[key]);
    if (el.classList.contains('st-seg')) stAll('button', el).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    else if (el.type === 'checkbox') el.checked = !!settings[key];
    else if (document.activeElement !== el) el.value = v;
  });
}
const stPanel = stq('.st-panel');
stPanel.addEventListener('change', (e) => {
  const el = e.target.closest('[data-set]'); if (!el) return;
  setSetting(el.dataset.set, el.type === 'checkbox' ? el.checked : el.value);
  if (el.dataset.set === 'itdaCategory') el.value = settings.itdaCategory; // 빈 값이면 기본 이름으로 돌아옴
});
stPanel.addEventListener('click', (e) => {
  const sb = e.target.closest('.st-seg [data-v]');
  if (sb) { setSetting(sb.parentElement.dataset.set, sb.dataset.v); return; }
  const q = e.target.closest('.st-q'); if (q) q.closest('.st-row').classList.toggle('help');
});
stPanel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('st-q')) e.target.click(); });

// 검색: 모든 탭의 행을 한꺼번에 훑어서 맞는 것만 남긴다
function stSearch(q) {
  q = q.trim().toLowerCase();
  stq('#stWrap').classList.toggle('searching', !!q);
  let any = false;
  stAll('.st-page').forEach(page => {
    let pageHit = false;
    stAll('.st-row', page).forEach(row => { const hit = !q || (row.dataset.kw + ' ' + row.textContent).toLowerCase().includes(q); row.hidden = !hit; if (hit) pageHit = true; });
    stAll('.st-sec', page).forEach(sec => { // 소제목은 아래 행이 하나라도 보일 때만
      let n = sec.nextElementSibling, show = !q;
      while (n && !n.classList.contains('st-sec')) { if (!n.hidden) show = true; n = n.nextElementSibling; }
      sec.hidden = !show;
    });
    stq('.st-ph', page).hidden = !pageHit && !!q; page.style.display = q && !pageHit ? 'none' : '';
    if (pageHit) any = true;
  });
  stq('#stEmpty').hidden = !q || any;
  if (!q) stAll('.st-page').forEach(p => { p.style.display = ''; });
}
stq('#stSearch').addEventListener('input', (e) => stSearch(e.target.value));

// 단축키 목록·편집
let stRecId = null, stRecErr = '';
function stRenderKeys() {
  const items = keyItems(), box = stq('#keyList');
  const nameOf = (scope) => scope === 'global' ? '공통' : (stq(`.nav-item[data-nav=${scope}] .nl`)?.textContent.trim() || scope);
  const scopes = [...new Set(items.map(x => x.scope))];
  box.innerHTML = scopes.map(sc => `<div class="st-kgrp">${updEsc(nameOf(sc))}</div>` + items.filter(x => x.scope === sc).map(x => {
    const cur = effKeys(x), changed = !!settings.keymap[x.id], fixed = !x.run, rec = stRecId === x.id;
    const right = fixed ? '<span class="muted">고정</span>'
      : rec ? `<span class="err">${updEsc(stRecErr || '새 키를 누르세요 (Esc 취소)')}</span><button class="btn" data-key-cancel>취소</button>`
        : `<button class="btn" data-key-edit="${x.id}">변경</button>${changed ? `<button class="btn" data-key-reset="${x.id}" title="기본값 ${updEsc(keyLabel(x.keys))}로">되돌리기</button>` : ''}`;
    return `<div class="st-key${fixed ? ' fixed' : ''}${changed ? ' mod' : ''}${rec ? ' rec' : ''}"><span class="lb">${updEsc(x.label)}</span><kbd>${updEsc(rec ? '…' : keyLabel(cur))}</kbd>${right}</div>`;
  }).join('')).join('');
}
function stStopRec() { stRecId = null; stRecErr = ''; keyRecording = false; }
stq('#keyList').addEventListener('click', (e) => {
  const ed = e.target.closest('[data-key-edit]'), rs = e.target.closest('[data-key-reset]');
  if (ed) { stRecId = ed.dataset.keyEdit; stRecErr = ''; keyRecording = true; stRenderKeys(); }
  else if (rs) { const km = { ...settings.keymap }; delete km[rs.dataset.keyReset]; setSetting('keymap', km); }
  else if (e.target.closest('[data-key-cancel]')) { stStopRec(); stRenderKeys(); }
});
stq('#keyResetAll').addEventListener('click', () => { stStopRec(); setSetting('keymap', {}); });
document.addEventListener('keydown', (e) => {
  if (!stRecId) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { stStopRec(); stRenderKeys(); return; }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const k = RehabSettings.keysFromEvent(e);
  if (!k) { stRecErr = 'Ctrl(⌘)과 함께 눌러 주세요'; stRenderKeys(); return; }
  const items = keyItems(), c = RehabSettings.findConflict(items, stRecId, k, settings.keymap);
  if (c) { stRecErr = c.reserved ? '복사·붙여넣기 등 기본 키라 쓸 수 없어요' : `"${c.label}"에서 이미 쓰고 있어요`; stRenderKeys(); return; }
  const me = items.find(x => x.id === stRecId), km = { ...settings.keymap };
  if (k === RehabSettings.normKeys(me.keys)) delete km[stRecId]; else km[stRecId] = k;
  stStopRec(); setSetting('keymap', km);
}, true);

// 잇다 / 백업 / 정보 줄
async function stRenderItdaStatus() { let ok = false; try { ok = await window.rehab.itda.installed(); } catch (e) { /* 아래에서 없음으로 표시 */ } stq('#itdaStatus').textContent = ok ? '✔ 이 PC에서 잇다를 찾았어요' : '✕ 잇다를 찾지 못했어요(설치·실행 전이면 연동은 건너뜁니다)'; }
function stRenderBackupText() { const b = backupStatus; stq('#stBackupText').textContent = !b ? '확인 중…' : b.level === 'off' ? '백업 기록을 쓰지 않는 PC예요' : `${b.level === 'ok' ? '✔ ' : '⚠ '}${b.title || ''}`; }
async function stRenderDataDir() { try { stq('#stDataDir').textContent = await window.rehab.app.dataDir(); } catch (e) { /* 표시만 못 함 */ } }
stq('#stOpenDataDir').addEventListener('click', () => window.rehab.app.openDataDir());

// 규칙(코드·이름·병동 목록): 칸에 쉼표/줄바꿈으로 적고, 바꾸면 정리해서 저장한다(비어 있거나 잘못된 값은 기본값으로 돌아감).
const stRuleText = (k) => (settings.rules[k] || []).join(', ');
function stRefreshRules() { stAll('[data-rule]').forEach(el => { if (document.activeElement !== el) el.value = stRuleText(el.dataset.rule); }); }
stPanel.addEventListener('change', (e) => {
  const el = e.target.closest('[data-rule]'); if (!el) return;
  const k = el.dataset.rule, list = RehabSettings.cleanRuleList(k, el.value), empty = !list.length && k !== 'erdtTherapists';
  setSetting('rules', { ...settings.rules, [k]: empty ? RehabSettings.RULE_DEFAULTS[k] : list });
  el.value = stRuleText(k); stq('#stRuleMsg').textContent = empty ? '비어 있어서 기본 목록으로 되돌렸어요.' : '저장했어요. 바로 적용됩니다.';
});
stPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule-reset]'); if (!b) return;
  setSetting('rules', { ...settings.rules, [b.dataset.ruleReset]: [...RehabSettings.RULE_DEFAULTS[b.dataset.ruleReset]] }); stRefreshRules(); stq('#stRuleMsg').textContent = '기본 목록으로 되돌렸어요.';
});

// 파일 저장 위치(내보내기 파일이 저장되는 폴더)
async function stRenderExportDir(r) {
  try { const s = r || await window.rehab.exportFiles.getDir(); stq('#stExportDir').textContent = s.dir + (s.custom ? '' : '  (기본 · 다운로드 폴더)'); stq('#stExportReset').disabled = !s.custom; } catch (e) { /* 표시만 못 함 */ }
}
stq('#stExportChoose').addEventListener('click', async () => stRenderExportDir(await window.rehab.exportFiles.chooseDir()));
stq('#stExportReset').addEventListener('click', async () => stRenderExportDir(await window.rehab.exportFiles.resetDir()));
stq('#stExportOpen').addEventListener('click', () => window.rehab.exportFiles.openDir());

// 설정 옮기기 / 되돌리기
const stMsg = (t, bad) => { const el = stq('#stAdminMsg'); el.textContent = t; el.style.color = bad ? 'var(--red)' : ''; };
stq('#stExport').addEventListener('click', async () => {
  const text = RehabSettings.exportJson(settings, await window.rehab.folders.list(), await window.rehab.updater.getVersion());
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `rehab-hub-설정_${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  stMsg('설정 파일을 저장했어요. 다른 PC에서 "가져오기"로 불러오세요.');
});
stq('#stImport').addEventListener('click', () => stq('#stImportFile').click());
stq('#stImportFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = RehabSettings.parseImport(await f.text());
  if (!r.ok) { stMsg(r.error, true); return; }
  if (!confirm(`"${f.name}"의 설정으로 바꿀까요?\n지금 설정은 덮어써지고, 파일에 있는 폴더 중 이 PC에 있는 폴더가 추가돼요.`)) return;
  replaceSettings(r.settings);
  let added = 0; for (const fo of r.folders) { try { if (await window.rehab.folders.addPath(fo.dirPath, fo.label)) added++; } catch (err) { /* 이 PC에 없는 폴더는 건너뜀 */ } }
  stMsg(`설정을 가져왔어요 · 폴더 ${added}개 추가${r.folders.length - added ? `(${r.folders.length - added}개는 이 PC에 없거나 이미 등록됨)` : ''}`);
  logActivity('설정', `설정 파일 가져오기: ${f.name}`); renderSettingsView(); if (added) syncNow();
});
stq('#stReset').addEventListener('click', () => {
  if (!confirm('모든 설정을 기본값으로 되돌릴까요?\n(등록한 폴더 연결은 그대로 둡니다)')) return;
  stStopRec(); replaceSettings({}); stMsg('설정을 기본값으로 되돌렸어요.'); logActivity('설정', '기본값으로 되돌림');
});

settingListeners.push(() => { stRefreshControls(); stRefreshRules(); stRenderKeys(); });
window.__renderSettingsUi = () => { stRefreshControls(); stRefreshRules(); stRenderKeys(); stShowTab(stTab); stSearch(stq('#stSearch').value); };
