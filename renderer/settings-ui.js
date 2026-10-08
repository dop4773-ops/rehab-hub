'use strict';
// settings-ui.js — 설정 화면(탭·검색·한 줄 설정 행·단축키 편집·설정 옮기기). shell.js 다음에 불러와서 shell.js의 settings/setSetting 등을 그대로 쓴다.
const stq = (sel, root = document) => root.querySelector(sel);
const stAll = (sel, root = document) => [...root.querySelectorAll(sel)];
let stTab = 'data';

function stShowTab(tab) {
  if (stTab === 'rules' && tab !== 'rules' && typeof rLock === 'function') rLock(); // 다른 탭으로 가면 다시 잠그고 저장 안 한 고침은 버린다
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
    if (page.dataset.page === 'rules' && !settings.rulesTab) { page.style.display = 'none'; return; } // 숨긴 규칙 탭은 검색에도 안 나온다
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
  if (!k) { stRecErr = 'Ctrl(⌘)과 함께(또는 F1~F12) 눌러 주세요'; stRenderKeys(); return; }
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

// ───────── 규칙(코드·이름·병동 목록) — 안전장치 ─────────
// 평소엔 잠겨 있고(읽기만), 잠금을 풀어 고친 뒤 "변경 내용 확인"에서 바뀐 곳을 보고 저장한다. 저장할 때마다 이전 값이 이력(최대 10개)에 남아 되돌릴 수 있고,
// 원래 규칙(기본값)으로 한 번에 돌아가거나 번호 칸 1·2·3에 저장해 두고 불러올 수 있다. 잠금 비밀번호는 선택이며 "실수 방지용"이다.
const RULE_KEYS = Object.keys(RehabSettings.RULE_DEFAULTS), RULE_RELOCK_MS = 10 * 60 * 1000;
let ruleUnlocked = false, ruleDraft = null, ruleRelockTimer = null;
const rText = (v) => (v || []).join(', ');
const rName = (k) => RehabSettings.RULE_LABELS[k];
const rWhen = (t) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const rSummary = (diff) => (diff.length ? diff.map(d => d.label).join(' · ') : '기본값과 같음');
const rDiffFromDefault = (rules) => RehabSettings.rulesDiff(RehabSettings.RULE_DEFAULTS, rules);
const rDirty = () => ruleDraft && RehabSettings.rulesDiff(settings.rules, ruleDraft).length > 0;
function rMsg(t, bad) { const el = stq('#stRuleMsg'); el.textContent = t || ''; el.style.color = bad ? 'var(--red)' : ''; }
function rLock() { ruleUnlocked = false; ruleDraft = null; clearTimeout(ruleRelockTimer); stq('#stRuleAsk').innerHTML = ''; stRenderRules(); }
function rTouch() { clearTimeout(ruleRelockTimer); if (ruleUnlocked) ruleRelockTimer = setTimeout(rLock, RULE_RELOCK_MS); } // 10분 동안 아무것도 안 하면 다시 잠근다
// 안내·확인 칸(창을 띄우지 않고 이 탭 안에서 묻는다)
function rAsk(html, actions) {
  const box = stq('#stRuleAsk'); box.innerHTML = `<div class="st-rask">${html}<div class="st-rbtns">${actions.map((a, i) => `<button class="btn${a.primary ? ' primary' : ''}" data-rask="${i}">${a.label}</button>`).join('')}</div></div>`;
  box.onclick = (e) => { const b = e.target.closest('[data-rask]'); if (!b) return; const a = actions[+b.dataset.rask]; if (a.run && a.run() === false) return; box.innerHTML = ''; stRenderRules(); }; // run이 false를 돌려주면(예: 비밀번호 틀림) 묻는 칸을 그대로 둔다
  const first = box.querySelector('input'); if (first) { first.focus(); first.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-rask="0"]').click(); }); }
}
const rDiffHtml = (diff) => diff.map(d => `<div class="st-rdiff"><b>${esc2(d.label)}</b> ${d.key.startsWith('round') ? `<span>${esc2(rText(d.from))} → <b>${esc2(rText(d.to))}</b></span>` : `${d.added.length ? `<span class="add">＋ ${esc2(d.added.join(', '))}</span>` : ''}${d.removed.length ? `<span class="del">－ ${esc2(d.removed.join(', '))}</span>` : ''}`}</div>`).join('');
const esc2 = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 바뀌면 검사 결과가 달라질 수 있는 곳을 미리 알려 준다
function rWarnings(from, to) {
  const w = [], f = RehabSettings.normRules(from), t = RehabSettings.normRules(to);
  for (const k of ['otCodes', 'stCodes', 'fixed15Codes']) { const gone = f[k].filter(x => !t[k].includes(x)); if (gone.length) w.push(`${rName(k)} ${gone.length}개를 뺐어요 — 그 오더의 분류·시간 기준이 달라질 수 있어요.`); }
  if (f.erdtTherapists.length && !t.erdtTherapists.length) w.push('ERDT "E" 담당 치료사를 모두 비웠어요 — 시간표의 E 표시가 전부 경고·집계 제외로 처리돼요.');
  if (JSON.stringify(f.round1Wards) !== JSON.stringify(t.round1Wards) || JSON.stringify(f.round2Wards) !== JSON.stringify(t.round2Wards)) w.push('회차별 병동이 바뀌면 그랜드라운딩 회차·병동 선택과 잇다 일정의 회차 판단이 달라져요.');
  return w;
}
// 새 규칙을 적용한다: 지금 값을 이력에 남기고(최대 10개) 저장
function rCommit(next, why) {
  const cur = settings.rules, nextN = RehabSettings.normRules(next);
  if (!RehabSettings.rulesDiff(cur, nextN).length) { rMsg('바뀐 곳이 없어요.'); return; }
  setSetting('rulesHistory', [{ t: Date.now(), rules: JSON.parse(JSON.stringify(cur)) }, ...settings.rulesHistory].slice(0, 10));
  setSetting('rules', nextN); ruleDraft = JSON.parse(JSON.stringify(nextN)); rMsg(`${why} 바로 적용됩니다. 이전 값은 「이전 값으로 되돌리기」에 남아 있어요.`);
}
function stRenderRules() {
  const bar = stq('#stRuleBar'), tools = stq('#stRuleTools'), save = stq('#stRuleSave'); if (!bar) return;
  const dd = rDiffFromDefault(settings.rules), draft = ruleDraft || settings.rules, dirty = rDirty();
  bar.innerHTML = `<span class="st-rstate ${ruleUnlocked ? 'open' : ''}">${ruleUnlocked ? '🔓 편집 중' : '🔒 잠겨 있음'}</span><span class="st-rsum ${dd.length ? 'chg' : ''}">${dd.length ? `원래 규칙에서 바뀐 항목 ${dd.length}개 — ${esc2(rSummary(dd))}` : '원래 규칙 그대로예요'}</span><button class="btn${ruleUnlocked ? '' : ' primary'}" data-rlock>${ruleUnlocked ? '🔒 다시 잠그기' : '🔓 편집 잠금 해제'}</button>`;
  stAll('[data-rule]').forEach(el => { el.readOnly = !ruleUnlocked; if (document.activeElement !== el) el.value = rText(draft[el.dataset.rule]); el.classList.toggle('changed', ruleUnlocked && RehabSettings.rulesDiff(settings.rules, draft).some(d => d.key === el.dataset.rule)); });
  stAll('[data-rule-default]').forEach(b => { b.disabled = !ruleUnlocked; });
  save.hidden = !ruleUnlocked || !dirty; stq('#stRuleDirty').textContent = dirty ? `고친 곳 ${RehabSettings.rulesDiff(settings.rules, draft).length}개 · 아직 저장 전이라 적용되지 않았어요` : '';
  if (!ruleUnlocked) { tools.innerHTML = '<div class="st-rtools muted">잠겨 있어서 읽기만 할 수 있어요. 바꾸려면 「편집 잠금 해제」를 누르세요.</div>'; return; }
  const slot = (n) => { const x = settings.rulesSlots[n]; return `<div class="st-rslot"><b>${n}</b><span>${x ? `${rWhen(x.t)} · ${esc2(rSummary(rDiffFromDefault(x.rules)))}` : '비어 있음'}</span><button class="btn" data-rslot-save="${n}">여기에 저장</button><button class="btn" data-rslot-load="${n}"${x ? '' : ' disabled'}>불러오기</button></div>`; };
  tools.innerHTML = `<div class="st-rtools"><div class="st-rtitle">안전장치</div>`
    + `<div class="st-rrow"><button class="btn" data-rhist${settings.rulesHistory.length ? '' : ' disabled'}>↩ 이전 값으로 되돌리기${settings.rulesHistory.length ? ` (${settings.rulesHistory.length})` : ''}</button><button class="btn" data-rdefault${dd.length ? '' : ' disabled'}>🏠 원래 규칙으로 전체 되돌리기</button><button class="btn" data-rpin>🔑 잠금 비밀번호 ${settings.rulesPin ? '바꾸기·해제' : '설정(선택)'}</button></div>`
    + `<div class="st-rtitle">번호 칸에 저장해 두기 <small>지금 적용 중인 규칙을 1·2·3번에 저장했다가 필요할 때 불러와요</small></div>${slot(1)}${slot(2)}${slot(3)}</div>`;
}
function rUnlock() {
  const go = () => { ruleUnlocked = true; ruleDraft = JSON.parse(JSON.stringify(settings.rules)); rTouch(); rMsg(''); };
  if (settings.rulesPin) { rAsk('잠금 비밀번호를 입력하세요 <input type="password" class="st-pin" maxlength="12" autocomplete="off">', [{ label: '확인', primary: true, run: () => { if (RehabSettings.pinHash(stq('#stRuleAsk .st-pin').value) === settings.rulesPin) { go(); return; } rMsg('비밀번호가 맞지 않아요.', true); stq('#stRuleAsk .st-pin').select(); return false; } }, { label: '취소', run: () => rMsg('') }]); return; }
  rAsk('<b>규칙을 바꾸면 오류 검사 결과가 달라질 수 있어요.</b><br>저장하기 전에는 아무것도 적용되지 않고, 저장한 뒤에도 이전 값·원래 규칙·번호 칸으로 돌릴 수 있어요. 잠금을 풀까요?', [{ label: '잠금 풀기', primary: true, run: go }, { label: '취소' }]);
}
function rReview() {
  const diff = RehabSettings.rulesDiff(settings.rules, ruleDraft); if (!diff.length) { rMsg('바뀐 곳이 없어요.'); return; }
  const warn = rWarnings(settings.rules, ruleDraft);
  rAsk(`<b>이렇게 바뀌어요 (${diff.length}개 항목)</b>${rDiffHtml(diff)}${warn.length ? `<div class="st-rwarn">${warn.map(esc2).join('<br>')}</div>` : ''}`, [{ label: '저장하고 적용', primary: true, run: () => rCommit(ruleDraft, '저장했어요.') }, { label: '계속 고치기' }]);
}
stq('#stRuleBar').addEventListener('click', (e) => { if (!e.target.closest('[data-rlock]')) return; if (ruleUnlocked) rLock(); else rUnlock(); });
stPanel.addEventListener('input', (e) => { const el = e.target.closest('[data-rule]'); if (!el || !ruleUnlocked) return; ruleDraft[el.dataset.rule] = RehabSettings.cleanRuleList(el.dataset.rule, el.value); rTouch(); const sv = stq('#stRuleSave'), n = RehabSettings.rulesDiff(settings.rules, ruleDraft).length; sv.hidden = !n; stq('#stRuleDirty').textContent = n ? `고친 곳 ${n}개 · 아직 저장 전이라 적용되지 않았어요` : ''; });
stPanel.addEventListener('change', (e) => { const el = e.target.closest('[data-rule]'); if (!el || !ruleUnlocked) return; const k = el.dataset.rule; if (!ruleDraft[k].length && k !== 'erdtTherapists') { ruleDraft[k] = [...RehabSettings.RULE_DEFAULTS[k]]; rMsg('비어 있어서 원래 목록으로 되돌렸어요.'); } el.value = rText(ruleDraft[k]); stRenderRules(); });
stPanel.addEventListener('click', (e) => {
  const t = e.target; if (!t.closest('#stRuleTools, #stRuleSave, [data-rule-default]')) return; rTouch();
  const d = t.closest('[data-rule-default]'); if (d) { ruleDraft[d.dataset.ruleDefault] = [...RehabSettings.RULE_DEFAULTS[d.dataset.ruleDefault]]; stRenderRules(); return; }
  if (t.closest('#stRuleReview')) { rReview(); return; }
  if (t.closest('#stRuleDiscard')) { ruleDraft = JSON.parse(JSON.stringify(settings.rules)); rMsg('고친 것을 취소했어요.'); stRenderRules(); return; }
  if (t.closest('[data-rdefault]')) { rAsk(`<b>원래 규칙으로 전체를 되돌릴까요?</b>${rDiffHtml(RehabSettings.rulesDiff(settings.rules, RehabSettings.RULE_DEFAULTS))}<div class="muted">지금 값은 이력에 남아서 「이전 값으로 되돌리기」로 다시 가져올 수 있어요.</div>`, [{ label: '원래 규칙으로', primary: true, run: () => rCommit(RehabSettings.RULE_DEFAULTS, '원래 규칙으로 되돌렸어요.') }, { label: '취소' }]); return; }
  if (t.closest('[data-rhist]')) { rAsk(`<b>이전 값으로 되돌리기</b><div class="st-rhist">${settings.rulesHistory.map((h, i) => { const df = RehabSettings.rulesDiff(settings.rules, h.rules); return `<div class="st-rslot"><b>${rWhen(h.t)}</b><span>${df.length ? `지금과 다른 곳: ${esc2(rSummary(df))}` : '지금과 같음'}</span><button class="btn" data-rask-h="${i}"${df.length ? '' : ' disabled'}>이 값으로</button></div>`; }).join('')}</div>`, [{ label: '닫기' }]);
    stq('#stRuleAsk').addEventListener('click', (ev) => { const b = ev.target.closest('[data-rask-h]'); if (!b) return; const h = settings.rulesHistory[+b.dataset.raskH]; const df = RehabSettings.rulesDiff(settings.rules, h.rules); rAsk(`<b>${rWhen(h.t)}에 적용되던 규칙으로 되돌릴까요?</b>${rDiffHtml(df)}`, [{ label: '되돌리기', primary: true, run: () => rCommit(h.rules, '이전 값으로 되돌렸어요.') }, { label: '취소' }]); }); return; }
  const ss = t.closest('[data-rslot-save]'); if (ss) { const n = ss.dataset.rslotSave, go = () => { setSetting('rulesSlots', { ...settings.rulesSlots, [n]: { t: Date.now(), rules: JSON.parse(JSON.stringify(settings.rules)) } }); rMsg(`지금 적용 중인 규칙을 ${n}번 칸에 저장했어요.`); }; if (settings.rulesSlots[n]) rAsk(`<b>${n}번 칸에 이미 저장된 내용이 있어요.</b> 지금 규칙으로 바꿔 저장할까요?`, [{ label: '바꿔 저장', primary: true, run: go }, { label: '취소' }]); else { go(); stRenderRules(); } return; }
  const sl = t.closest('[data-rslot-load]'); if (sl) { const n = sl.dataset.rslotLoad, x = settings.rulesSlots[n], df = RehabSettings.rulesDiff(settings.rules, x.rules); if (!df.length) { rMsg(`${n}번 칸은 지금 규칙과 같아요.`); return; } rAsk(`<b>${n}번 칸(${rWhen(x.t)})을 불러올까요?</b>${rDiffHtml(df)}`, [{ label: '불러와서 적용', primary: true, run: () => rCommit(x.rules, `${n}번 칸을 불러왔어요.`) }, { label: '취소' }]); return; }
  if (t.closest('[data-rpin]')) {
    rAsk('<b>잠금 비밀번호</b> <small>(선택 · 실수로 바꾸는 걸 막는 용도예요. 잊으면 설정 초기화로 풀 수 있어요)</small><br>새 비밀번호 <input type="password" class="st-pin" maxlength="12" autocomplete="off" placeholder="비우면 해제">', [{ label: '저장', primary: true, run: () => { const v = stq('#stRuleAsk .st-pin').value; setSetting('rulesPin', v ? RehabSettings.pinHash(v) : ''); rMsg(v ? '잠금 비밀번호를 저장했어요.' : '잠금 비밀번호를 해제했어요.'); } }, { label: '취소' }]);
  }
});
function stRefreshRules() {
  const on = settings.rulesTab, btn = stq('#stTabs [data-tab=rules]'); if (btn) btn.hidden = !on; // 규칙 탭은 설정 › 관리·백업 › 고급에서 켠 사람만 본다
  if (!on && stTab === 'rules') stShowTab('data');
  stRenderRules();
}

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
