// parsers_handover.js — OT 인수인계(엑셀 업로드/실시간 조회 응답) 목록 만들기와 환자·치료 종류 색인. 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_handover.js"> (xlsx-reader.js, normalize.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, normKey, normDoctor } = root.RehabCore;
// 치료종류 글자 → sot/rdt/ccrt. ERDT(연하전기)는 교차검증 대상이 아니라 비워 둔다(안 그러면 "RDT"가 들어 있어 RDT로 잘못 잡힘).
function handoverType(raw){
  return /(?<!E)RDT/i.test(raw) ? 'rdt' : /CCRT/i.test(raw) ? 'ccrt' : /SOT/i.test(raw) ? 'sot' : '';
}
async function parseHandoverSheet(book){
  const sh = book.sheets.find(s=>/인수인계/.test(s.name)) || book.sheets[0];
  if(!sh) return [];
  const cells = await getSheetCells(book, sh.name);
  if(!cells || !cells.size) return [];
  let headerRow=null;
  for(const [ref,val] of cells.entries()){
    if(normalizeText(val)==='환자성함'){ const rc=splitRef(ref); if(rc){ headerRow=rc.row; break; } }
  }
  if(headerRow==null) return [];
  const headerMap={};
  for(let c=1;c<=20;c++){ const v=normalizeText(getCell(cells,headerRow,c)); if(v) headerMap[v]=c; }
  const nameCol=headerMap['환자성함'], therCol=headerMap['치료사'], doctorCol=headerMap['주치의'], typeCol=headerMap['치료종류'];
  if(!nameCol) return [];
  let maxRow=headerRow; for(const ref of cells.keys()){ const rc=splitRef(ref); if(rc && rc.row>maxRow) maxRow=rc.row; }
  const list=[];
  for(let r=headerRow+1;r<=maxRow;r++){
    const name=normalizeText(getCell(cells,r,nameCol)); if(!name) continue;
    const therapist=therCol?normalizeText(getCell(cells,r,therCol)):'';
    const doctor=doctorCol?normDoctor(getCell(cells,r,doctorCol)):'';
    const typeRaw=typeCol?normalizeText(getCell(cells,r,typeCol)):'';
    const type = handoverType(typeRaw);
    list.push({name, therapist, doctor, type, row:r});
  }
  return list;
}
function handoverListFromLiveRecords(records){
  const list=[];
  for(const r of records){
    const name=normalizeText(r.name||''); if(!name) continue;
    const therapist=normalizeText(r.therapist||'');
    const doctor=normDoctor(r.doctor||'');
    const typeRaw=normalizeText(r.type||'');
    const type = handoverType(typeRaw);
    list.push({name, therapist, doctor, type, row:0});
  }
  return list;
}
function buildHandoverIndex(list){
  const map=new Map(); // normKey(name)+'|'+type -> 최신 항목
  for(const e of list){
    if(!e.type) continue;
    const key=normKey(e.name)+'|'+e.type;
    if(!map.has(key)) map.set(key, e); // 파일이 최신순 정렬이라 먼저 나온 것이 최신
  }
  return map;
}

const api = { handoverType, parseHandoverSheet, handoverListFromLiveRecords, buildHandoverIndex };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
