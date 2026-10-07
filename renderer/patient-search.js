'use strict';
// patient-search.js — Ctrl+K 환자 빠른 검색. 이름(또는 병실 번호) 몇 글자만 치면 그 환자의 시간표 정보·인수인계·교차검증 이슈·치료기록 QA 결과를 한곳에서 보여 주고,
// 버튼으로 해당 화면에서 그 환자만 걸러 열어 준다. 읽기만 한다(각 도구 화면이 알려 주는 값을 모아서 보여줄 뿐 계산하거나 저장하지 않는다). shell.js 다음에 불러온다.
(function () {
  const RECENT_KEY = 'rehab_recent_patients_v1';
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  const esc = (s) => updEsc(String(s == null ? '' : s));
  const toolFn = (key, fn) => { try { const w = document.querySelector(`iframe[data-tool="${key}"]`)?.contentWindow; return w && typeof w[fn] === 'function' ? w[fn] : null; } catch (e) { return null; } };
  const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } };
  const remember = (name) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...recents().filter(n => n !== name)].slice(0, 8))); } catch (e) { /* 기억 못 해도 동작에는 문제 없음 */ } };
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
  function close() { if (!ov) return; ov.remove(); ov = null; window.__psOpen = false; }
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
      const rc = recents();
      body.innerHTML = rc.length ? `<div class="ps-hint">최근 본 환자</div><div class="ps-recents">${rc.map(n => `<button type="button" class="ps-chip" data-ps-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '<div class="ps-hint">환자 이름(또는 병실 번호)을 입력하세요 — 시간표 · 인수인계 · 교차검증 · 치료기록 QA를 한 번에 보여 줘요.</div>';
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
      + `<div class="ps-sec">인수인계 <small>${d.ho.length}건</small></div>${hoLines}<div class="ps-sec">교차검증 <small>${d.cross.length}건</small></div>${crossLines}<div class="ps-sec">치료기록 QA</div>${qaLines}`
      + `<div class="ps-acts"><button class="btn primary" data-ps-go="${d.cross.length ? 'cross' : 'grand'}">${d.cross.length ? '교차검증에서 보기' : '그랜드라운딩에서 보기'} ↵</button>${d.cross.length ? '<button class="btn" data-ps-go="grand">그랜드라운딩</button>' : ''}<button class="btn" data-ps-go="handover">인수인계</button>${d.qa && d.qa.errors.length ? '<button class="btn" data-ps-go="qaerr">QA 오류</button>' : ''}${d.qa && d.qa.missing.length ? '<button class="btn" data-ps-go="qamiss">미액팅</button>' : ''}</div></div>`;
  }
  function open() {
    if (ov) { input.focus(); input.select(); return; }
    ov = document.createElement('div'); ov.className = 'ps-overlay'; window.__psOpen = true;
    ov.innerHTML = '<div class="ps-card" role="dialog" aria-label="환자 빠른 검색"><div class="ps-top"><span>🔎</span><input type="text" class="ps-input" placeholder="환자 이름 또는 병실 번호" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="ps-body"></div><div class="ps-foot">↑↓ 환자 선택 · Enter 열기 · Esc 닫기</div></div>';
    document.body.appendChild(ov); input = ov.querySelector('.ps-input'); results = []; sel = 0; render(); input.focus();
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    input.addEventListener('input', () => { results = search(input.value); sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (results.length) { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length; render(); } }
      else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); const d = detail(results[sel]); go(d.cross.length ? 'cross' : 'grand', results[sel]); }
    });
    ov.addEventListener('click', (e) => {
      const r = e.target.closest('[data-ps-i]'); if (r) { sel = +r.dataset.psI; render(); input.focus(); return; }
      const c = e.target.closest('[data-ps-q]'); if (c) { input.value = c.dataset.psQ; results = search(input.value); sel = 0; render(); input.focus(); return; }
      const g = e.target.closest('[data-ps-go]'); if (g && results[sel]) go(g.dataset.psGo, results[sel]);
    });
  }
  window.__openPatientSearch = open; window.__psClose = close; window.__psIsOpen = isOpen;
})();
