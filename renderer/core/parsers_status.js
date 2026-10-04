// parsers_status.js — 작업치료현황 "현황(회복기)" 시트 읽기(입원/재입원/외래/퇴원, 치료 횟수, 전원 표기). 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_status.js"> (xlsx-reader.js, normalize.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, normDoctor, numToCol } = root.RehabCore;
async function parseStatusSheet(book){
  const sh = book.sheets.find(s=>/현황/.test(s.name)&&/회복기/.test(s.name)) || book.sheets.find(s=>/현황/.test(s.name));
  if(!sh) throw new Error('현황(회복기) 시트를 찾지 못했습니다.');
  const cells = await getSheetCells(book, sh.name);
  let headerRow=null;
  for(const [ref,val] of cells.entries()){
    if(normalizeText(val).replace(/\s+/g,'')==='성명'){ const rc=splitRef(ref); if(rc){ headerRow=rc.row; break; } }
  }
  if(headerRow==null) throw new Error('현황 시트에서 "성명" 헤더를 찾지 못했습니다.');
  const headerMap={};
  for(let c=1;c<=25;c++){ const v=normalizeText(getCell(cells,headerRow,c)).replace(/\s+/g,''); if(v) headerMap[v]=c; }
  const nameCol=headerMap['성명'], roomCol=headerMap['병실'], admitCol=headerMap['입원'], noteCol=headerMap['특이사항'], deptCol=headerMap['진료과'];
  const typeCols={sot:headerMap['SOT'], rdt:headerMap['RDT'], erdt:headerMap['ERDT'], ccrt:headerMap['CCRT'], lang:headerMap['언어']};
  const list=[]; const dischargedList=[]; let maxRow=headerRow;
  for(const ref of cells.keys()){ const rc=splitRef(ref); if(rc && rc.row>maxRow) maxRow=rc.row; }
  for(let r=headerRow+1;r<=maxRow;r++){
    const name=normalizeText(getCell(cells,r,nameCol)); if(!name) continue;
    const admit=admitCol?normalizeText(getCell(cells,r,admitCol)):'';
    const room=normalizeText(getCell(cells,r,roomCol));
    if(admit==='퇴원'){ dischargedList.push({name, room, admit, row:r}); continue; }
    const note=noteCol?normalizeText(getCell(cells,r,noteCol)):'';
    // "입원" 열에는 전원이 없고(퇴원/입원/재입원/외래), 전원은 특이사항 글자에만 나온다 → 상태가 아니라 "전원 표기"(확인 필요)로만 취급
    // 특이사항의 "전원"은 과거 전원 기록인 경우가 많다("4/29 ○○ 전원/5/2 재입원", 재입원 환자의 "8/13 전원") — 그래서 아직 "입원"인데
    // 마지막 "전원" 뒤에 재입원·복귀 표시가 없는 경우만 "전원 표기(확인 필요)"로 본다.
    const transfer = admit==='입원' && /전원/.test(note) && !/재입원|복귀/.test(note.slice(note.lastIndexOf('전원')));
    const rec={name, room, admit, note, transfer, row:r, dept:deptCol?normDoctor(getCell(cells,r,deptCol)):''};
    for(const k of Object.keys(typeCols)){ const col=typeCols[k]; const raw=col?getCell(cells,r,col):''; const num=parseInt(raw,10); rec[k]=Number.isFinite(num)?num:0; }
    list.push(rec);
  }
  // 수정 지시서가 "어느 칸인지" 알려줄 수 있게 열 글자(A,B…)와 행 번호를 함께 돌려준다
  const L=(c)=>c?numToCol(c):'', cols={name:L(nameCol), room:L(roomCol), admit:L(admitCol), dept:L(deptCol), sot:L(typeCols.sot), rdt:L(typeCols.rdt), erdt:L(typeCols.erdt), ccrt:L(typeCols.ccrt), lang:L(typeCols.lang)};
  return {sheetName:sh.name, list, dischargedList, hasLang:!!headerMap['언어'], cols};
}

const api = { parseStatusSheet };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
