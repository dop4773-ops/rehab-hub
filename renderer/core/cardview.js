// cardview.js — 엑셀 시트의 한 구역(예: 환자 카드 한 장)을 원본 서식 그대로 HTML 표로 그린다. 읽기 전용(파일은 건드리지 않음).
// 칸 색·글꼴·테두리·병합·열 너비·행 높이·시간/날짜 표시를 styles.xml / theme1.xml / 시트 XML에서 읽는다.
// 시트가 수 MB라 처음 한 번만 "행 위치 색인"을 만들고, 그릴 구역의 행만 잘라서 읽는다. 값은 xlsx-reader가 이미 읽어 둔 칸 값(getSheetCells)을 쓴다.
// 브라우저: <script src="../core/cardview.js"> (xlsx-reader.js 다음) / Node: require() (테스트용)
'use strict';
(function (root) {
const RC = (typeof require === 'function' && typeof module !== 'undefined') ? require('./xlsx-reader.js') : root.RehabCore;
const { decodeXml, getAttr, colToNum, numToCol, splitRef } = RC;

const THEME_KEYS = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']; // 엑셀 theme 번호 순서
function parseTheme(xml) {
  const out = THEME_KEYS.map(() => null); if (!xml) return out;
  THEME_KEYS.forEach((k, i) => {
    const m = new RegExp(`<a:${k}>([\\s\\S]*?)</a:${k}>`).exec(xml); if (!m) return;
    const c = /lastClr="([0-9A-Fa-f]{6})"/.exec(m[1]) || /val="([0-9A-Fa-f]{6})"/.exec(m[1]); if (c) out[i] = c[1].toLowerCase();
  });
  return out;
}
function tintHex(hex, t) {
  const f = (c) => Math.max(0, Math.min(255, Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t)));
  return [0, 2, 4].map(i => f(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('');
}
const INDEXED = { 8: '000000', 9: 'ffffff', 10: 'ff0000', 11: '00ff00', 12: '0000ff', 13: 'ffff00', 64: '000000' };
function colorOf(attrs, theme) {
  if (!attrs) return null;
  const rgb = getAttr(attrs, 'rgb'); if (rgb) return rgb.slice(-6).toLowerCase();
  const th = getAttr(attrs, 'theme');
  if (th !== '' && th != null) { const base = theme[parseInt(th, 10)]; if (!base) return null; const t = parseFloat(getAttr(attrs, 'tint') || '0'); return t ? tintHex(base, t) : base; }
  const ix = getAttr(attrs, 'indexed'); if (ix !== '' && ix != null) return INDEXED[parseInt(ix, 10)] || null;
  return null;
}

function parseStyleTables(stylesXml, themeXml) {
  const theme = parseTheme(themeXml), xml = stylesXml || '';
  const block = (tag) => { const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml); return m ? m[1] : ''; };
  const fonts = [], fills = [], borders = [], xfs = [], numFmts = {};
  let m;
  const fontRe = /<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g, fb = block('fonts');
  while ((m = fontRe.exec(fb))) { const b = m[1] || ''; const col = /<color\b([^>]*?)\/?>/.exec(b), sz = /<sz\b[^>]*val="([\d.]+)"/.exec(b);
    fonts.push({ b: /<b\s*\/>|<b\s+val="(1|true)"/.test(b), i: /<i\s*\/>|<i\s+val="(1|true)"/.test(b), sz: sz ? parseFloat(sz[1]) : 11, color: col ? colorOf(col[1], theme) : null }); }
  const fillRe = /<fill>([\s\S]*?)<\/fill>/g, flb = block('fills');
  while ((m = fillRe.exec(flb))) { const p = /<patternFill\b([^>]*)>([\s\S]*?)<\/patternFill>/.exec(m[1]); const fg = p && /<fgColor\b([^>]*?)\/?>/.exec(p[2]);
    fills.push(p && getAttr(p[1], 'patternType') === 'solid' && fg ? colorOf(fg[1], theme) : null); }
  const borRe = /<border\b[^>]*?(?:\/>|>([\s\S]*?)<\/border>)/g, bb = block('borders');
  while ((m = borRe.exec(bb))) { const d = {}, body = m[1] || ''; const sideRe = /<(left|right|top|bottom)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g; let sm;
    while ((sm = sideRe.exec(body))) { const style = getAttr(sm[2], 'style'); if (!style) continue; const col = /<color\b([^>]*?)\/?>/.exec(sm[3] || ''); d[sm[1]] = { style, color: (col && colorOf(col[1], theme)) || '000000' }; }
    borders.push(d); }
  const nfRe = /<numFmt\b([^>]*?)\/?>/g; while ((m = nfRe.exec(xml))) numFmts[getAttr(m[1], 'numFmtId')] = decodeXml(getAttr(m[1], 'formatCode'));
  const xfRe = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g, xb = block('cellXfs');
  while ((m = xfRe.exec(xb))) { const al = /<alignment\b([^>]*?)\/?>/.exec(m[2] || '');
    xfs.push({ font: parseInt(getAttr(m[1], 'fontId') || '0', 10), fill: parseInt(getAttr(m[1], 'fillId') || '0', 10), border: parseInt(getAttr(m[1], 'borderId') || '0', 10), numFmt: parseInt(getAttr(m[1], 'numFmtId') || '0', 10),
      h: al ? getAttr(al[1], 'horizontal') : '', v: al ? getAttr(al[1], 'vertical') : '', wrap: !!al && getAttr(al[1], 'wrapText') === '1' }); }
  return { fonts, fills, borders, xfs, numFmts };
}

// 시트 XML: 행 위치 색인 / 병합 / 열 너비
function indexRows(xml) {
  const nums = [], pos = new Map(), re = /<row\b[^>]*?\br="(\d+)"/g; let m;
  while ((m = re.exec(xml))) { const n = parseInt(m[1], 10); nums.push(n); pos.set(n, m.index); }
  const endData = xml.indexOf('</sheetData>');
  return { nums, pos, endData: endData < 0 ? xml.length : endData };
}
function regionXml(xml, idx, r0, r1) {
  const first = idx.nums.find(n => n >= r0), next = idx.nums.find(n => n > r1);
  if (first == null || first > r1) return '';
  return xml.slice(idx.pos.get(first), next == null ? idx.endData : idx.pos.get(next));
}
function parseMerges(xml) {
  const map = new Map(), re = /<mergeCell\b[^>]*?\bref="([A-Z]+\d+):([A-Z]+\d+)"/g; let m;
  while ((m = re.exec(xml))) { const a = splitRef(m[1]), b = splitRef(m[2]); if (a && b) map.set(`${a.row}:${a.col}`, [b.row - a.row + 1, b.col - a.col + 1]); }
  return map;
}
function parseCols(xml) {
  const widths = new Map(), styles = new Map(), blk = /<cols>([\s\S]*?)<\/cols>/.exec(xml); if (!blk) return { widths, styles };
  const re = /<col\b([^>]*?)\/?>/g; let m;
  while ((m = re.exec(blk[1]))) { const lo = parseInt(getAttr(m[1], 'min'), 10), hi = parseInt(getAttr(m[1], 'max'), 10), w = parseFloat(getAttr(m[1], 'width')), s = getAttr(m[1], 'style');
    for (let c = lo; c <= Math.min(hi, lo + 300); c++) { if (w) widths.set(c, w); if (s) styles.set(c, parseInt(s, 10)); } }
  return { widths, styles };
}
// 구역 안의 칸 서식 번호와 행 높이: {styleOf: Map(ref→s), rowHt: Map(row→pt)}
function parseRegion(slice) {
  const styleOf = new Map(), rowHt = new Map(), rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let m;
  while ((m = rowRe.exec(slice))) {
    const r = parseInt(getAttr(m[1], 'r'), 10), ht = getAttr(m[1], 'ht'); if (ht) rowHt.set(r, parseFloat(ht));
    const cRe = /<c\b([^>]*?)(?:\/>|>)/g; let cm; const body = m[2] || '';
    while ((cm = cRe.exec(body))) { const ref = getAttr(cm[1], 'r'), s = getAttr(cm[1], 's'); if (ref && s) styleOf.set(ref, parseInt(s, 10)); }
  }
  return { styleOf, rowHt };
}

// 값 표시: 엑셀은 시간·날짜를 숫자로 저장한다. 그 칸의 표시 형식(numFmt)이 날짜/시간일 때만 사람이 읽는 글자로 바꾼다.
const pad = (n) => String(n).padStart(2, '0');
function fmtKind(numFmt, numFmts) {
  if ((numFmt >= 14 && numFmt <= 22) || (numFmt >= 45 && numFmt <= 47) || (numFmt >= 27 && numFmt <= 36) || (numFmt >= 50 && numFmt <= 58)) return (numFmt >= 18 && numFmt <= 21) || (numFmt >= 45 && numFmt <= 47) ? 'time' : 'date';
  const code = numFmts[numFmt]; if (!code) return '';
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  const hasT = /[hs]/i.test(c) || /(^|[^a-z])m+:/i.test(c) || /:m/i.test(c), hasD = /[yd]/i.test(c);
  return hasT && !hasD ? 'time' : (hasD ? 'date' : '');
}
function fmtValue(raw, xf, numFmts) {
  if (raw === '' || raw == null || !/^-?\d+(\.\d+)?$/.test(String(raw))) return raw;
  const kind = fmtKind(xf ? xf.numFmt : 0, numFmts || {}); if (!kind) return raw;
  const v = parseFloat(raw);
  if (kind === 'time' || v < 1) { const min = Math.round((v - Math.floor(v)) * 1440); return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

const BORDER_PX = { thin: 1, hair: 1, dotted: 1, dashed: 1, medium: 2, mediumDashed: 2, thick: 3, double: 3 };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cellCss(xf, st) {
  const f = st.fonts[xf.font] || { sz: 11 }, css = [], fill = st.fills[xf.fill];
  if (fill) css.push('background:#' + fill);
  if (f.color) css.push('color:#' + f.color);
  if (f.b) css.push('font-weight:700');
  if (f.i) css.push('font-style:italic');
  css.push(`font-size:${(f.sz * 1.12).toFixed(1)}px`);
  const bd = st.borders[xf.border] || {};
  for (const side of Object.keys(bd)) css.push(`border-${side}:${BORDER_PX[bd[side].style] || 1}px solid #${bd[side].color}`);
  css.push('text-align:' + ({ center: 'center', right: 'right', centerContinuous: 'center' }[xf.h] || 'left'));
  css.push('vertical-align:' + ({ top: 'top', bottom: 'bottom' }[xf.v] || 'middle'));
  css.push(xf.wrap ? 'white-space:normal' : 'white-space:nowrap;overflow:hidden');
  return css.join(';');
}

// 시트 하나를 그릴 준비(처음 한 번만 무겁고 이후는 캐시): 책(book)에서 XML을 읽어 색인·병합·열 너비를 만든다.
async function getSheetView(book, sheetName) {
  book._cv = book._cv || { views: new Map(), styles: null };
  if (book._cv.views.has(sheetName)) return book._cv.views.get(sheetName);
  const sh = book.sheets.find(s => s.name === sheetName); if (!sh) return null;
  if (!book._cv.styles) book._cv.styles = parseStyleTables(book.zip.has('xl/styles.xml') ? await book.zip.text('xl/styles.xml') : '', book.zip.has('xl/theme/theme1.xml') ? await book.zip.text('xl/theme/theme1.xml') : '');
  const xml = await book.zip.text(sh.path), fmt = /<sheetFormatPr\b([^>]*?)\/?>/.exec(xml);
  const view = { xml, idx: indexRows(xml), merges: parseMerges(xml), cols: parseCols(xml), defRowPt: fmt && parseFloat(getAttr(fmt[1], 'defaultRowHeight')) || 16.5, defColW: fmt && parseFloat(getAttr(fmt[1], 'defaultColWidth')) || 9, styles: book._cv.styles };
  book._cv.views.set(sheetName, view); return view;
}

// 구역을 HTML 표로: opts {r0,c0,rows,cols, hl:Set(ref)} — cells는 getSheetCells 결과. 반환 {html, width(px)}
function renderRegion(view, cells, opts) {
  const { r0, c0, rows, cols } = opts, hl = opts.hl || new Set(), st = view.styles;
  const { styleOf, rowHt } = parseRegion(regionXml(view.xml, view.idx, r0, r0 + rows - 1));
  const colPx = (c) => Math.round((view.cols.widths.get(c) || view.defColW) * 7 + 5);
  let width = 0; const out = ['<table class="cv-xl"><colgroup>'];
  for (let c = c0; c < c0 + cols; c++) { const w = colPx(c); width += w; out.push(`<col style="width:${w}px">`); }
  out.push('</colgroup>');
  const skip = new Set();
  for (let r = r0; r < r0 + rows; r++) {
    out.push(`<tr style="height:${Math.round((rowHt.get(r) || view.defRowPt) * 1.333)}px">`);
    for (let c = c0; c < c0 + cols; c++) {
      if (skip.has(`${r}:${c}`)) continue;
      const ref = numToCol(c) + r, sIdx = styleOf.has(ref) ? styleOf.get(ref) : (view.cols.styles.get(c) || 0), xf = st.xfs[sIdx] || st.xfs[0] || { font: 0, fill: 0, border: 0, numFmt: 0 };
      const span = view.merges.get(`${r}:${c}`); let attrs = '', hit = hl.has(ref);
      if (span) {
        const rs = Math.min(span[0], r0 + rows - r), cs = Math.min(span[1], c0 + cols - c);
        if (rs > 1) attrs += ` rowspan="${rs}"`; if (cs > 1) attrs += ` colspan="${cs}"`;
        for (let rr = r; rr < r + rs; rr++) for (let cc = c; cc < c + cs; cc++) { if (rr !== r || cc !== c) skip.add(`${rr}:${cc}`); if (hl.has(numToCol(cc) + rr)) hit = true; }
      }
      const raw = cells.get(ref) ?? '', text = fmtValue(raw, xf, st.numFmts);
      out.push(`<td${attrs} data-ref="${ref}"${hit ? ' class="cv-hl"' : ''} style="${cellCss(xf, st)}">${esc(text).replace(/\n/g, '<br>')}</td>`);
    }
    out.push('</tr>');
  }
  out.push('</table>');
  return { html: out.join(''), width };
}

const api = { parseTheme, tintHex, colorOf, parseStyleTables, indexRows, regionXml, parseMerges, parseCols, parseRegion, fmtValue, getSheetView, renderRegion };
root.RehabCore = Object.assign(root.RehabCore || {}, api);
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
