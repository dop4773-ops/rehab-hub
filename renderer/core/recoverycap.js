// recoverycap.js — 치료기록 QA: ① 평일 OT·PT 공통 "삭제·추가 내역" 엑셀 읽기(삭제 유지만) ② 한 환자의 회복기재활 액팅이 기준(15개)을 넘는 경우 찾기. 순수 함수(화면·파일 접근 없음).
// 브라우저: <script src="../core/recoverycap.js"> / Node: require() (테스트용)
// rows: SheetJS sheet_to_json(header:1)와 같은 2차원 배열(0부터, 빈 칸은 null/undefined).
'use strict';
(function (root) {
const txt = (v) => (v == null ? '' : String(v));
const lines = (v) => txt(v).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const compact = (s) => txt(s).replace(/\s+/g, '');
const TIME_RE = /(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/;
const nameKey = (s) => compact(s).toUpperCase();
const regDigits = (s) => txt(s).replace(/\D/g, '');

// "08:30~09:00\n기구치료" / "11:25~11:55\n작업치료\n사유: 외진" → {time, treat, reason}
function parseTreat(cell) {
  const ls = lines(cell), out = { time: '', treat: '', reason: '' };
  for (const l of ls) {
    const m = TIME_RE.exec(l);
    if (m && !out.time) out.time = `${m[1]}~${m[2]}`;
    else if (/^사유\s*:/.test(l)) out.reason = l.replace(/^사유\s*:\s*/, '');
    else if (!out.treat) out.treat = l;
  }
  return out;
}

// 반환: {date:'2026-10-15'|'', entries:[{floor, dept:'OT'|'PT', name, ward, reg, deleted:{time,treat}, added:{time,treat,reason}, therapist, team, status, at}], restored:n}
// 삭제 유지만 entries에 담고, 복구 완료는 세기만 한다(restored).
function parseDelAddRows(rows) {
  const out = { date: '', entries: [], restored: 0 };
  let floor = 0, blocks = null;
  for (let r = 0; r < (rows || []).length; r++) {
    const row = rows[r] || [];
    const first = row.map(txt).find(s => s.trim()) || '';
    const dm = /기준일\s*(\d{4}-\d{2}-\d{2})/.exec(first); if (dm && !out.date) out.date = dm[1];
    const fm = /^(\d+)\s*층\s*·/.exec(first.trim()); if (fm) { floor = +fm[1]; blocks = null; continue; }
    // 머리줄: "번호" 다음 칸이 "환자 / 병실" — 한 줄에 OT(왼쪽)·PT(오른쪽) 블록이 나란히 있다
    const starts = []; row.forEach((v, c) => { if (compact(v) === '번호' && compact(row[c + 1]).startsWith('환자')) starts.push(c); });
    if (starts.length) {
      const above = rows[r - 1] || [];
      blocks = starts.map(c => ({ c, dept: /^PT/i.test(compact(above[c])) ? 'PT' : 'OT' }));
      continue;
    }
    if (!blocks) continue;
    for (const b of blocks) {
      if (!/^\d+$/.test(compact(row[b.c]))) continue;
      const pl = lines(row[b.c + 1]), status = compact(lines(row[b.c + 5])[0] || '');
      if (!pl.length) continue;
      if (/복구/.test(status)) { out.restored++; continue; }
      if (!/삭제유지/.test(status)) continue;
      const th = lines(row[b.c + 4]), sl = lines(row[b.c + 5]);
      out.entries.push({
        floor, dept: b.dept, name: pl[0], ward: pl[1] || '', reg: regDigits((pl.find(l => /등록번호/.test(l)) || '')),
        deleted: parseTreat(row[b.c + 2]), added: parseTreat(row[b.c + 3]), therapist: th[0] || '', team: th[1] || '', status: '삭제 유지', at: (sl[1] || '').replace(/^(삭제|복구)\s*/, ''),
      });
    }
  }
  return out;
}

// 한 환자의 삭제·추가 내역: 등록번호가 같으면 그 환자, 등록번호가 없으면 이름이 같은 사람
function delAddFor(entries, { regNo, name }) {
  const reg = regDigits(regNo), nk = nameKey(name);
  return (entries || []).filter(e => (reg && e.reg ? e.reg === reg : nameKey(e.name) === nk));
}
const delAddLine = (e) => `${e.floor ? e.floor + '층 ' : ''}${e.dept}: ${e.deleted.time} ${e.deleted.treat} 삭제 → ${e.added.time} ${e.added.treat} 추가${e.therapist ? `(${e.therapist}${e.added.reason ? ', 사유: ' + e.added.reason : ''})` : e.added.reason ? `(사유: ${e.added.reason})` : ''}${e.at ? ` · 삭제 ${e.at}` : ''}`;

// 삭제된 시간대("08:30~09:00") 안에서 시작한 액팅을 찾는다. items: [{startM, ...}] → {hits:[{item, entry}], rest:[액팅과 안 겹친 내역]}
const rangeMin = (t) => { const m = TIME_RE.exec(txt(t)); if (!m) return null; const f = (s) => { const [h, mi] = s.split(':').map(Number); return h * 60 + mi; }; return [f(m[1]), f(m[2])]; };
function delAddOverlaps(entries, items) {
  const hits = [], used = new Set();
  for (const e of entries || []) {
    const rg = rangeMin(e.deleted && e.deleted.time); if (!rg) continue;
    for (const it of items || []) if (it.startM != null && it.startM >= rg[0] && it.startM < rg[1]) { hits.push({ item: it, entry: e }); used.add(e); }
  }
  hits.sort((a, b) => a.item.startM - b.item.startM);
  return { hits, rest: (entries || []).filter(e => !used.has(e)) };
}
// items: [{regNo, name, startM, time, therapist, ref}] — 이미 "회복기재활 오더"만 골라 넣는다. 환자(등록번호 없으면 이름)별로 세어 max를 넘는 환자를 돌려준다.
// 시간순으로 줄 세워 (max+1)번째 액팅을 trigger로 한다(기준을 넘기게 한 액팅).
function findRecoveryOver(items, max = 15) {
  const by = new Map();
  for (const it of items || []) { const k = regDigits(it.regNo) || 'n:' + nameKey(it.name); if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
  const out = [];
  for (const list of by.values()) {
    if (list.length <= max) continue;
    const sorted = list.slice().sort((a, b) => (a.startM == null) - (b.startM == null) || a.startM - b.startM);
    out.push({ name: sorted[0].name, regNo: sorted[0].regNo, count: sorted.length, items: sorted, trigger: sorted[max] });
  }
  return out.sort((a, b) => b.count - a.count || nameKey(a.name).localeCompare(nameKey(b.name), 'ko'));
}
const api = { parseDelAddRows, delAddFor, delAddLine, delAddOverlaps, findRecoveryOver, parseTreat };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RehabRecoveryCap = api;
})(typeof window !== 'undefined' ? window : globalThis);
