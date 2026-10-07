'use strict';
// settings-core.js — 설정 값의 기본값·검증·저장/내보내기와 단축키 규칙(순수 함수, 화면 코드 없음).
// 브라우저: <script src="settings-core.js"> / Node: require() (테스트용)
(function (root) {
  const KEY = 'rehab_settings_v1';
  const LEGACY = { syncMode: 'rehab_sync_mode', dataView: 'rehab_data_view_v1' }; // 예전에 따로 저장하던 값(처음 한 번만 옮겨옴)
  const DEFAULTS = {
    syncMode: 'launch', checkSec: 30, notifyStale: true,
    dataView: 'list', dataStaleFirst: true, dataHideUnused: false,
    homeLayout: 'workbench', sidebar: 'last', fontSize: 'normal', color: 'pastel', filesArea: 'collapsed',
    actingSeverity: 'error', grandStats: 'collapsed', grandTime: '09',
    shortcuts: true, keymap: {},
    itda: true, itdaPush: true, itdaCategory: '그랜드라운딩',
    qaTherapistTab: true, qaTabCounts: true, qaMaskNames: true, qaStartTab: 'missing',
  };
  const HOURS = ['08', '09', '10', '11', '13', '14', '15', '16'];
  const ENUMS = {
    syncMode: ['launch', '5', '10', '30', '60', 'manual'], checkSec: [15, 30, 60, 120, 300],
    dataView: ['list', 'matrix', 'board'], homeLayout: ['workbench', 'compact', 'classic'], sidebar: ['last', 'open', 'closed'],
    fontSize: ['small', 'normal', 'large'], color: ['pastel', 'vivid'], filesArea: ['collapsed', 'open'],
    actingSeverity: ['error', 'all'], qaStartTab: ['missing', 'error', 'therapist'], grandStats: ['collapsed', 'open'], grandTime: HOURS,
  };
  const BOOLS = ['notifyStale', 'dataStaleFirst', 'dataHideUnused', 'shortcuts', 'itda', 'itdaPush', 'qaTherapistTab', 'qaTabCounts', 'qaMaskNames'];
  const ZOOM = { small: 0.92, normal: 1, large: 1.12 };
  const VIVID_FILTER = 'saturate(1.45)'; // "선명" 색감 — 파스텔 색을 그대로 두고 채도만 올린다

  // 키 조합 표기: "Ctrl+Shift+F" (Ctrl은 맥에서 ⌘ 포함). 글자는 대문자로 통일한다.
  const MODS = ['Ctrl', 'Shift'];
  function normKeys(s) {
    const parts = String(s || '').split('+').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    const key = parts.pop(), mods = MODS.filter(m => parts.some(p => p.toLowerCase() === m.toLowerCase()));
    return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
  }
  // 키 입력 이벤트 → 조합 문자열. Ctrl이 없거나 Ctrl/Shift 같은 보조키만 누르면 null.
  function keysFromEvent(e) {
    if (!(e.ctrlKey || e.metaKey) || ['Control', 'Shift', 'Alt', 'Meta', '+'].includes(e.key) || e.altKey) return null; // '+'는 조합 표기와 헷갈려서 제외
    return normKeys([e.shiftKey ? 'Shift' : '', 'Ctrl', e.key].filter(Boolean).join('+'));
  }
  // 복사·붙여넣기 같은 기본 동작과 겹치면 안 되는 조합
  const RESERVED = ['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z', 'Ctrl+W', 'Ctrl+Q'];
  // items: [{id, scope('global' 또는 화면 이름), keys}] — 같은 화면(또는 공통)에서 이미 쓰는 조합이면 그 항목을 돌려준다.
  function findConflict(items, id, keys, keymap = {}) {
    const me = items.find(x => x.id === id), k = normKeys(keys);
    if (RESERVED.includes(k)) return { reserved: true };
    return items.find(x => x.id !== id && normKeys(keymap[x.id] || x.keys) === k
      && (x.scope === 'global' || me.scope === 'global' || x.scope === me.scope)) || null;
  }

  function normalize(raw) {
    const s = JSON.parse(JSON.stringify(DEFAULTS)), r = raw && typeof raw === 'object' ? raw : {};
    for (const k of Object.keys(ENUMS)) {
      const v = k === 'checkSec' ? Number(r[k]) : String(r[k]);
      if (r[k] != null && ENUMS[k].includes(v)) s[k] = v;
    }
    for (const k of BOOLS) if (typeof r[k] === 'boolean') s[k] = r[k];
    if (typeof r.itdaCategory === 'string' && r.itdaCategory.trim()) s.itdaCategory = r.itdaCategory.trim().slice(0, 40);
    if (r.keymap && typeof r.keymap === 'object') for (const [id, v] of Object.entries(r.keymap)) { const n = normKeys(v); if (n && n.includes('Ctrl')) s.keymap[id] = n; }
    return s;
  }
  function load(storage) {
    let raw = null;
    try { raw = JSON.parse(storage.getItem(KEY)); } catch (e) { /* 없거나 깨졌으면 기본값 */ }
    if (!raw) { raw = {}; for (const [k, lk] of Object.entries(LEGACY)) { try { const v = storage.getItem(lk); if (v) raw[k] = v; } catch (e) { /* 저장소를 못 써도 기본값 */ } } }
    return normalize(raw);
  }
  function save(storage, s) { try { storage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 저장 실패해도 이번 실행엔 적용됨 */ } }

  // 설정 파일(다른 PC로 옮길 때): 설정값 + 폴더 목록(경로)
  function exportJson(s, folders, version, now = new Date()) {
    return JSON.stringify({ app: 'rehab-hub', version, exportedAt: now.toISOString(), settings: s, folders: (folders || []).map(f => ({ label: f.label, dirPath: f.dirPath })) }, null, 2);
  }
  function parseImport(text) {
    let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, error: '설정 파일을 읽을 수 없어요(JSON 형식이 아니에요).' }; }
    if (!o || o.app !== 'rehab-hub' || typeof o.settings !== 'object') return { ok: false, error: '이 프로그램에서 내보낸 설정 파일이 아니에요.' };
    const folders = (Array.isArray(o.folders) ? o.folders : []).filter(f => f && typeof f.dirPath === 'string' && f.dirPath).map(f => ({ label: String(f.label || ''), dirPath: f.dirPath }));
    return { ok: true, settings: normalize(o.settings), folders };
  }

  root.RehabSettings = { KEY, DEFAULTS, ENUMS, ZOOM, VIVID_FILTER, normalize, load, save, normKeys, keysFromEvent, findConflict, RESERVED, exportJson, parseImport };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RehabSettings;
})(typeof window !== 'undefined' ? window : globalThis);
