'use strict';
// patient-search.js — Ctrl+K 환자 빠른 검색. 이름(또는 병실 번호) 몇 글자만 치면 그 환자의 시간표 정보·인수인계·교차검증 이슈·치료기록 QA 결과를 한곳에서 보여 주고,
// 버튼으로 해당 화면에서 그 환자만 걸러 열어 준다. 읽기만 한다(각 도구 화면이 알려 주는 값을 모아서 보여줄 뿐 계산하거나 저장하지 않는다). shell.js 다음에 불러온다.
(function () {
  const RECENT_KEY = 'rehab_recent_patients_v1';
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  const esc = (s) => updEsc(String(s == null ? '' : s));
  const toolFn = (key, fn) => { try { const w = document.querySelector(`iframe[data-tool="${key}"]`)?.contentWindow; return w && typeof w[fn] === 'function' ? w[fn] : null; } catch (e) { return null; } };
  const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } };
  const keepOn = () => settings.psRecent !== false;
  const clearRecents = () => { try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* 지우지 못해도 동작에는 문제 없음 */ } };
  const remember = (name) => { if (!keepOn()) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...recents().filter(n => n !== name)].slice(0, 8))); } catch (e) { /* 기억 못 해도 동작에는 문제 없음 */ } };
  const handoverRecords = () => { try { return (JSON.parse(localStorage.getItem('rehab_handover_cache_v1')) || {}).records || []; } catch (e) { return []; } };

  // 검색 대상: 전체시간표의 환자(입원·외래) + 인수인계에만 있는 이름. 이름이 같은 다른 사람은 병실로 구분되게 각각 따로 둔다.
  function candidates() {
    const list = (toolFn('rm', '__patientApi') || (() => []))();
    const seen = new Set(list.map(p => norm(p.name)));
    for (const r of handoverRecords()) { const k = norm(r.name); if (k && !seen.has(k)) { seen.add(k); list.push({ name: r.name, room: '', floor: '', category: '인수인계에만 있음', rm: r.doctor || '', kinds: [] }); } }
    return list;
  }
  function search(q) {
    const n = norm(q); if (!n) return [];
    const digits = /^\d{2,}$/.test(n);
    const scored = [];
    for (const p of candidates()) {
      const nm = norm(p.name); let s = -1;
      if (nm === n) s = 0; else if (nm.startsWith(n)) s = 1; else if (nm.includes(n)) s = 2; else if (digits && String(p.room || '').includes(n)) s = 3;
      if (s >= 0) scored.push([s, p]);
    }
    return scored.sort((a, b) => a[0] - b[0] || String(a[1].name).localeCompare(String(b[1].name), 'ko')).map(x => x[1]).slice(0, 8);
  }
  // 한 환자의 요약 — 각 도구가 이미 가진 결과에서 이름이 같은 항목만 뽑는다
  function detail(p) {
    const k = norm(p.name);
    const ho = handoverRecords().filter(r => norm(r.name) === k).sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')));
    const cross = ((toolFn('cross', '__issuesApi') || (() => []))()).filter(i => norm(i.patient) === k);
    const qaApi = toolFn('acting', '__qaApi');
    const qa = qaApi ? { errors: qaApi.errors().filter(x => norm(x.patientName) === k), missing: qaApi.missing().filter(x => norm(x.name) === k) } : null;
    return { ho, cross, qa };
  }

  let ov = null, results = [], sel = 0, input = null;
  const isOpen = () => !!ov;
  // F2: 어디를 눌러 놓았든 검색창으로 돌아가 바로 글을 쓸 수 있게(쓰던 글은 선택되어 덮어써진다)
  const onF2 = (e) => { if (e.key === 'F2' && input) { e.preventDefault(); closeBig(); input.focus(); input.select(); } };
  function close() { closeBig(); document.removeEventListener('keydown', onF2, true); if (!ov) { window.__psOpen = false; return; } ov.remove(); ov = null; window.__psOpen = false; }
  // 화면이 아직 처음 열리는 중일 수 있어서(도구는 처음 열 때 불러옴) 필요한 칸이 생길 때까지 잠깐 기다렸다가 실행한다
  const whenReady = (key, probe, fn) => { let n = 0; const t = setInterval(() => { const d = viewDoc(key); if (d && probe(d)) { clearInterval(t); fn(d); } else if (++n > 30) clearInterval(t); }, 150); };
  const setSearch = (d, id, v) => { const el = d.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  function go(action, p) {
    remember(p.name); close();
    if (action === 'cross') { showView('cross'); whenReady('cross', d => d.getElementById('searchInput'), d => setSearch(d, 'searchInput', p.name)); }
    else if (action === 'handover') { showView('handover'); whenReady('handover', d => d.getElementById('searchName'), d => setSearch(d, 'searchName', p.name)); }
    else if (action === 'qaerr' || action === 'qamiss') {
      showView('acting');
      whenReady('acting', d => d.getElementById('searchInput') && d.getElementById('msSearchBox'), d => {
        d.querySelector(`#viewTabs [data-view-tab="${action === 'qaerr' ? 'error' : 'missing'}"]`)?.click();
        if (action === 'qaerr') setSearch(d, 'searchInput', p.name); else { d.querySelector('.ms-view-tab[data-ms-view="list"]')?.click(); setSearch(d, 'msSearchBox', p.name); }
      });
    } else { // 그랜드라운딩: 그 환자의 RM으로 맞추고 표에서 그 행으로 이동
      showView('rm');
      whenReady('rm', d => d.getElementById('grandRmSelect'), d => {
        const rmSel = d.getElementById('grandRmSelect');
        if (p.rm && [...rmSel.options].some(o => o.value === p.rm) && rmSel.value !== p.rm) { rmSel.value = p.rm; rmSel.dispatchEvent(new Event('change')); }
        setTimeout(() => { const row = [...d.querySelectorAll('#grandTableWrap tr')].find(tr => norm(tr.textContent).includes(norm(p.name))); if (row) { row.scrollIntoView({ block: 'center' }); row.style.outline = '3px solid #6f94e3'; setTimeout(() => { row.style.outline = ''; }, 2500); } }, 400);
      });
    }
  }
  function render() {
    const body = ov.querySelector('.ps-body'), q = input.value;
    if (!q.trim()) {
      const rc = keepOn() ? recents() : [], hint = '<div class="ps-hint">환자 이름(또는 병실 번호)을 입력하세요 — 시간표 · 인수인계 · 교차검증 · 치료기록 QA를 한 번에 보여 줘요.</div>';
      const tools = `<div class="ps-rtools">${rc.length ? '<button type="button" class="btn" data-ps-clear>🗑 기록 지우기</button>' : ''}<button type="button" class="btn" data-ps-keep>${keepOn() ? '최근 기록 저장 끄기' : '최근 기록 저장 켜기'}</button></div>`;
      body.innerHTML = (rc.length ? `<div class="ps-hint">최근 본 환자</div><div class="ps-recents">${rc.map(n => `<button type="button" class="ps-chip" data-ps-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : hint + (keepOn() ? '' : '<div class="ps-hint" style="padding-top:0">최근 본 환자 저장이 꺼져 있어요.</div>')) + tools;
      return;
    }
    if (!results.length) { body.innerHTML = '<div class="ps-hint">일치하는 환자가 없어요. 그랜드라운딩에 시간표가 올라와 있어야 이름이 검색돼요.</div>'; return; }
    sel = Math.min(sel, results.length - 1);
    const p = results[sel], d = detail(p), kinds = (p.kinds || []).map(k => `${k[0]} ${k[1]}`).join(' · ');
    const hoLines = d.ho.slice(0, 6).map(r => `<div class="ps-li"><b>${esc(String(r.type || '').toUpperCase())}</b> ${esc(r.therapist || '-')} <span class="muted">· 주치의 ${esc(r.doctor || '-')} · ${esc(String(r.modified || '').slice(5, 10).replace('-', '/') || '-')}</span></div>`).join('') || '<div class="ps-li muted">인수인계 기록이 없어요</div>';
    const crossLines = d.cross.slice(0, 5).map(i => `<div class="ps-li"><span class="ps-cat">${esc(CROSS_CAT_LABEL[i.category] || i.category)}</span> ${esc(i.title)} <span class="muted">${esc(i.line || '')}</span></div>`).join('') || '<div class="ps-li ps-ok">✔ 교차검증 이상 없음</div>';
    const qaLines = d.qa ? (`${d.qa.errors.length ? `<div class="ps-li"><span class="ps-cat bad">오류 ${d.qa.errors.length}</span> ${esc(d.qa.errors.slice(0, 3).map(x => x.type).join(' · '))}</div>` : ''}${d.qa.missing.length ? `<div class="ps-li"><span class="ps-cat warn">미액팅 ${d.qa.missing.length}</span> ${esc(d.qa.missing.slice(0, 3).map(x => `${x.timeSlot || ''} ${x.type || ''}`.trim()).join(' · '))}</div>` : ''}${!d.qa.errors.length && !d.qa.missing.length ? '<div class="ps-li ps-ok">✔ 치료기록 확인할 것 없음</div>' : ''}`) : '<div class="ps-li muted">치료기록 QA 화면을 한 번 열어 파일을 올리면 여기에 보여요</div>';
    body.innerHTML = `<div class="ps-list">${results.map((r, i) => `<button type="button" class="ps-row${i === sel ? ' on' : ''}" data-ps-i="${i}"><b>${esc(r.name)}</b><span>${esc([r.room ? r.room + '호' : '', r.floor ? r.floor + 'F' : '', r.category, r.rm].filter(Boolean).join(' · '))}</span></button>`).join('')}</div>`
      + `<div class="ps-detail"><div class="ps-name">${esc(p.name)}<small>${esc([p.room ? p.room + '호' : '', p.floor ? p.floor + 'F' : '', p.category, p.rm ? '주치의 ' + p.rm : ''].filter(Boolean).join(' · '))}</small></div>${kinds ? `<div class="ps-kinds">담당 치료사 · ${esc(kinds)}</div>` : ''}`
      + `<div class="ps-acts"><button class="btn primary" data-ps-go="${d.cross.length ? 'cross' : 'grand'}">${d.cross.length ? '교차검증에서 보기' : '그랜드라운딩에서 보기'} ↵</button>${d.cross.length ? '<button class="btn" data-ps-go="grand">그랜드라운딩</button>' : ''}<button class="btn" data-ps-go="handover">인수인계</button>${d.qa && d.qa.errors.length ? '<button class="btn" data-ps-go="qaerr">QA 오류</button>' : ''}${d.qa && d.qa.missing.length ? '<button class="btn" data-ps-go="qamiss">미액팅</button>' : ''}</div>`
      + `<div class="ps-sec">인수인계 <small>${d.ho.length}건</small></div>${hoLines}<div class="ps-sec">교차검증 <small>${d.cross.length}건</small></div>${crossLines}<div class="ps-sec">치료기록 QA</div>${qaLines}`
      + `<div class="ps-cardsec" id="psCard"></div></div>`;
    fillCard(p);
  }
  // 전체시간표 카드(엑셀 원본 그대로) — 교차검증 화면이 이미 불러 둔 시간표에서 그려서 상세 아래에 넣는다. 클릭하면 크게 본다.
  let cardToken = 0, cardNow = null, cardLoad = null;
  function fillCard(p) { return (cardLoad = loadCard(p)); }
  async function loadCard(p) {
    const my = ++cardToken, box = ov && ov.querySelector('#psCard'); if (!box) return; cardNow = null;
    const api = toolFn('cross', '__cardApi');
    if (!api) { box.innerHTML = '<div class="ps-cardhead">전체시간표 카드</div><div class="ps-cardnone">교차검증 화면이 준비되면 카드가 보여요.</div>'; return; }
    box.innerHTML = '<div class="ps-cardhead">전체시간표 카드</div><div class="ps-cardnone">불러오는 중…</div>';
    const d = await api(p.name, p.floor);
    if (my !== cardToken || !ov || !ov.querySelector('#psCard')) return;
    if (!d) { box.innerHTML = '<div class="ps-cardhead">전체시간표 카드</div><div class="ps-cardnone">전체시간표에서 이 환자의 카드를 찾지 못했어요(외래·퇴원·시간표 미연결일 수 있어요).</div>'; return; }
    cardNow = d;
    box.innerHTML = `<div class="ps-cardhead">📇 ${esc(d.floor)}F 전체시간표 카드 <span class="muted" style="font-weight:600">· ${esc(d.sheet)} 시트</span><button type="button" class="btn" data-ps-big>⤢ 크게</button></div><div class="ps-cardwrap" data-ps-big><div class="ps-cardzoom">${d.html}</div></div>`;
    const wrap = box.querySelector('.ps-cardwrap'), z = box.querySelector('.ps-cardzoom'); z.style.zoom = Math.min(1, (wrap.clientWidth - 10) / d.width);
  }
  function openBig() {
    if (!cardNow || document.querySelector('.ps-big')) return;
    const b = document.createElement('div'); b.className = 'ps-big'; window.__psBig = true;
    b.innerHTML = `<div class="ps-bigbox"><h3>📇 ${esc(cardNow.title)}<kbd>Esc</kbd><button type="button" class="btn" data-ps-bigclose>닫기</button></h3><div class="ps-bigzoom">${cardNow.html}</div></div>`;
    document.body.appendChild(b);
    const box = b.querySelector('.ps-bigbox'), z = b.querySelector('.ps-bigzoom'), head = b.querySelector('h3');
    z.style.zoom = Math.max(0.3, Math.min(1.4, (window.innerWidth * 0.94 - 60) / cardNow.width, (window.innerHeight * 0.94 - head.offsetHeight - 60) / cardNow.height));
    b.addEventListener('click', (e) => { if (e.target.closest('[data-ps-bigclose]')) { closeBig(); input && input.focus(); } });
  }
  function closeBig() { document.querySelector('.ps-big')?.remove(); window.__psBig = false; }
  window.__psCloseBig = closeBig;
  const ENTER_HINT = { card: '전체시간표 크게', stay: '(이동 없음)', goto: '화면 이동' };
  // Enter: 설정에 따라 전체시간표 카드를 크게 / 그대로 두기 / 해당 화면으로 이동
  async function onEnter(p) {
    const mode = settings.psEnter;
    if (mode === 'goto') { go(detail(p).cross.length ? 'cross' : 'grand', p); return; }
    if (mode === 'stay') return;
    remember(p.name); if (cardLoad) await cardLoad; if (ov && results[sel] === p) openBig();
  }
  function open() {
    if (ov) { input.focus(); input.select(); return; }
    ov = document.createElement('div'); ov.className = 'ps-overlay'; window.__psOpen = true;
    ov.innerHTML = '<div class="ps-card" role="dialog" aria-label="환자 빠른 검색"><div class="ps-top"><span>🔎</span><input type="text" class="ps-input" placeholder="환자 이름 또는 병실 번호" autocomplete="off" spellcheck="false"><kbd>Esc</kbd><button type="button" class="btn" data-ps-close>닫기</button></div><div class="ps-body"></div><div class="ps-foot">↑↓ 환자 선택 · Enter ' + (ENTER_HINT[settings.psEnter] || ENTER_HINT.card) + ' · F2 검색창에 쓰기 · Esc 또는 닫기 버튼으로 닫기</div></div>';
    document.body.appendChild(ov); document.addEventListener('keydown', onF2, true); input = ov.querySelector('.ps-input'); results = []; sel = 0; render(); input.focus();
    input.addEventListener('input', () => { results = search(input.value); sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (results.length) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length; render(); } }
      else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); onEnter(results[sel]); }
    });
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-ps-close]')) { close(); return; }
      if (e.target.closest('[data-ps-clear]')) { clearRecents(); render(); input.focus(); return; }
      if (e.target.closest('[data-ps-keep]')) { setSetting('psRecent', !keepOn()); if (!keepOn()) clearRecents(); render(); input.focus(); return; }
      const r = e.target.closest('[data-ps-i]'); if (r) { sel = +r.dataset.psI; render(); input.focus(); return; }
      const c = e.target.closest('[data-ps-q]'); if (c) { input.value = c.dataset.psQ; results = search(input.value); sel = 0; render(); input.focus(); return; }
      if (e.target.closest('[data-ps-big]')) { openBig(); return; }
      const g = e.target.closest('[data-ps-go]'); if (g && results[sel]) go(g.dataset.psGo, results[sel]);
    });
  }
  window.__openPatientSearch = open; window.__psClose = close; window.__psIsOpen = isOpen;
})();
