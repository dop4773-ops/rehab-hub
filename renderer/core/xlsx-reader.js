// xlsx-reader.js — XLSX 읽기(read-only) 공통 모듈. 그랜드라운딩·교차검증에 똑같이 복사돼 있던 읽기 코드를 한 곳으로 옮긴 것(로직 변경 없음).
// 브라우저: <script src="../core/xlsx-reader.js"> 로 전역 RehabCore 사용 / Node: require() (테스트용)
'use strict';
(function (root) {
// xlsx_core.js — RM 회진 v3.2.30 / 작업치료 교차검증 도구의 공통 XLSX 읽기(read-only) 파서.
// 두 도구의 코드를 그대로 합친 것(decodeXml=교차검증판(null 안전), ZipArchive=RM판). 로직 변경 없음.
// 브라우저: <script src="core/xlsx_core.js"> 로 전역 함수 사용 / Node: require() (테스트용)
const UTF8 = new TextDecoder('utf-8');
function decodeXml(s){
  s = s||'';
  return s.replace(/&#(x?[0-9A-Fa-f]+);|&(?:lt|gt|amp|quot|apos);/g, m => {
    if (m.startsWith('&#x')) return String.fromCodePoint(parseInt(m.slice(3,-1),16));
    if (m.startsWith('&#')) return String.fromCodePoint(parseInt(m.slice(2,-1),10));
    return {'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"}[m] || m;
  });
}
function getAttr(attrs, name) {
  const re = new RegExp('(?:^|\\s)'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'="([^"]*)"');
  const m = attrs.match(re); return m ? decodeXml(m[1]) : '';
}
function colToNum(col) { let n=0; for(const ch of col) n=n*26+(ch.charCodeAt(0)-64); return n; }
function numToCol(n) { let s=''; while(n){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26);} return s; }
function splitRef(ref){ const m=/^([A-Z]+)(\d+)$/.exec(ref); return m?{col:colToNum(m[1]),row:+m[2]}:null; }
class ZipArchive {
  constructor(arrayBuffer){ this.u8=new Uint8Array(arrayBuffer); this.dv=new DataView(arrayBuffer); this.entries=new Map(); this._parse(); }
  _u16(o){return this.dv.getUint16(o,true)} _u32(o){return this.dv.getUint32(o,true)}
  _parse(){
    let eocd=-1; const min=Math.max(0,this.u8.length-22-65535);
    for(let i=this.u8.length-22;i>=min;i--){ if(this._u32(i)===0x06054b50){ eocd=i; break; } }
    if(eocd<0) throw new Error('ZIP 끝정보를 찾지 못했습니다. 올바른 XLSX 파일인지 확인하세요.');
    const total=this._u16(eocd+10), cdOffset=this._u32(eocd+16); let p=cdOffset;
    for(let i=0;i<total;i++){
      if(this._u32(p)!==0x02014b50) throw new Error('XLSX 압축 구조가 손상되었습니다.');
      const flags=this._u16(p+8), method=this._u16(p+10), compSize=this._u32(p+20), uncompSize=this._u32(p+24);
      const nameLen=this._u16(p+28), extraLen=this._u16(p+30), commentLen=this._u16(p+32), localOffset=this._u32(p+42);
      const name=UTF8.decode(this.u8.slice(p+46,p+46+nameLen)); this.entries.set(name,{name,flags,method,compSize,uncompSize,localOffset});
      p+=46+nameLen+extraLen+commentLen;
    }
  }
  has(name){return this.entries.has(name)}
  async bytes(name){
    const e=this.entries.get(name); if(!e) throw new Error(`XLSX 내부 파일이 없습니다: ${name}`);
    const p=e.localOffset; if(this._u32(p)!==0x04034b50) throw new Error('XLSX 로컬 압축 헤더가 손상되었습니다.');
    const nameLen=this._u16(p+26), extraLen=this._u16(p+28), start=p+30+nameLen+extraLen; const data=this.u8.slice(start,start+e.compSize);
    if(e.method===0) return data;
    if(e.method===8){
      if(typeof DecompressionStream==='undefined') throw new Error('현재 브라우저가 XLSX 압축 해제를 지원하지 않습니다. 최신 Edge 또는 Chrome을 사용해 주세요.');
      const ds=new DecompressionStream('deflate-raw'); const ab=await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer(); return new Uint8Array(ab);
    }
    throw new Error(`지원하지 않는 XLSX 압축 방식입니다 (${e.method}).`);
  }
  async text(name){ return UTF8.decode(await this.bytes(name)); }
}
function parseSharedStrings(xml){
  const out=[]; const siRe=/<si\b[^>]*>([\s\S]*?)<\/si>/g; let m;
  while((m=siRe.exec(xml))){ let s=''; const tRe=/<t\b[^>]*>([\s\S]*?)<\/t>/g; let tm; while((tm=tRe.exec(m[1]))) s+=decodeXml(tm[1]); out.push(s); }
  return out;
}
function parseWorksheet(xml, shared){
  const cells=new Map(); xml=xml.replace(/<c\b[^>]*\/>/g,''); const re=/<c\b([^>]*)>([\s\S]*?)<\/c>/g; let m;
  while((m=re.exec(xml))){
    const attrs=m[1], body=m[2], ref=getAttr(attrs,'r'); if(!ref) continue; const type=getAttr(attrs,'t'); let value='';
    if(type==='inlineStr'){ const tr=/<t\b[^>]*>([\s\S]*?)<\/t>/g; let tm; while((tm=tr.exec(body))) value+=decodeXml(tm[1]); }
    else { const vm=/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body); if(!vm) continue; const raw=decodeXml(vm[1]); if(type==='s'){ const idx=parseInt(raw,10); value=Number.isFinite(idx)?(shared[idx]??''):raw; } else if(type==='b') value=raw==='1'?'TRUE':'FALSE'; else value=raw; }
    if(value!=='') cells.set(ref,value);
  }
  return cells;
}
function normalizePartTarget(t){ t=decodeXml(t||'').replace(/^\//,''); if(t.startsWith('xl/')) return t; return 'xl/'+t.replace(/^\.\//,''); }
async function readWorkbookFile(file){
  const arrayBuffer=await file.arrayBuffer(), zip=new ZipArchive(arrayBuffer); const wbXml=await zip.text('xl/workbook.xml'), relXml=await zip.text('xl/_rels/workbook.xml.rels');
  const relMap=new Map(); const rr=/<Relationship\b([^>]*)\/?\s*>/g; let m;
  while((m=rr.exec(relXml))){ const id=getAttr(m[1],'Id'), target=getAttr(m[1],'Target'); if(id&&target) relMap.set(id,normalizePartTarget(target)); }
  const sheets=[]; const sr=/<sheet\b([^>]*)\/?\s*>/g;
  while((m=sr.exec(wbXml))){ const name=getAttr(m[1],'name'), rid=getAttr(m[1],'r:id'); if(name&&rid&&relMap.has(rid)) sheets.push({name,path:relMap.get(rid)}); }
  let shared=[]; if(zip.has('xl/sharedStrings.xml')) shared=parseSharedStrings(await zip.text('xl/sharedStrings.xml'));
  return {fileName:file.name,zip,shared,sheets,sheetCache:new Map()};
}
async function getSheetCells(book,sheetName){ if(book.sheetCache.has(sheetName)) return book.sheetCache.get(sheetName); const sh=book.sheets.find(s=>s.name===sheetName); if(!sh) return null; const cells=parseWorksheet(await book.zip.text(sh.path),book.shared); book.sheetCache.set(sheetName,cells); return cells; }
async function parseStylesXml(book){
  if(book._styles) return book._styles;
  if(!book.zip.has('xl/styles.xml')){ book._styles={fontsBold:[false], cellXfFontId:[0]}; return book._styles; }
  const xml = await book.zip.text('xl/styles.xml');
  const fontsBold=[];
  const fontsBlock=/<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(xml);
  if(fontsBlock){
    const fontRe=/<font>([\s\S]*?)<\/font>/g; let fm;
    while((fm=fontRe.exec(fontsBlock[1]))) fontsBold.push(/<b\s*\/?>/.test(fm[1]));
  }
  const cellXfFontId=[];
  const xfsBlock=/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if(xfsBlock){
    const xfRe=/<xf\b([^>]*?)(?:\/>|>)/g; let xm;
    while((xm=xfRe.exec(xfsBlock[1]))){ const fid=getAttr(xm[1],'fontId'); cellXfFontId.push(fid?parseInt(fid,10):0); }
  }
  book._styles={fontsBold, cellXfFontId};
  return book._styles;
}

async function getSheetBoldRefs(book, sheetName){
  if(!book._boldCache) book._boldCache={};
  if(book._boldCache[sheetName]) return book._boldCache[sheetName];
  const sh=book.sheets.find(s=>s.name===sheetName);
  if(!sh){ book._boldCache[sheetName]=new Set(); return book._boldCache[sheetName]; }
  const styles=await parseStylesXml(book);
  let xml=await book.zip.text(sh.path);
  xml=xml.replace(/<c\b[^>]*\/>/g,'');
  const boldRefs=new Set();
  const cRe=/<c\b([^>]*)>([\s\S]*?)<\/c>/g; let m;
  while((m=cRe.exec(xml))){
    const ref=getAttr(m[1],'r'); if(!ref) continue;
    const sAttr=getAttr(m[1],'s');
    const styleIdx=sAttr?parseInt(sAttr,10):0;
    const fontId=styles.cellXfFontId[styleIdx]??0;
    if(styles.fontsBold[fontId]) boldRefs.add(ref);
  }
  book._boldCache[sheetName]=boldRefs;
  return boldRefs;
}

function getCell(cells,row,col){ return cells.get(`${numToCol(col)}${row}`) ?? ''; }

const api = { ZipArchive, decodeXml, getAttr, colToNum, numToCol, splitRef, parseSharedStrings, parseWorksheet, normalizePartTarget, readWorkbookFile, getSheetCells, parseStylesXml, getSheetBoldRefs, getCell };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
