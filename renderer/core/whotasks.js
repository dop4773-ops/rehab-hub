// whotasks.js — 교차검증·치료기록 QA가 각자 만든 「선생님별 확인 항목」을 한 사람 기준으로 합치는 순수 함수(화면 접근 없음).
// 각 도구는 [{who, count, text, extra?}] 를 내놓는다(who=선생님 이름, count=건수, text=카톡에 보낼 글, extra=건수에 안 넣는 참고 건수). 같은 선생님은 조 표시(A/B)·직종(OT/PT/ST)을 떼고 같은 사람으로 본다.
// 브라우저: <script src="core/whotasks.js"> → RehabCore.whoTasks / Node: require() (테스트용)
'use strict';
(function (root) {
const baseName = (n) => String(n || '').replace(/\s+/g, '').replace(/(OT|PT|ST)$/i, '').replace(/[A-Z]$/, '');
// sources: [{key, label, list:[{who, count, text, extra}]}] → [{who, key, total, sources:[{key, label, count, extra, text}]}] (건수 많은 순)
function merge(sources, { date = '' } = {}) {
  const by = new Map();
  for (const s of sources || []) for (const t of (s && s.list) || []) {
    const raw = String(t.who || '').trim(); if (!raw || (!t.count && !t.extra)) continue;
    const k = baseName(raw) || raw; if (!by.has(k)) by.set(k, { who: raw, key: k, total: 0, sources: [] });
    const p = by.get(k); p.total += t.count || 0; if (raw.length < p.who.length) p.who = raw;
    p.sources.push({ key: s.key, label: s.label, count: t.count || 0, extra: t.extra || 0, text: String(t.text || '') });
  }
  return [...by.values()].map(p => ({ ...p, text: personText(p, date) })).sort((a, b) => b.total - a.total || a.who.localeCompare(b.who, 'ko'));
}
// 한 사람에게 보낼 글: 도구별 글을 이어 붙이되, 각 글의 첫머리 날짜·「<○○ 선생님 확인 부탁드려요>」·맺음 문구(✅로 시작하는 줄)는 한 번만 남긴다.
function personText(p, date) {
  const closing = '✅ 확인하고 고친 뒤 수정했다고 알려 주세요.';
  const parts = p.sources.map(s => s.text.split('\n').filter((l, i) => !(i <= 1 && (/^<.*선생님.*>$/.test(l.trim()) || (i === 0 && (l.trim() === '' || /^\[?\d{1,2}\/\d{1,2}/.test(l.trim()) || /^\d{4}/.test(l.trim())))))).filter(l => !/^\s*✅/.test(l)).join('\n').trim()).filter(Boolean);
  const head = `${date ? date + '\n' : ''}<${p.who} 선생님 확인 부탁드려요>`;
  return [head, ...parts, '', closing].join('\n').replace(/\n{3,}/g, '\n\n');
}
const api = { merge, baseName };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.RehabCore = Object.assign(root.RehabCore || {}, { whoTasks: api });
})(typeof window !== 'undefined' ? window : globalThis);
