// parsers_pta.js — PTA 재원현황 읽기(병록# 기준으로 줄 합치기, 같은 이름은 후보 여러 개). 교차검증에 들어 있던 순수 읽기 함수를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/parsers_pta.js"> (xlsx-reader.js, normalize.js 다음에) / Node: require() (테스트용)
'use strict';
(function (root) {
if (typeof require === 'function' && typeof module !== 'undefined') { require('./xlsx-reader.js'); require('./normalize.js'); }
const { normalizeText, getCell, splitRef, getSheetCells, normKey, roomDigits, regDigits, toIsoDate } = root.RehabCore;
async function parsePtaSheet(book){
  for(const sh of book.sheets){
    const cells=await getSheetCells(book, sh.name); if(!cells||!cells.size) continue;
    let hr=null;
    for(const [ref,val] of cells.entries()){ if(/병록/.test(normalizeText(val))){ const rc=splitRef(ref); if(rc && (!hr||rc.row<hr)) hr=rc.row; } }
    if(hr==null) continue;
    const col={}; for(let c=1;c<=25;c++){ const v=normalizeText(getCell(cells,hr,c)).replace(/\s+/g,''); if(!v) continue; if(/병록/.test(v)) col.reg=c; else if(v==='의사') col.rm=c; else if(v==='병실') col.room=c; else if(v==='성명') col.name=c; else if(v==='재활') col.rehab=c; else if(v==='입원일') col.adm=c; else if(v==='재활시작일') col.start=c; }
    if(!col.name||!col.room) continue;
    let maxRow=hr; for(const ref of cells.keys()){ const rc=splitRef(ref); if(rc&&rc.row>maxRow) maxRow=rc.row; }
    const byKey=new Map(), seen=new Set();
    for(let r=hr+1;r<=maxRow;r++){
      const name=normalizeText(getCell(cells,r,col.name)); const roomRaw=normalizeText(getCell(cells,r,col.room)); if(!name||!roomRaw) continue;
      const reg=col.reg?normalizeText(getCell(cells,r,col.reg)):'';
      const dedupeKey=regDigits(reg)?('R'+regDigits(reg)):('N'+normKey(name)+'|'+roomDigits(roomRaw));
      if(seen.has(dedupeKey)) continue; seen.add(dedupeKey);
      const [roomPart,bed]=roomRaw.split(':');
      const rec={name, reg, room:roomDigits(roomPart), bed:(bed||'').trim(), rm:col.rm?normalizeText(getCell(cells,r,col.rm)):'', rehab:col.rehab?normalizeText(getCell(cells,r,col.rehab)):'', adm:col.adm?toIsoDate(getCell(cells,r,col.adm)):'', start:col.start?toIsoDate(getCell(cells,r,col.start)):''};
      const k=normKey(name); if(!byKey.has(k)) byKey.set(k,[]); byKey.get(k).push(rec);
    }
    return byKey;
  }
  throw new Error('PTA 재원현황에서 병실/성명 열을 찾지 못했습니다.');
}

const api = { parsePtaSheet };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
