// 실행: node main/test_cardview.js
// 엑셀 카드 그대로 보기(core/cardview.js): 테마 색·서식 읽기, 시간/날짜 표시, 병합·열 너비·행 높이, 구역 그리기와 강조를 확인한다.
'use strict';
const assert = require('assert');
const C = require('../renderer/core/cardview');

// ① 테마 색과 tint
const theme = C.parseTheme('<a:clrScheme><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>');
assert.strictEqual(theme[0], 'ffffff'); assert.strictEqual(theme[1], '000000'); assert.strictEqual(theme[4], '4472c4'); // theme 0=lt1, 1=dk1, 4=accent1
assert.strictEqual(C.colorOf(' theme="4" tint="0.8"', theme), 'dae3f3'); // 엑셀의 "강조1, 80% 더 밝게"
assert.strictEqual(C.colorOf(' rgb="FFFF0000"', theme), 'ff0000');
assert.strictEqual(C.tintHex('808080', -0.5), '404040');
console.log('OK ① 테마 색·tint');

// ② 서식표
const stylesXml = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="h:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><color rgb="FFC00000"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.8"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="medium"><color auto="1"/></right><top/><bottom style="thin"><color rgb="FF112233"/></bottom></border></borders>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`;
const st = C.parseStyleTables(stylesXml, '<a:clrScheme><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>');
assert.strictEqual(st.fonts.length, 2); assert.strictEqual(st.fonts[1].b, true); assert.strictEqual(st.fonts[1].color, 'c00000'); assert.strictEqual(st.fonts[0].b, false);
assert.strictEqual(st.fills[0], null); assert.strictEqual(st.fills[1], null); // 무늬 없음(gray125 포함)은 색 없음
assert.strictEqual(st.borders[1].left.style, 'thin'); assert.strictEqual(st.borders[1].bottom.color, '112233'); assert.strictEqual(st.borders[1].top, undefined);
assert.strictEqual(st.xfs.length, 4); assert.strictEqual(st.xfs[1].h, 'center'); assert.strictEqual(st.xfs[1].wrap, true); assert.strictEqual(st.xfs[0].h, '');
console.log('OK ② 서식표(글꼴·칸 색·테두리·정렬)');

// ③ 시간/날짜 표시: 표시 형식이 시간·날짜인 칸만 바꾼다(숫자 그대로 쓰는 칸은 건드리지 않음)
assert.strictEqual(C.fmtValue('0.35416666666666669', st.xfs[2], st.numFmts), '08:30');
assert.strictEqual(C.fmtValue('0.6875', st.xfs[2], st.numFmts), '16:30');
assert.strictEqual(C.fmtValue('46037', st.xfs[3], st.numFmts), '2026.01.15');
assert.strictEqual(C.fmtValue('46037', st.xfs[0], st.numFmts), '46037'); // 일반 숫자(예: 등록번호)는 그대로
assert.strictEqual(C.fmtValue('706', st.xfs[0], st.numFmts), '706');
assert.strictEqual(C.fmtValue('연하치료', st.xfs[2], st.numFmts), '연하치료');
console.log('OK ③ 시간·날짜 표시');

// ④ 시트 XML 읽기
const sheet = `<worksheet><sheetFormatPr defaultColWidth="9" defaultRowHeight="16.5"/><cols><col min="1" max="2" width="6" style="1" customWidth="1"/><col min="3" max="3" width="10"/></cols><sheetData>
<row r="1" ht="30" customHeight="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" s="1"/><c r="C1" s="2"><v>0.354166666666667</v></c></row>
<row r="2"><c r="A2" s="1"><v>5</v></c><c r="C2" s="3"><v>46037</v></c></row>
<row r="5"><c r="A5"><v>9</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`;
const idx = C.indexRows(sheet); assert.deepStrictEqual(idx.nums, [1, 2, 5]);
assert.ok(C.regionXml(sheet, idx, 1, 2).includes('A2') && !C.regionXml(sheet, idx, 1, 2).includes('A5'));
assert.strictEqual(C.regionXml(sheet, idx, 3, 4), ''); // 비어 있는 행 구간
const mg = C.parseMerges(sheet); assert.deepStrictEqual(mg.get('1:1'), [1, 2]);
const cols = C.parseCols(sheet); assert.strictEqual(cols.widths.get(2), 6); assert.strictEqual(cols.widths.get(3), 10); assert.strictEqual(cols.styles.get(1), 1); assert.strictEqual(cols.styles.get(3), undefined);
const reg = C.parseRegion(C.regionXml(sheet, idx, 1, 2)); assert.strictEqual(reg.rowHt.get(1), 30); assert.strictEqual(reg.styleOf.get('B1'), 1); assert.strictEqual(reg.styleOf.get('C2'), 3);
console.log('OK ④ 행 색인·병합·열 너비·행 높이');

// ⑤ 구역 그리기 + 강조
const view = { xml: sheet, idx, merges: mg, cols, defRowPt: 16.5, defColW: 9, styles: st };
const cells = new Map([['A1', '이름'], ['C1', '0.354166666666667'], ['A2', '5'], ['C2', '46037']]);
const out = C.renderRegion(view, cells, { r0: 1, c0: 1, rows: 2, cols: 3, hl: new Set(['C1']) });
assert.ok(out.html.includes('colspan="2"'), '병합'); assert.ok(out.html.includes('background:#dae3f3'), '칸 색');
assert.ok(out.html.includes('border-left:1px solid #000000') && out.html.includes('border-right:2px solid'), '테두리');
assert.ok(out.html.includes('>08:30<') && out.html.includes('>2026.01.15<'), '시간·날짜');
assert.ok(/data-ref="C1" class="cv-hl"/.test(out.html) && !/data-ref="C2" class="cv-hl"/.test(out.html), '강조는 지정한 칸만');
assert.ok(out.html.includes('height:40px'), '행 높이 30pt → 40px'); // 30*1.333
assert.strictEqual(out.width, 47 + 47 + 75); // 6*7+5, 6*7+5, 10*7+5
assert.strictEqual(out.height, 40 + 22); // 30pt→40px, 기본 16.5pt→22px
const hm = C.renderRegion(view, cells, { r0: 1, c0: 1, rows: 2, cols: 3, hl: new Set(['B1']) }); // 병합 칸 안쪽 칸을 지정해도 그 칸이 강조
assert.ok(/data-ref="A1" class="cv-hl"/.test(hm.html), '병합 칸 강조');
console.log('OK ⑤ 구역 그리기·병합·강조');
console.log('ALL PASS');
