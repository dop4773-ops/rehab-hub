'use strict';
// work-resume.js — 자동 업데이트·재시작이 하던 작업을 지우지 않게 한다. shell.js 다음에 불러온다.
//  ① 평소에도 30초마다(그리고 창이 닫힐 때) "하던 화면 + 각 도구의 검색·필터 상태"를 저장해 둔다.
//  ② 업데이트 설치 직전 메인이 부르면 한 번 더 저장하고 "업데이트 후 복귀" 표식을 남긴다 → 다시 켜지면 하던 화면으로 돌아간다(앱을 그냥 껐다 켜면 홈으로 시작).
//  ③ 직접 올린 파일·열려 있는 수정 창처럼 다시 켜면 사라지는 작업이 있으면 자동 설치를 미루고(끌 때 설치), 지금 설치를 누르면 먼저 경고한다.
//  (설정·교차검증 제외/확인함·수정 지시서 완료·미액팅 제외 칸·그랜드라운딩 메모/체크·보관함은 원래 저장돼 있어 업데이트 후에도 그대로 남는다)
(function () {
  const KEY = 'rehab_session_v1', TOOL_NAME = { rm: '그랜드라운딩', acting: '치료기록 QA', cross: '교차검증', handover: '인수인계' };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const frame = (key) => document.querySelector(`iframe[data-tool="${key}"]`);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const manual = new Set(); // 사용자가 직접 올린(끌어다 놓은) 파일이 있는 도구 — 폴더 자동 불러오기로는 못 되살리는 것

  document.querySelectorAll('iframe[data-tool]').forEach(f => f.addEventListener('load', () => {
    try {
      const d = f.contentDocument;
      d.addEventListener('change', (e) => { if (e.isTrusted && e.target && e.target.type === 'file') manual.add(f.dataset.tool); }, true); // 셸이 폴더에서 채우는 것은 isTrusted가 아니라서 제외된다
      d.addEventListener('drop', (e) => { if (e.isTrusted && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) manual.add(f.dataset.tool); }, true);
    } catch (e) { /* 같은 출처가 아니면 건너뜀 */ }
  }));

  function unsavedWork() {
    const out = [...manual].map(k => `직접 올린 파일(${TOOL_NAME[k] || k})은 업데이트 뒤 다시 올려야 해요`);
    for (const key of Object.keys(TOOL_NAME)) { try { const m = frame(key)?.contentWindow?.__unsavedWork?.(); if (m) out.push(m); } catch (e) { /* 그 도구만 건너뜀 */ } }
    return out;
  }
  function snapshot(extra) {
    const tools = {};
    for (const key of Object.keys(TOOL_NAME)) { if (!loadedTools.has(key)) continue; try { const w = frame(key).contentWindow; if (w.__getWorkState) tools[key] = w.__getWorkState(); } catch (e) { /* 그 도구만 건너뜀 */ } }
    return { view: currentView(), t: Date.now(), tools, clean: false, resume: false, ...extra };
  }
  const save = (extra) => { try { localStorage.setItem(KEY, JSON.stringify(snapshot(extra))); } catch (e) { /* 저장이 안 돼도 동작에는 문제 없음 */ } };

  // 복원: 화면을 열고, 각 도구가 데이터를 다 읽을 때까지(최대 약 40초) 상태 적용을 다시 시도한다
  async function restore(s, why) {
    if (s.view && s.view !== 'home') showView(s.view);
    const pending = new Set(Object.keys(s.tools || {}));
    for (let i = 0; i < 50 && pending.size; i++) {
      for (const key of [...pending]) { try { ensureToolLoaded(key); if (frame(key)?.contentWindow?.__setWorkState?.(s.tools[key])) pending.delete(key); } catch (e) { /* 다음에 다시 시도 */ } }
      if (pending.size) await sleep(800);
    }
    showToast(why === 'update' ? '↩ 업데이트가 끝났어요 — 하던 화면으로 돌아왔어요' : '↩ 앱이 다시 시작돼서 하던 화면으로 돌아왔어요', 4500);
  }
  (async function start() {
    let flags = {}; try { flags = await window.rehab.app.flags(); } catch (e) { /* 기본값 */ }
    const s = load(), fresh = RehabCore.workState.resumeFresh(s);
    await sleep(1500); // 셸이 처음 화면을 다 띄운 뒤에
    if (!flags.noResume && fresh && (s.resume || !s.clean)) restore(s, s.resume ? 'update' : 'crash');
    save(); // 이전 표식은 한 번만 쓰고 지운다
    setInterval(() => save(), 30000);
  })();
  window.addEventListener('pagehide', () => { const prev = load(); save({ clean: true, resume: !!(prev && prev.resume && Date.now() - prev.t < 60000) }); }); // 업데이트 준비 표식(resume)은 닫히는 순간에도 유지

  // 메인의 신호: 설치 직전 저장 · 저장 안 된 작업 확인
  window.rehab.app.onPrepareQuit(async () => { save({ clean: true, resume: true }); });
  window.rehab.app.onCheckUnsaved(async () => unsavedWork());

  // "지금 설치"를 눌렀을 때: 저장 안 된 작업이 있으면 먼저 알리고 선택하게 한다
  window.__guardInstall = (go) => {
    const items = unsavedWork(); if (!items.length) return go();
    const ov = document.createElement('div'); ov.className = 'ps-overlay'; ov.style.zIndex = 9200;
    ov.innerHTML = `<div class="ps-card" style="width:min(520px,92vw);padding:18px 20px"><b style="font-size:15px">⚠ 작업 중인 내용이 있어요</b><div style="margin:10px 0;line-height:1.6;font-size:13px">${items.map(x => '· ' + updEsc(x)).join('<br>')}</div><div style="font-size:12.5px;color:var(--sub)">설정·검증 기록·제외 표시 같은 저장된 작업은 그대로 남아요. 지금 설치하면 위 내용은 사라지니, 끝낸 뒤 프로그램을 끄면 그때 설치되게 두는 걸 권해요.</div><div class="ut-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-wr="later">나중에 (끌 때 설치)</button><button class="btn" data-wr="now">그래도 지금 설치</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-wr]'); if (!b && e.target !== ov) return; ov.remove(); if (b && b.dataset.wr === 'now') go(); });
  };
  window.__workResume = { save, unsavedWork, snapshot, load, restore, KEY };
})();
