// fixplan.js — 교차검증 불일치 → "수정 지시서" 항목 만들기(순수 함수).
// 이 모듈은 안내 문구만 만든다. 원본 파일을 읽거나 고치지 않는다(원본 불변 규칙).
// 항목 = {group, where, patient, room, floor, who, kind, action, basis}
//  group : 어느 파일을 고쳐야 하는지(status 작업치료현황 · card 전체시간표(원본) · grid 매트/테이블현황 · handover OT인수인계 · etc)
//  action: "무엇을 어떻게" 한 줄 지시 — 어느 쪽이 맞는지 알 수 없는 불일치는 "맞는 쪽을 확인해 다른 쪽을 고치세요" 형태로 두 방향을 모두 적는다.
//          기준이 정해진 경우(병실·주치의=PTA 재원현황, 퇴원=현황판)에는 고칠 쪽을 정해서 적는다.
//  who   : 고치거나 작성해야 할 사람을 데이터로 알 수 있을 때만(인수인계 작성자·시간표 치료사 등), 모르면 빈 문자열
// 브라우저: <script src="../core/fixplan.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
const GROUPS = {
  status: { label: '작업치료현황', sub: '현황(회복기) · 평일시간표(원본) · 토요일&공휴일 시간표 · 평가메인 시트' },
  card: { label: '전체시간표(원본)', sub: '3F·10F 환자 카드(입원/7병동/외래 시트)' },
  grid: { label: '매트·테이블현황', sub: '10F 매트·테이블현황 / 3F 매트·테이블현황' },
  handover: { label: 'OT 인수인계', sub: 'OT인수인계서(통합) — 작성·수정은 그 화면에서' },
  etc: { label: '기타 확인', sub: '' },
};
const GROUP_ORDER = ['status', 'card', 'grid', 'handover', 'etc'];
// 칸 주소 문구("현황(회복기) J45 · 평일시간표(원본) C12") — 항목의 group 쪽을 앞에, 다른 파일은 파일 이름을 붙여서
function cellTextFor(refs, group) {
  return (refs || []).slice().sort((a, b) => (b.group === group) - (a.group === group)).map(r => `${r.group !== group && GROUPS[r.group] ? GROUPS[r.group].label + ' ' : ''}${r.sheet} ${r.cells.join(', ')}`).join(' · ');
}
const uniq = (a) => [...new Set(a.filter(Boolean))];
const names = (s) => uniq(String(s || '').split(/[\/,·]/).map(x => x.trim()));
const fieldKo = (f) => ({ SOT: '작업(SOT)', RDT: '연하(RDT)', ERDT: '연하전기(ERDT)', CCRT: '전산화인지(CCRT)', 언어: '언어' }[f] || f);

