// fixrefs.js — 교차검증 불일치마다 "어느 파일 어느 시트의 어느 칸(예: J45)인지"를 찾아 붙인다(순수 함수; 파일은 읽기만 한 결과를 쓴다).
// issue.refs = [{group:'status'|'card'|'grid', sheet, cells:['J45', ...]}]. 못 찾는 항목은 refs를 붙이지 않는다(시트 이름까지만 안내).
// 칸 주소를 알 수 있는 것: 현황판(현황(회복기)) 칸·행, 평일시간표(원본) 메인 표 칸, 전체시간표(원본) 카드(이름·병실·RM·치료위치 칸), 매트/테이블현황 칸.
// 브라우저: <script src="../core/fixrefs.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
const normKey = (n) => String(n == null ? '' : n).replace(/[\s·ㆍ\-\(\)\[\]{}.,\/\\]/g, '').toUpperCase();
function colLetter(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
const FIELD_KEY = { SOT: 'sot', RDT: 'rdt', ERDT: 'erdt', CCRT: 'ccrt', 언어: 'lang' };

// ctx: { status:{sheetName, cols, list, dischargedList}|null, sched:{sheet, occ}|null, findCard(name, floor), gridEntries(floor) }
function attachRefs(issues, ctx) {
  const st = ctx.status, sc = ctx.sched;
  const active = (n) => st && st.list.find(r => normKey(r.name) === normKey(n));
  const gone = (n) => st && st.dischargedList.find(r => normKey(r.name) === normKey(n));
  const stCell = (rec, key) => (rec && st.cols[key] && rec.row) ? { group: 'status', sheet: st.sheetName, cells: [st.cols[key] + rec.row] } : null;
  const cardCell = (card, dr, dc) => card && card.headRow ? colLetter(card.headCol + dc) + (card.headRow + dr) : null;
  const cardRef = (card, cells) => { const c = cells.filter(Boolean); return card && c.length ? { group: 'card', sheet: card.sheet, cells: c } : null; };
  const occRef = (pred) => { const c = sc ? sc.occ.filter(pred).map(o => o.ref).filter(Boolean) : []; return c.length ? { group: 'status', sheet: sc.sheet, cells: [...new Set(c)] } : null; };
  const typeOf = (label) => /작업|SOT/.test(label || '') ? 'sot' : /연하|RDT/.test(label || '') ? 'rdt' : '';

  function refsFor(i) {
    const d = i.detail || {}, name = i.patient, card = ctx.findCard(name, i.floor), out = [];
    switch (d.kind) {
      case 'count': {
        const key = FIELD_KEY[d.field], rec = active(name);
        out.push(stCell(rec, key));
        if (d.source === 'outpatient' || d.source === 'card') out.push(cardRef(card, [cardCell(card, 1, 0)]));
        else if (key === 'sot' || key === 'rdt') out.push(occRef(o => o.type === key && normKey(o.name) === normKey(name)));
        break;
      }
      case 'discharge_in_sched': out.push(stCell(gone(name) || active(name), 'admit')); if (/^평일/.test(d.sheet || '')) out.push(occRef(o => normKey(o.name) === normKey(name))); break;
      case 'discharge_notmarked': out.push(stCell(active(name), 'admit')); break;
      case 'discharge_stillactive': out.push(cardRef(card, [cardCell(card, 1, 0)]), stCell(gone(name), 'admit')); break;
      case 'card_nostatus': out.push(cardRef(card, [cardCell(card, 1, 0)])); break;
      case 'mismatch': {
        const e = card && card.entries.find(x => x.time === d.time && x.loc === d.loc);
        out.push(cardRef(card, [cardCell(card, 1, 0), e && e.locRef]));
        const g = ctx.gridEntries(i.floor).filter(x => x.time === d.time && x.loc === d.loc && x.ref);
        if (g.length) out.push({ group: 'grid', sheet: g[0].sheet, cells: [...new Set(g.map(x => x.ref))] });
        break;
      }
      case 'missing': {
        const g = ctx.gridEntries(i.floor).filter(x => x.time === d.time && x.loc === d.loc && normKey(x.name) === normKey(name) && x.ref);
        if (g.length) out.push({ group: 'grid', sheet: g[0].sheet, cells: [...new Set(g.map(x => x.ref))] });
        out.push(cardRef(card, [cardCell(card, 1, 0)]));
        break;
      }
      case 'sched_mismatch': case 'sched_missing': {
        const e = card && card.entries.find(x => x.time === d.time);
        out.push(occRef(o => normKey(o.name) === normKey(name) && o.timeKey === d.time && (d.kind === 'sched_mismatch' ? o.loc === d.scheduleLoc : o.loc === d.loc)));
        out.push(cardRef(card, [cardCell(card, 1, 0), e && e.locRef]));
        break;
      }
      case 'therapist': out.push(occRef(o => normKey(o.name) === normKey(name) && o.type === typeOf(d.kindLabel) && o.time === d.time && o.therapist === d.origin), cardRef(card, [cardCell(card, 1, 0)])); break;
      case 'room_mismatch': if (d.badStatus) out.push(stCell(active(name), 'room')); if (d.badCard) out.push(cardRef(card, [cardCell(card, 1, 6)])); break;
      case 'room_nopta': out.push(stCell(active(name), 'room')); break;
      case 'room_rm': for (const v of d.vals || []) { if (!v.bad) continue; if (v.name === '현황판') out.push(stCell(active(name), 'dept')); if (v.name === '전체시간표') out.push(cardRef(card, [cardCell(card, 5, 0)])); } break;
      default: break;
    }
    return out.filter(Boolean);
  }
  for (const i of issues) { try { const r = refsFor(i); if (r.length) i.refs = r; } catch (e) { /* 칸 주소를 못 찾아도 지시서는 그대로 나온다 */ } }
}
// 지시 항목의 group을 먼저 보여주고, 다른 파일의 칸은 파일 이름을 붙여서 뒤에: "현황(회복기) J45 · 평일시간표(원본) C12, F14"
function formatRefs(refs, group, labels) {
  return (refs || []).slice().sort((a, b) => (b.group === group) - (a.group === group))
    .map(r => `${r.group !== group && labels && labels[r.group] ? labels[r.group] + ' ' : ''}${r.sheet} ${r.cells.join(', ')}`).join(' · ');
}
const api = { attachRefs, formatRefs, colLetter };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
