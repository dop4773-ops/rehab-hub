// scaleguard.js — 도구가 읽은 자료의 규모(환자 수·칸 수 등)가 최근 며칠과 크게 다르면 알리는 공용 함수. 엑셀 양식이 바뀌거나 파일이 일부만 읽히면 검사 결과가 조용히 틀어지는 것을 막으려는 장치.
// 도구마다 자기 지표를 넘기면 날짜별로 저장소에 남기고(최근 14일), 이전 며칠의 중앙값과 비교한다. 기준이 작으면(5~10 미만) 흔들림이 커서 비교하지 않는다.
// 브라우저: <script src="../core/scaleguard.js"> → RehabCore.scaleGuard / Node: require() (테스트용). 저장소(storage)는 localStorage 모양(getItem/setItem)이면 된다.
'use strict';
(function (root) {
const KEY = 'rehab_scale_v1', KEEP_DAYS = 14;
const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const load = (storage) => { try { return JSON.parse(storage.getItem(KEY)) || {}; } catch (e) { return {}; } };
// labels: {지표키: '사람이 읽는 이름'} · units: {지표키: '명'|'칸'…}
// → [{key, kind:'zero'|'drop'|'jump', label, value, base, text}]. 오늘 값은 비교한 뒤에 저장한다(같은 날 다시 돌리면 그날 값을 바꿔 끼운다).
function check(storage, tool, metrics, { labels = {}, units = {}, now = Date.now(), lookback = 5 } = {}) {
  const today = dayOf(now), all = load(storage), mine = all[tool] || {};
  const prior = Object.keys(mine).filter(d => d < today).sort().slice(-lookback).map(d => mine[d]);
  const out = [];
  for (const [k, v] of Object.entries(metrics || {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const vals = prior.map(m => m[k]).filter(x => typeof x === 'number'); if (!vals.length) continue;
    const b = median(vals), label = labels[k] || k, u = units[k] || '개';
    if (b >= 5 && v === 0) out.push({ key: k, kind: 'zero', label, value: v, base: b, text: `${label}이(가) 0${u}예요(평소 ${Math.round(b)}${u}) — 파일을 못 읽었거나 양식이 바뀌었을 수 있어요` });
    else if (b >= 10 && v < b * 0.6) out.push({ key: k, kind: 'drop', label, value: v, base: b, text: `${label} ${v}${u} (평소 ${Math.round(b)}${u}) — 파일이 일부만 읽혔거나 양식이 바뀌었을 수 있어요` });
    else if (b >= 10 && v > b * 1.7) out.push({ key: k, kind: 'jump', label, value: v, base: b, text: `${label} ${v}${u} (평소 ${Math.round(b)}${u}) — 파일이 중복되거나 양식이 바뀌었을 수 있어요` });
  }
  const keep = {}; for (const d of Object.keys(mine).sort().slice(-(KEEP_DAYS - 1))) if (d !== today) keep[d] = mine[d];
  keep[today] = { ...(mine[today] || {}), ...metrics };
  all[tool] = keep; try { storage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 저장 못 해도 이번 비교는 유효 */ }
  return out;
}
const api = { check, KEY };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { scaleGuard: api });
})(typeof window !== 'undefined' ? window : globalThis);