// 한 이슈 → 지시 항목 배열(대부분 1개, PTA 기준 불일치는 고칠 쪽마다 1개)
function itemsFor(i) {
  const d = i.detail || {}, base = { patient: i.patient || '', room: i.room || d.room || '', floor: i.floor || d.floor || null, kind: i.title || '', issueId: i.id };
  const mk = (group, where, action, extra = {}) => ({ ...base, group, where, action, who: '', basis: '', ...extra });
  const timeTxt = (arr) => uniq((arr || []).map(e => e.time)).join(', ');
  switch (d.kind) {
    case 'count': {
      const f = fieldKo(d.field), who = d.source === 'outpatient' ? names(d.therapist).join(', ') : uniq((d.occurrences || []).map(o => o.therapist)).join(', ');
      if (d.source === 'outpatient') {
        const found = d.actual === '외래 카드에 있음';
        return [mk('status', '현황(회복기) ↔ 전체시간표(원본) 외래 시트',
          found ? `외래 카드엔 ${f} 일정이 있는데 현황엔 없어요 → 실제로 다니면 현황(회복기)에 ${f} 횟수를 입력하고, 아니면 외래 카드에서 ${f} 일정을 지우세요`
                : `현황엔 ${f} ${d.expected}회인데 외래 카드에서 못 찾았어요 → 다니는 게 맞으면 외래 카드에 일정을 추가하고, 아니면 현황의 ${f} 횟수를 고치세요`,
          { who, basis: `현황 ${d.expected}회 · 외래 카드 ${found ? '있음' : '없음'}` })];
      }
      const src = d.source === 'card' ? '전체시간표(원본) 카드' : '평일시간표(원본)', diff = Number(d.diff) || 0;
      const more = diff > 0 ? `${src}가 ${diff}회 더 많아요` : `현황이 ${-diff}회 더 많아요`;
      const fixA = diff > 0 ? `${src}에서 ${f} ${diff}회를 지우세요` : `${src}에 ${f} ${-diff}회를 추가하세요`;
      const fixB = `현황(회복기)의 ${f} 칸을 ${d.actual}회로 고치세요`;
      return [mk('status', `현황(회복기) '${f}' 칸 ↔ ${src}`, `${f} 횟수가 맞지 않아요(${more}) → 현황이 맞으면 ${fixA}, ${src}가 맞으면 ${fixB}`,
        { who, basis: `현황 ${d.expected}회 · 실제 ${d.actual}회 (${timeTxt(d.occurrences) || '시간표에 기록 없음'})` })];
    }
    case 'discharge_in_sched': {
      const times = timeTxt(d.entries);
      return [mk('status', `${d.sheet} ${times ? `(${times})` : ''}`, `현황판은 ${d.word}인데 ${d.sheet}에 이 환자가 남아 있어요 → 해당 시간 칸에서 환자 이름을 지우세요(계속 다니는 환자라면 대신 현황(회복기)의 입원 상태를 고치세요)`,
        { who: uniq((d.entries || []).map(e => e.therapist)).join(', '), basis: (d.entries || []).map(e => `${e.time} ${e.type}`).join(' · ') })];
    }
    case 'ccrt_issue': {
      const t = i.title || '';
      const act = /잔존/.test(t) ? '평일시간표(원본)의 인지치료(CCRT) 구역에서 이 환자를 지우세요(퇴원이 아니라면 현황(회복기) 상태를 고치세요)'
        : /못 찾음/.test(t) ? '전체시간표(원본)에 이 환자 카드가 있는지 확인하세요(퇴원이면 인지치료 구역의 배정을 지우세요)'
        : `전체시간표(원본) 카드의 ${d.day}요일 ${d.time} 칸에 인지치료를 표시하거나, 평일시간표(원본) CCRT 배정 요일을 고치세요`;
      return [mk('status', `평일시간표(원본) 인지치료 구역 · ${d.day}요일 ${d.time}`, act, { who: d.therapist || '', basis: d.verdict || '' })];
    }
    case 'discharge_notmarked':
      return [mk('status', '현황(회복기) 입원 열', '현황엔 입원 중인데 전체시간표(원본)에 카드가 없어요 → 퇴원했다면 현황(회복기)의 입원 열을 "퇴원"으로 바꾸고, 입원 중이라면 전체시간표(원본)에 카드를 추가하세요')];
    case 'discharge_stillactive':
      return [mk('card', `${d.floor || ''}F 입원 시트 › 환자 카드`, '현황엔 퇴원인데 전체시간표(원본)에 입원 카드가 남아 있어요 → 카드를 삭제하세요(외래로 계속 다니면 외래 시트로 옮기세요)')];
    case 'card_nostatus':
      if (d.outpatient) return [mk('status', '현황(회복기) 외래 행', '전체시간표(원본)엔 외래 카드가 있는데 현황에 이름이 없어요 → 외래로 치료받는 환자면 현황(회복기)에 외래로 등록하고, 아니면 외래 카드를 정리하세요')];
      return [mk('status', '현황(회복기) 행 추가', '전체시간표(원본)엔 입원 카드가 있는데 현황에 이름이 없어요 → 신환/재입원이면 현황(회복기)에 행을 추가하고, 이미 퇴원했다면 전체시간표(원본)에서 카드를 지우세요')];
    case 'mismatch':
      return [mk('card', `${d.floor}F 전체시간표(원본) › ${d.patient} 카드 › ${d.time} 치료위치 (${d.loc})`,
        `${d.time} ${d.loc} 자리가 서로 달라요 — 매트/테이블현황엔 "${d.gridNames}", 전체시간표엔 "${d.patient}" → 맞는 쪽에 맞춰 다른 쪽을 고치세요`, { basis: `매트/테이블: ${d.gridNames} · 전체시간표: ${d.patient}` })];
    case 'missing':
      return [mk('card', `${d.floor}F 전체시간표(원본) › ${d.patient} 카드 › ${d.time} 치료위치 (${d.loc})`,
        `${d.time} ${d.loc} 자리 — 매트/테이블현황엔 "${d.patient}", 전체시간표엔 기록 없음 → 전체시간표 카드에 이 시간·위치를 입력하거나, 매트/테이블현황에서 지우세요`, { basis: `${d.time} ${d.loc}` })];
    case 'sched_mismatch':
      return [mk('card', `${d.sourceLabel || '평일시간표(원본)'} ↔ 전체시간표(원본) 카드 · ${d.time}`,
        `${d.time} 치료 위치가 달라요 — ${d.sourceLabel || '평일시간표(원본)'} "${d.scheduleLoc}" / 전체시간표 "${d.cardLoc}" → 맞는 쪽에 맞춰 다른 쪽을 고치세요`, { basis: `${d.scheduleLoc} ↔ ${d.cardLoc}` })];
    case 'sched_missing':
      return [mk('card', `${d.sourceLabel || '평일시간표(원본)'} ↔ 전체시간표(원본) 카드 · ${d.time}`,
        `${d.sourceLabel || '평일시간표(원본)'}엔 ${d.time} "${d.loc}" 배정이 있는데 전체시간표 카드에 이 시간이 없어요 → 카드에 입력하거나 시간표 배정을 지우세요`, { basis: `${d.time} ${d.loc}` })];
    case 'sat_missing':
      return [mk('status', `토요일&공휴일 시간표 · ${d.time}`, '토요일 시간표에 배정이 있는데 전체시간표(원본)에 이 환자 카드가 없어요 → 퇴원했다면 토요일 시간표에서 지우고, 아니면 카드/이름 표기를 확인하세요', { who: d.therapist || '', basis: `${d.time} ${d.therapist || ''}` })];
    case 'sat_rule':
      return [mk('status', `토요일&공휴일 시간표 · ${d.time}`, `회복기가 아닌 환자가 토요일에 ${d.type === 'rdt' ? '연하(RDT)' : '작업(SOT)'} 치료(${d.code || '-'})로 배정돼 있어요 → 연하·전기치료로 바꾸거나 배정을 지우세요(회복기 환자라면 현황(회복기)에 등재됐는지 확인)`, { who: d.therapist || '', basis: `${d.time} ${d.code || ''}` })];
    case 'therapist':
      return [mk('card', `${d.kindLabel}${d.day ? ` · ${d.day}요일` : ''} ${d.time}`, `담당 치료사 이름이 달라요 — 평일시간표(원본) "${d.origin}" / 전체시간표 카드 "${d.expected}" → 맞는 쪽에 맞춰 다른 쪽을 고치세요`, { who: uniq([d.origin, ...names(d.expected)]).join(', '), basis: `${d.origin} ↔ ${d.expected}` })];
    case 'handover_therapist': {
      const noSched = /배정 없음/.test(d.schedTherapists || '');
      return [mk('handover', `${d.type} 기록`, noSched ? `인수인계에 ${d.type} 담당 "${d.handoverTherapist}" 기록은 있는데 평일시간표엔 배정이 없어요 → 시간표 배정을 확인하고, 틀렸다면 인수인계 기록을 정리하세요`
        : `${d.type} 담당이 달라요 — 인수인계 "${d.handoverTherapist}" / 평일시간표 "${d.schedTherapists}" → 인수인계 담당을 고치거나, 시간표 배정이 바뀐 것이면 시간표를 고치세요`, { who: d.handoverTherapist, basis: `${d.handoverTherapist} ↔ ${d.schedTherapists}` })];
    }
    case 'handover_orphan':
      return [mk('handover', `${d.type} 기록`, `인수인계에만 있고 평일시간표·전체시간표에 근거가 없어요 → 퇴원·종결이면 인수인계 기록을 정리하고, 아니면 시간표를 확인하세요`, { who: d.handoverTherapist, basis: `작성 ${d.handoverTherapist}` })];
    case 'handover_excess':
      return [mk('handover', `${d.type} 기록`, `작성자(${d.writerCount}명)가 실제 배정(${d.realCount}명)보다 많아요 → 실제 배정에 없는 작성자(${(d.extra || []).join(', ')})의 기록은 정리하거나, 담당이 바뀐 것이면 시간표를 확인하세요`,
        { who: (d.extra || []).join(', '), basis: `작성자 ${(d.writers || []).join(', ')} · 실제 ${(d.realTherapists || []).join(', ') || '없음'}` })];
    case 'handover_doctor':
      return [mk('handover', '주치의(RM) 칸', `주치의가 달라요 — 인수인계 "${d.handoverDoctor}"${(d.writers || []).length ? `(${d.writers.join('·')} 기록)` : ''} / 전체시간표 "${d.cardDoctor}" → 맞는 쪽에 맞춰 다른 쪽을 고치세요`, { basis: `${d.handoverDoctor} ↔ ${d.cardDoctor}` })];
    case 'handover_notype':
      return (d.items || []).map(x => mk('handover', `${x.label} 기록 추가`, `현황엔 ${x.label} ${x.count}회인데 인수인계에 ${x.label} 기록이 없어요 → 담당 치료사가 인수인계를 작성하세요`,
        { who: (x.therapists || []).join(', '), basis: `현황 ${x.label} ${x.count}회` }));
    case 'handover_nowriter':
      return (d.items || []).map(x => mk('handover', `${x.label} 기록`, `평일시간표에 ${x.label} 담당(${x.therapist})인데 인수인계에 ${x.therapist} 선생님이 쓴 기록이 없어요${x.none ? '(이 치료의 인수인계가 아직 없음)' : ''} → 담당 치료사가 작성하세요(담당이 바뀐 것이면 시간표를 고치세요)`, { who: x.therapist, basis: `시간표 담당 ${x.therapist}` }));
    case 'handover_notx':
      return (d.items || []).map(x => mk('handover', `${x.label} 기록의 Tx(치료내용)`, `인수인계 ${x.label} 기록의 Tx(치료내용)가 비어 있어요 → 담당 치료사가 Tx를 작성하세요`, { who: x.therapist || '', basis: `${x.label} · 작성자 ${x.therapist || '확인 필요'}` }));
    case 'eval_missing':
      return [mk('status', '평가메인 시트 ↔ 평일시간표(원본) 볼드', '평일시간표(원본)엔 볼드(평가)인데 평가메인에 이름이 없어요 → 평가메인 시트에 환자를 추가하거나, 평가가 아니라면 시간표의 볼드를 해제하세요')];
    case 'eval_extra':
      return [mk('status', '평가메인 시트 ↔ 평일시간표(원본) 볼드', '평가메인엔 있는데 평일시간표(원본)에 볼드 표시가 없어요 → 시간표 칸을 볼드로 바꾸거나, 평가메인에서 이 환자를 지우세요')];
    case 'eval_dup':
      return [mk('status', '평가메인 시트', `같은 이름이 평가메인에 ${d.count}번 있어요 → 중복이면 한 줄만 남기세요(현황판에 같은 이름이 ${d.sameNameInStatus}명이면 동명이인인지 확인)`, { basis: (d.places || []).map(p => `${p.time || '?'}${p.therapist ? '·' + p.therapist : ''}`).join(' / '), who: uniq((d.places || []).map(p => p.therapist)).join(', ') })];
    case 'eval_noeval':
      return [mk('status', '평가메인 시트', `현황판은 ${d.admit}인데 평가메인에 이름이 없어요 → 평가 대상이면 평가메인에 추가하세요`)];
    case 'room_mismatch': {
      const out = [];
      if (d.badStatus) out.push(mk('status', '현황(회복기) 병실 열', `병실이 PTA(${d.pta.room}호)와 달라요 → 현황(회복기)의 병실을 ${d.pta.room}로 고치세요${d.ambiguous ? ' (PTA에 같은 이름이 여러 명이라 환자 확인 필요)' : ''}`, { basis: `PTA ${d.pta.room} · 현황 ${d.statusRoom}` }));
      if (d.badCard) out.push(mk('card', '카드 병실 칸', `병실이 PTA(${d.pta.room}호)와 달라요 → 전체시간표(원본) 카드의 병실을 ${d.pta.room}로 고치세요${d.ambiguous ? ' (PTA에 같은 이름이 여러 명이라 환자 확인 필요)' : ''}`, { basis: `PTA ${d.pta.room} · 카드 ${d.cardRoom}` }));
      return out;
    }
    case 'room_nopta':
      return [mk('status', '현황(회복기) 상태', 'PTA 재원현황에서 이 환자를 못 찾았어요(매칭 불가) → 퇴원·전원했다면 현황(회복기)·전체시간표에서 정리하고, 이름 표기만 다르면 PTA 표기와 맞추세요', { basis: `현황 ${d.statusRoom || '-'} · 카드 ${d.cardRoom || '-'}` })];
    case 'room_rm':
      return (d.vals || []).filter(v => v.bad).map(v => {
        const g = v.name === '현황판' ? 'status' : v.name === '전체시간표' ? 'card' : 'handover';
        return mk(g, v.name === '현황판' ? '현황(회복기) 진료과 열' : v.name === '전체시간표' ? '카드 주치의(RM) 칸' : '주치의 칸', `주치의(RM)가 PTA(${d.pta})와 달라요 → ${v.name}의 주치의를 ${d.pta}로 고치세요`, { basis: `PTA ${d.pta} · ${v.name} ${v.value}` });
      });
    case 'room_ptaonly':
      return [mk('status', '현황(회복기) 행 추가 + 카드 확인', `PTA엔 재활 코드(${(d.codes || []).join('/')})가 있는 입원 환자인데 현황·카드에 없어요${d.statusState ? `(현황엔 ${d.statusState})` : ''} → 신환·재입원이면 현황(회복기)에 등록하고 전체시간표(원본)에 카드를 추가하세요(재활 대상이 아닌 코드면 무시)`, { basis: `PTA 재활 ${(d.codes || []).join('/')}` })];
    default:
      return [mk('etc', '', `확인 필요: ${i.title || ''}${i.line ? ' — ' + i.line : ''}`)];
  }
}

