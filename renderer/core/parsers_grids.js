// parsers_grids.js — 매트·테이블현황 시트의 위치 그리드 읽기. 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_grids.js"> (xlsx-reader.js, normalize.js, parsers_weekday.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); require('./parsers_weekday.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, normLoc, timeStart } = root.RehabCore;
async function parseLocationGrid(cells){
  const headerRows=[];
  for(const [ref,val] of cells.entries()){ if(normalizeText(val).replace(/\s+/g,'')==='치료시간'){ const rc=splitRef(ref); if(rc) headerRows.push(rc); } }
  const entries=[];
  for(const hr of headerRows){
    let blankRun=0;
    for(let c=hr.col+1;c<hr.col+40;c++){
      const label=getCell(cells,hr.row,c); const labelNorm=normalizeText(label).replace(/\s+/g,'');
      if(labelNorm==='치료시간') break;
      if(labelNorm===''){ blankRun++; if(blankRun>=3) break; continue; }
      blankRun=0;
      const loc=normLoc(label); if(!loc) continue;
      for(let r=hr.row+1;r<=hr.row+30;r++){
        const timeRaw=getCell(cells,r,hr.col);
        if(normalizeText(timeRaw)===''){ break; }
        const time=timeStart(timeRaw); if(!/^\d{1,2}:\d{2}$/.test(time)) continue;
        const name=normalizeText(getCell(cells,r,c)); if(!name) continue;
        entries.push({time,loc,name});
      }
    }
  }
  return entries;
}
async function collectGridEntries(book, sheetName){
  if(!book) return [];
  const cells=await getSheetCells(book, sheetName || book.sheets[0].name);
  if(!cells) return [];
  return parseLocationGrid(cells);
}

const api = { parseLocationGrid, collectGridEntries };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
