// outings.js — 메신저 DB에서 특정 날짜의 외진·외박·외출 명단만 읽는다(읽기 전용, outing_schedules 표 하나만).
// 열기 방식·안전장치는 reader.js(잇다와 같은 코드): 원본은 수정하지 않고, 필요하면 임시 복사본만 읽은 뒤 지운다.
'use strict';
const { openMessengerDb, checkCompat, readOutings, MessengerError } = require('./reader');

// 반환: { ok:true, rows:[{id,date,endDate,category,patient,reason,departureText,returnText,...}], mode } | { ok:false, code, message }
// 삭제·취소된 행은 뺀다(대체 시간표에서는 "지금 유효한 외출·외박"만 필요).
function outingsForDate(dbPath, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ok: false, code: 'BAD_DATE', message: '날짜 형식이 맞지 않아요.' };
  let h;
  try {
    h = openMessengerDb(dbPath);
    const compat = checkCompat(h.db);
    if (!compat.sources.outing.ok) return { ok: false, code: 'INCOMPAT', message: '메신저 버전이 달라 외출·외박 표를 읽을 수 없어요(' + compat.sources.outing.missing.join(', ') + ').' };
    const rows = readOutings(h.db, { fromDate: date, toDate: date }).filter((r) => !r.deleted && !r.cancelled);
    return { ok: true, rows, mode: h.mode };
  } catch (e) {
    return { ok: false, code: e instanceof MessengerError ? e.code : 'ERROR', message: e instanceof MessengerError ? e.message : '메신저 DB를 읽지 못했어요: ' + (e && e.message) };
  } finally {
    if (h) try { h.close(); } catch (e) { /* 이미 닫힘 */ }
  }
}

module.exports = { outingsForDate };
