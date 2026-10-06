// therapistview.js — 치료기록 QA "치료사별 한눈에": 이미 계산된 오류·미액팅 목록을 치료사 이름으로 모으고, 치료사에게 보낼 글을 만든다.
// 순수 함수만 있다(화면·파일 접근 없음). 원래 두 탭의 계산은 건드리지 않고, 그 결과를 읽어서 묶기만 한다.
// 브라우저: <script src="../core/therapistview.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
const UNKNOWN = '담당자 미상';
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').trim();

// 환자 이름 가운데 글자 가리기: 전영옥 → 전○○, 김도 → 김○ (첫 글자만 남김)
function maskName(name) {
  const s = String(name == null ? '' : name).trim(); if (!s) return s;
  const chars = [...s]; return chars[0] + '○'.repeat(Math.max(chars.length - 1, 0));
}

// issues: 오류확인 목록 [{therapist, patientName, time, orderName, type, severity}]
// missing: 미액팅 칸 목록 [{therapist, name(환자), type(치료 종류), timeSlot}]
// 반환: [{name, errors[], warns[], missing[]}] — 확인할 게 많은 치료사 먼저(오류+미액팅 내림차순, 같으면 이름순). 치료사가 없으면 "담당자 미상"으로 모은다.
function groupByTherapist({ issues = [], missing = [] }) {
  const map = new Map(), get = (raw) => { const k = norm(raw) || UNKNOWN; if (!map.has(k)) map.set(k, { name: k === UNKNOWN ? UNKNOWN : String(raw).trim(), errors: [], warns: [], missing: [] }); return map.get(k); };
  for (const i of issues) (i.severity === '오류' ? get(i.therapist).errors : get(i.therapist).warns).push(i);
  for (const m of missing) get(m.therapist).missing.push(m);
  const timeKey = (x) => String(x.time || x.timeSlot || '99:99');
  for (const r of map.values()) { r.errors.sort((a, b) => timeKey(a).localeCompare(timeKey(b))); r.warns.sort((a, b) => timeKey(a).localeCompare(timeKey(b))); r.missing.sort((a, b) => timeKey(a).localeCompare(timeKey(b))); }
  return [...map.values()].sort((a, b) => (b.errors.length + b.missing.length) - (a.errors.length + a.missing.length) || a.name.localeCompare(b.name, 'ko'));
}

// 치료사에게 보낼 글(기존 "카톡 공유용 텍스트"와 같은 모양: 날짜 / 항목별 제목 / "치료사-환자 처방(시간)" 줄). 항목이 없는 묶음은 빼고, 안내 문구는 기존 글의 첫 줄만 쓴다.
// opts: {dateLabel, mask(환자 이름 가리기), simplify(처방 이름 줄이는 함수)}
function buildMessage(r, opts = {}) {
  const nm = (n) => (opts.mask ? maskName(n) : n) || '환자명 미상', simp = opts.simplify || ((x) => x || '');
  const line = (x) => `${r.name}-${nm(x.patientName)} ${simp(x.orderName)}(${x.time || '시간 미상'})`;
  const isNote = (t) => /특이사항/.test(t || '');
  const all = r.errors.concat(r.warns), sections = [
    ['*치료시간 수정', all.filter(x => x.type === '시간 오류').map(line)],
    ['*특이사항 없음/수정', all.filter(x => isNote(x.type)).map(line)],
    ['*치료내용 없음', all.filter(x => x.type === '치료내용 누락').map(line)],
  ];
  const other = all.filter(x => x.type !== '시간 오류' && !isNote(x.type) && x.type !== '치료내용 누락');
  if (other.length) sections.push(['*기타 오류', other.map(x => `${line(x)} ${x.type}`)]);
  if (r.missing.length) sections.push(['<미액팅오류>', r.missing.map(m => `${r.name}-${nm(m.name)} ${m.type || ''}(${m.timeSlot || ''})`)]);
  const lines = [opts.dateLabel || '', `<${r.name} 선생님 확인 부탁드려요>`];
  sections.forEach(([title, list]) => { if (list.length) lines.push(title, ...list, ''); });
  if (lines.length <= 2) lines.push('확인할 항목이 없어요 👍', '');
  lines.push('✅ 꼭!!당일에 수정하시고 수정했다고 올려주세요.');
  return lines.join('\n');
}

const api = { UNKNOWN, maskName, groupByTherapist, buildMessage };
root.RehabCore = Object.assign(root.RehabCore || {}, { therapistView: api });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
