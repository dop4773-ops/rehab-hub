// statebackup.js — 브라우저 저장소(localStorage)에만 있는 중요한 기록(설정·메모·교차검증 이력·제외·확인함·수정 완료 표시 등)을 파일로 복사해 두고, 저장소가 비었을 때 되살리는 순수 함수.
// 저장소는 캐시 삭제·프로필 초기화로 통째로 사라질 수 있어서(그러면 이력·제외 사유가 모두 날아간다) 앱 데이터 폴더에 사본을 둔다. 사본은 저장소에 없는 키만 되살린다(저장소의 최신 값을 덮어쓰지 않음).
// 브라우저: <script src="core/statebackup.js"> → RehabCore.stateBackup / Node: require() (테스트용). 저장소(storage)는 localStorage 모양(getItem/setItem/removeItem)이면 된다.
'use strict';
(function (root) {
const KEYS = ['rehab_settings_v1', 'rehab_home_memo_v1', 'rehab_cross_history_v1', 'rehab_cross_ack_v1', 'rehab_cross_exclude_v1', 'rehab_cross_feedback_v1', 'rehab_fix_done_v1', 'rehab_qa_excl_slots_v1', 'rehab_scale_v1', 'rehab_recent_patients_v1'];
// 지금 저장소의 값들 → {키: 글자}. 없는 키·읽을 수 없는 키는 뺀다.
function snapshot(storage, keys = KEYS) {
  const out = {};
  for (const k of keys) { let v = null; try { v = storage.getItem(k); } catch (e) { /* 못 읽으면 건너뜀 */ } if (typeof v === 'string' && v !== '') out[k] = v; }
  return out;
}
// 저장소에 없는(또는 비어 있는) 키만 사본에서 되살린다 → 되살린 키 목록
function restoreMissing(storage, backup, keys = KEYS) {
  const restored = [];
  if (!backup || typeof backup !== 'object') return restored;
  for (const k of keys) {
    const v = backup[k]; if (typeof v !== 'string' || v === '') continue;
    let cur = null; try { cur = storage.getItem(k); } catch (e) { continue; }
    if (cur == null || cur === '') { try { storage.setItem(k, v); restored.push(k); } catch (e) { /* 못 쓰면 건너뜀 */ } }
  }
  return restored;
}
// 사본과 지금 값이 다른가(같으면 파일을 다시 쓰지 않는다)
const changed = (prev, next) => JSON.stringify(prev || {}) !== JSON.stringify(next || {});
const api = { KEYS, snapshot, restoreMissing, changed };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { stateBackup: api });
})(typeof window !== 'undefined' ? window : globalThis);