function buildFixItems(issues) {
  const items = [];
  for (const i of issues || []) for (const it of itemsFor(i)) { it.cellText = cellTextFor(i.refs, it.group); items.push(it); }
  const gi = (g) => GROUP_ORDER.indexOf(g);
  items.sort((a, b) => gi(a.group) - gi(b.group) || (a.floor || 99) - (b.floor || 99) || String(a.room).localeCompare(String(b.room), 'ko', { numeric: true }) || String(a.patient).localeCompare(String(b.patient), 'ko'));
  items.forEach((it, n) => { it.no = n + 1; });
  return items;
}

// 카톡/메모에 붙여 쓰는 텍스트: 파일별 → 환자별. who가 있으면 "(담당: …)"을 붙인다.
function fixItemsToText(items, { title = '교차검증 수정 지시서', date = '' } = {}) {
  const lines = [`${title}${date ? ' · ' + date : ''}`, `총 ${items.length}건 — 원본 파일은 이 프로그램이 바꾸지 않아요. 아래를 보고 직접 고쳐 주세요.`, ''];
  for (const g of GROUP_ORDER) {
    const list = items.filter(x => x.group === g); if (!list.length) continue;
    lines.push(`■ ${GROUPS[g].label} (${list.length}건)`);
    for (const x of list) lines.push(`${x.no}. ${x.floor ? x.floor + 'F ' : ''}${x.room ? x.room + '호 ' : ''}${x.patient} — ${x.action}${x.cellText ? ` [칸: ${x.cellText}]` : ''}${x.who ? ` (담당: ${x.who})` : ''}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

// 치료사(담당자)별로 보낼 글: 항목의 who(쉼표로 여러 명일 수 있음)마다 그 사람 몫만 모아 "<이름 선생님 확인 부탁드려요>" 형식으로 만든다.
// who를 모르는 항목은 빠진다. opts: {date, mask(환자 이름 가리는 함수, 없으면 그대로)}. 반환: [{who, count, text}] — 많은 순.
function fixItemsToWhoMessages(items, { date = '', mask = null } = {}) {
  const byWho = new Map();
  for (const x of items || []) for (const w of String(x.who || '').split(/\s*,\s*/).filter(Boolean)) { if (!byWho.has(w)) byWho.set(w, []); byWho.get(w).push(x); }
  const nm = (n) => (mask ? mask(n) : n);
  return [...byWho.entries()].map(([who, list]) => {
    const lines = [date, `<${who} 선생님 확인 부탁드려요>`];
    for (const g of GROUP_ORDER) {
      const part = list.filter(x => x.group === g); if (!part.length) continue;
      lines.push(`■ ${GROUPS[g].label}`);
      for (const x of part) lines.push(`- ${x.floor ? x.floor + 'F ' : ''}${x.room ? x.room + '호 ' : ''}${nm(x.patient)} — ${x.action}${x.cellText ? ` [칸: ${x.cellText}]` : ''}`);
    }
    lines.push('', '✅ 확인하고 고친 뒤 수정했다고 알려 주세요.');
    return { who, count: list.length, text: lines.filter((l, i) => l !== '' || i > 1).join('\n') };
  }).sort((a, b) => b.count - a.count || a.who.localeCompare(b.who, 'ko'));
}

const api = { FIX_GROUPS: GROUPS, FIX_GROUP_ORDER: GROUP_ORDER, buildFixItems, fixItemsToText, fixItemsToWhoMessages };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
