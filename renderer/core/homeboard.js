// homeboard.js — 홈 현황판이 쓰는 계산(순수 함수): 작업치료현황(parseStatusSheet 결과) → 입퇴원·회복기 종료 임박 명단.
// 브라우저: <script src="core/homeboard.js"> / Node: require() (테스트용)
'use strict';
(function (root) {
  const serialOf = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) + 25569; // 엑셀 날짜 일련번호
  const mdOf = (n) => { const t = new Date(Date.UTC(1899, 11, 30) + n * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  // 병동은 병실 앞자리: 502→5, 1003→10 (그랜드라운딩·익일시간표와 같은 규칙)
  const wardOf = (room) => { const r = String(room || '').replace(/\D/g, ''); return r ? (r.length >= 4 ? r.slice(0, 2) : r.slice(0, 1)) : ''; };
  const IN = (x) => x.admit === '입원' || x.admit === '재입원';

  // 특이사항의 마지막 "M/D 퇴원(오전O)" → {offset(오늘=0), text}. 그 뒤에 재입원·복귀가 있으면 이미 돌아온 것이라 없음. 지난 날짜는 퇴원 예정이 아님.
  function dischargeOf(note, today) {
    const re = /(\d{1,2})\s*\/\s*(\d{1,2})\s*퇴원\s*(?:\(([^)]*)\))?/g; let m, last = null;
    while ((m = re.exec(String(note || '')))) last = { m: +m[1], d: +m[2], text: m[3] || '', end: re.lastIndex };
    if (!last || /재입원|복귀/.test(String(note).slice(last.end))) return null;
    let y = today.getFullYear(); if (new Date(y, last.m - 1, last.d) < new Date(y, today.getMonth(), today.getDate() - 270)) y++;
    const off = serialOf(new Date(y, last.m - 1, last.d)) - serialOf(today);
    return off >= 0 ? { off, text: last.text } : null;
  }

  // list: parseStatusSheet().list, today: Date
  function summarize(list, today) {
    const t = serialOf(today), inp = list.filter(IN), mk = (x) => ({ name: x.name, room: x.room, ward: wardOf(x.room), gubun: x.gubun || '', dept: x.dept || '' });
    const adm = [], dis = [], ending = [];
    for (const x of inp) {
      if (x.admDate != null && x.admDate - t >= 0 && x.admDate - t <= 1) adm.push({ ...mk(x), off: x.admDate - t });
      const d = dischargeOf(x.note, today); if (d && d.off <= 1) dis.push({ ...mk(x), off: d.off, text: d.text });
      if (x.endDate != null && x.gubun !== '일반') ending.push({ ...mk(x), admDate: x.admDate, endDate: x.endDate, left: x.endDate - t });
    }
    ending.sort((a, b) => a.left - b.left || a.room.localeCompare(b.room));
    return { total: inp.length, adm, dis, ending, soon: ending.filter(e => e.left <= 14).length };
  }
  // 평가(TEST) 표시 대조: 작업치료실 시간표의 그날 시트(「10월16일(금)」)를 찾고, 환자 이름이 든 칸에 "TEST"가 적혀 있는지 본다.
  // ponytail: 이름은 글자 포함 비교라 「김영미」가 「김영미B」 칸에도 걸린다(조 표시 구분은 하지 않음) — 동명이인이 늘면 정확히 비교
  // 시트 이름의 (요일)이 날짜의 요일과 다르면 작년 시트라서 건너뛴다(12월31일 (수) 같은 해 넘어가는 이름)
  const sheetFor = (sheetNames, iso) => { const [y, m, d] = iso.split('-').map(Number), wk = '일월화수목금토'[new Date(y, m - 1, d).getDay()]; let hit = ''; for (const n of sheetNames) { const x = /^\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:\(\s*([일월화수목금토])\s*\))?/.exec(n); if (x && +x[1] === m && +x[2] === d && (!x[3] || x[3] === wk)) hit = n; } return hit; };
  const testState = (texts, name) => { const hits = texts.filter(t => t.replace(/\s+/g, '').includes(String(name).replace(/\s+/g, ''))); return !hits.length ? 'missing' : hits.some(t => /test/i.test(t)) ? 'ok' : 'notest'; };
  const md = (n) => { const o = mdOf(n); return `${o.m}/${o.d}`; };
  const api = { serialOf, wardOf, dischargeOf, summarize, sheetFor, testState, md };
  root.RehabCore = Object.assign(root.RehabCore || {}, { homeboard: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
