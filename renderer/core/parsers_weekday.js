// parsers_weekday.js — 작업치료현황 "평일시간표(원본)" 읽기(메인 표·ERDT/CCRT 하위 구역·볼드) + "평가메인" 시트 이름 읽기 + 위치/시간 문자열 정규화. 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_weekday.js"> (xlsx-reader.js, normalize.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, getSheetBoldRefs, normKey, excelTimeToHHMM, numToCol } = root.RehabCore;
function likelyTherapistName(v){
  const s=normalizeText(v).replace(/\s+/g,'');
  if(!/^[가-힣]{2,6}$/.test(s)) return false;
  return !/^(빈타임|치료시간|평가메인|연하치료|점심시간|팀구분|퇴원예정자|환자특이사항|치료사)$/.test(s);
}
function extractPatientAssignment(raw){
  const r=normalizeText(raw); if(!r) return null;
  const first=r.split('\n')[0].trim();
  if(/CCRT|ERDT|BETTER|COMCOG|육아휴직|휴직|회의|교육|점심|치료실|빈타임|근무|VAC|OFF|외래|평가/i.test(first)) return null;
  let isE=/(?:^|\s)E(?:$|\s)/i.test(first);
  let isR=/(?:^|\s)R(?:$|\s)/i.test(first);
  let name=first.replace(/\s+(?:ST|SM|SB|R|E|NWB|PWB|TEST)\b.*$/i,'').replace(/(?:ST|SM|SB|TEST)$/i,'').trim();
  name=name.replace(/[^가-힣A-Za-z0-9]/g,'');
  if(!isR && !isE && /^[가-힣]{2,6}R$/.test(name)){ isR=true; name=name.slice(0,-1); } // 공백없이 붙은 'R' 오기 보정
  if(!/^[가-힣]{2,6}[A-Za-z0-9]{0,2}$/.test(name)) return null;
  if(isE) return {name, type:'skip'};
  if(isR) return {name, type:'rdt'};
  return {name, type:'sot'};
}
function extractLocationFromRaw(raw){
  const lines=normalizeText(raw).split('\n');
  if(lines.length<2) return '';
  return normLoc(lines[1]);
}
function extractCodeToken(raw){
  // 이름 뒤에 붙는 ST/SM/SB/R 코드만 뽑는다(MSK 등은 대상 아님 — 신경쓰지 않아도 되는 코드)
  const first=normalizeText(raw).split('\n')[0].trim();
  const m=/(?:^|\s)(ST|SM|SB|R)(?:\s|$)/i.exec(first);
  return m ? m[1].toUpperCase() : '';
}
async function parseMainTable(cells, boldRefs){
  let header=null;
  for(const [ref,val] of cells.entries()){
    if(normalizeText(val).replace(/\s+/g,'')!=='치료시간') continue;
    const rc=splitRef(ref); if(rc && rc.row<=6 && (!header || rc.row<header.row)) header=rc;
  }
  if(!header) throw new Error('평일시간표(원본)에서 "치료시간" 헤더를 찾지 못했습니다.');
  const therapistRow=header.row+1, startRow=therapistRow+1;
  let endRow=startRow+20;
  for(let r=startRow;r<=startRow+25;r++){
    const marker=normalizeText(getCell(cells,r,header.col)).replace(/\s+/g,'');
    if(marker==='빈타임'||marker==='평가메인'||marker==='연하치료'){ endRow=r-1; break; }
  }
  const floorSplitCol = (()=>{
    for(const [ref,val] of cells.entries()){ if(/3층\s*치료실/.test(normalizeText(val))){ const rc=splitRef(ref); if(rc) return rc.col; } }
    return null;
  })();
  const therapistCols=[];
  for(let c=header.col+1;c<=header.col+70;c++){
    const v=getCell(cells,therapistRow,c);
    if(likelyTherapistName(v)) therapistCols.push({col:c,name:normalizeText(v).replace(/\s+/g,''), floor: (floorSplitCol && c>=floorSplitCol)?3:10});
  }
  const occ=[];
  for(const tc of therapistCols){
    for(let r=startRow;r<=endRow;r++){
      const raw=getCell(cells,r,tc.col); const asn=extractPatientAssignment(raw); if(!asn||asn.type==='skip') continue;
      const time=normalizeText(getCell(cells,r,header.col));
      const ref=numToCol(tc.col)+r;
      occ.push({name:asn.name, type:asn.type, therapist:tc.name, therapistCol:tc.col, floor:tc.floor, time, timeKey:timeStart(time), loc:extractLocationFromRaw(raw), code:extractCodeToken(raw), bold: !!(boldRefs && boldRefs.has(ref)), row:r});
    }
  }
  return occ;
}
function findLowerSections(cells){
  const out=[];
  for(const [ref,val] of cells.entries()){
    const s=normalizeText(val).replace(/\s+/g,''); const rc=splitRef(ref); if(!rc||rc.row<20) continue;
    let kind=null;
    if(/^10F\)?ERDT$/.test(s)) kind='10F_ERDT'; else if(/^10F\)?CCRT$/.test(s)) kind='10F_CCRT';
    else if(/^3F\)?ERDT$/.test(s)) kind='3F_ERDT'; else if(/^3F\)?BETTER$/.test(s)) kind='3F_BETTER'; else if(/^3F\)?COMCOG$/.test(s)) kind='3F_COMCOG';
    if(!kind) continue; out.push({kind, row:rc.row, col:rc.col});
  }
  return out;
}
function parseSectionHeader(cells, labelRow, labelCol){
  // 일부 시트(예: "3F) BETTER")는 "치료시간" 글자 자체가 비어있는 서식 오류가 있어
  // "치료시간" 텍스트가 아니라 "치료사" 텍스트를 기준으로 헤더 행을 찾는다.
  // 치료시간 열은 항상 구분 라벨(예: "3F) BETTER")과 같은 열에서 시작한다.
  let headerRow=0, therapistCol=0;
  for(let r=labelRow+1;r<=labelRow+3;r++){
    for(let c=labelCol; c<=labelCol+10; c++){
      if(normalizeText(getCell(cells,r,c)).replace(/\s+/g,'')==='치료사'){ headerRow=r; therapistCol=c; break; }
    }
    if(headerRow) break;
  }
  if(!headerRow) return null;
  const timeCol=labelCol;
  const subCols=[];
  for(let c=therapistCol+1; c<=therapistCol+8; c++){ const v=normalizeText(getCell(cells,headerRow,c)).replace(/\s+/g,''); if(/^S\d$/.test(v) || ['월','화','수','목','금'].includes(v)) subCols.push({col:c,label:v}); }
  if(!subCols.length) return null;
  return {headerRow, timeCol, therapistCol, subCols, style: /^S\d$/.test(subCols[0].label)?'slot':'weekday'};
}
function extractLowerName(raw){
  const first=normalizeText(raw).split('\n')[0].trim(); if(!first) return '';
  if(/CCRT|ERDT|BETTER|COMCOG|점심|치료시간|치료사/i.test(first)) return '';
  const cleaned=first.replace(/[^가-힣A-Za-z0-9]/g,'');
  if(!/^[가-힣]{2,6}[A-Za-z0-9]{0,2}$/.test(cleaned)) return '';
  return cleaned;
}
function dayCountFromRaw(raw){ const lines=normalizeText(raw).split('\n'); if(lines.length<2) return 5; const days=(lines[1].match(/[월화수목금]/g)||[]); return days.length?days.length:5; }
function daysFromRaw(raw){ const lines=normalizeText(raw).split('\n'); if(lines.length<2) return []; return lines[1].match(/[월화수목금]/g)||[]; }
async function parseLowerAll(cells){
  const sections=findLowerSections(cells);
  const erdt=[], ccrt=[];
  for(const sec of sections){
    const parsed=parseSectionHeader(cells, sec.row, sec.col); if(!parsed) continue;
    const floor = sec.kind.startsWith('10F')?10:3;
    for(let r=parsed.headerRow+1; r<=parsed.headerRow+20; r++){
      for(const sc of parsed.subCols){
        const raw=getCell(cells,r,sc.col); const nm=extractLowerName(raw); if(!nm) continue;
        const therapist=normalizeText(getCell(cells,r,parsed.therapistCol)).replace(/\s+/g,'');
        const time=normalizeText(getCell(cells,r,parsed.timeCol));
        if(parsed.style==='slot'){ erdt.push({kind:sec.kind, floor, name:nm, count:dayCountFromRaw(raw), days:daysFromRaw(raw), therapist, time, timeKey:timeStart(time), slot:sc.label}); }
        else { ccrt.push({kind:sec.kind, floor, name:nm, day:sc.label, therapist, time, timeKey:timeStart(time)}); }
      }
    }
  }
  return {erdt, ccrt};
}
async function buildScheduleData(book){
  const sh=findScheduleSheet(book);
  if(!sh) throw new Error('"평일시간표(원본)" 시트를 찾지 못했습니다.');
  const cells=await getSheetCells(book, sh.name);
  const boldRefs=await getSheetBoldRefs(book, sh.name);
  const occ=await parseMainTable(cells, boldRefs);
  const lower=await parseLowerAll(cells);
  return {occ, erdt:lower.erdt, ccrt:lower.ccrt};
}
function findScheduleSheet(book){
  return book.sheets.find(s=>normalizeText(s.name).replace(/\s+/g,'')==='평일시간표(원본)');
}
async function parseEvalMainNames(book){
  const sh = book.sheets.find(s=>/평가\s*메인/.test(s.name));
  if(!sh) return null; // 시트가 없으면 검증 불가(null)
  const cells = await getSheetCells(book, sh.name);
  if(!cells || !cells.size) return new Set();
  let occ=[];
  try{ occ = await parseMainTable(cells); }catch(e){ return new Set(); }
  const names=new Set();
  for(const o of occ) names.add(normKey(o.name));
  return names;
}
async function parseEvalMainOccurrences(book){
  const sh = book.sheets.find(s=>/평가\s*메인/.test(s.name));
  if(!sh) return null;
  const cells = await getSheetCells(book, sh.name);
  if(!cells || !cells.size) return [];
  try{ return await parseMainTable(cells); }catch(e){ return []; }
}
function normLoc(raw){
  const s=normalizeText(raw).replace(/\n/g,' ');
  const m=/^([가-힣A-Za-z]+)\s*-\s*0*(\d+)/.exec(s);
  return m?`${m[1]}-${m[2]}`:'';
}
function timeStart(raw){
  const s=normalizeText(raw); if(!s) return '';
  if(/^[0-9.]+$/.test(s)) return excelTimeToHHMM(Number(s));
  const m=/^(\d{1,2}:\d{2})/.exec(s); return m?m[1]:s;
}

const api = { likelyTherapistName, extractPatientAssignment, extractLocationFromRaw, extractCodeToken, parseMainTable, findLowerSections, parseSectionHeader, extractLowerName, dayCountFromRaw, daysFromRaw, parseLowerAll, buildScheduleData, findScheduleSheet, parseEvalMainNames, parseEvalMainOccurrences, normLoc, timeStart };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
