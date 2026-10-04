// parsers_saturday.js — 작업치료현황 "토요일&공휴일 시간표" 읽기(메인 표·ERDT 구역). 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_saturday.js"> (xlsx-reader.js, normalize.js, parsers_weekday.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); require('./parsers_weekday.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, likelyTherapistName, extractPatientAssignment, extractLocationFromRaw, extractCodeToken, extractLowerName, timeStart } = root.RehabCore;
function parseSaturdayErdtSection(cells){
  let labelRef=null;
  for(const [ref,val] of cells.entries()){
    if(normalizeText(val).replace(/\s+/g,'')==='ERDT'){ const rc=splitRef(ref); if(rc && rc.row<=3){ labelRef=rc; break; } }
  }
  if(!labelRef) return [];
  const timeCol=labelRef.col;
  const headerRow=labelRef.row+1;
  const therapistCols=[];
  for(let c=timeCol+1;c<=timeCol+30;c++){
    if(normalizeText(getCell(cells,headerRow,c)).replace(/\s+/g,'')==='치료사') therapistCols.push(c);
  }
  if(!therapistCols.length) return [];
  const blocks=[];
  for(let i=0;i<therapistCols.length;i++){
    const tCol=therapistCols[i];
    const nextT=therapistCols[i+1] || (tCol+20);
    const slots=[];
    for(let c=tCol+1;c<nextT;c++){
      const lbl=normalizeText(getCell(cells,headerRow,c)).replace(/\s+/g,'');
      if(/^S\d+$/i.test(lbl)) slots.push({col:c, label:lbl.toUpperCase()});
    }
    blocks.push({tCol, slots});
  }
  let endRow=headerRow;
  for(let r=headerRow+1;r<=headerRow+20;r++){
    if(normalizeText(getCell(cells,r,timeCol))==='') break;
    endRow=r;
  }
  const out=[];
  for(let r=headerRow+1;r<=endRow;r++){
    const timeRaw=getCell(cells,r,timeCol);
    const time=normalizeText(timeRaw);
    const timeKey=timeStart(timeRaw);
    if(!/^\d{1,2}:\d{2}$/.test(timeKey)) continue; // 점심시간 등 제외
    for(const block of blocks){
      const therapist=normalizeText(getCell(cells,r,block.tCol));
      for(const sc of block.slots){
        const nm=extractLowerName(getCell(cells,r,sc.col));
        if(!nm) continue;
        out.push({name:nm, type:'erdt', therapist, therapistCol:block.tCol, time, timeKey, loc:'', code:'', slot:sc.label});
      }
    }
  }
  return out;
}
async function parseSaturdayScheduleSheet(book){
  const sh = book.sheets.find(s=>/토요일/.test(s.name) && /공휴일/.test(s.name));
  if(!sh) return [];
  const cells = await getSheetCells(book, sh.name);
  if(!cells || !cells.size) return [];
  let header=null;
  for(const [ref,val] of cells.entries()){
    if(normalizeText(val).replace(/\s+/g,'')!=='치료시간') continue;
    const rc=splitRef(ref); if(rc && rc.row<=4 && (!header || rc.row<header.row)) header=rc;
  }
  if(!header) return [];
  const therapistRow=header.row; // 평일시간표(원본)와 달리 헤더와 같은 행에 치료사 이름이 있다
  const startRow=header.row+1;
  let endRow=startRow-1;
  for(let r=startRow;r<=startRow+30;r++){
    if(normalizeText(getCell(cells,r,header.col))==='') break;
    endRow=r;
  }
  const therapistCols=[];
  for(let c=header.col+1;c<=header.col+60;c++){
    const v=getCell(cells,therapistRow,c);
    const nv=normalizeText(v).replace(/\s+/g,'');
    if(likelyTherapistName(v) && nv!=='추가') therapistCols.push({col:c,name:nv});
  }
  const occ=[];
  for(const tc of therapistCols){
    for(let r=startRow;r<=endRow;r++){
      const raw=getCell(cells,r,tc.col); const asn=extractPatientAssignment(raw); if(!asn||asn.type==='skip') continue;
      const time=normalizeText(getCell(cells,r,header.col));
      occ.push({name:asn.name, type:asn.type, therapist:tc.name, therapistCol:tc.col, time, timeKey:timeStart(time), loc:extractLocationFromRaw(raw), code:extractCodeToken(raw), row:r});
    }
  }
  occ.push(...parseSaturdayErdtSection(cells));
  return occ;
}

const api = { parseSaturdayErdtSection, parseSaturdayScheduleSheet };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
