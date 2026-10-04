// 실행: node main/test_core.js
// renderer/core 공통 모듈(엑셀 읽기·정규화)을 직접 require 해서 확인한다 — HTML에서 함수를 잘라내지 않는다.
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const { readWorkbookFile, getSheetCells, getCell, splitRef, colToNum, numToCol, decodeXml, getSheetBoldRefs } = require('../renderer/core/xlsx-reader.js');
const { normalizeText, normKey, normDoctor, roomDigits, regDigits, excelTimeToHHMM } = require('../renderer/core/normalize.js');

// 손으로 만든 최소 xlsx(zip): 압축(deflate)·무압축 항목을 섞어서 둘 다 읽히는지 확인
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function zip(files) {
  const parts = [], cd = []; let off = 0;
  for (const [name, text, deflate] of files) {
    const raw = Buffer.from(text, 'utf8'), data = deflate ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8); h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, data); cd.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cdBuf = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
const xlsx = zip([
  ['xl/workbook.xml', '<workbook><sheets><sheet name="현황(회복기)" sheetId="1" r:id="rId1"/><sheet name="팀" sheetId="2" r:id="rId2"/></sheets></workbook>', true],
  ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>', true],
  ['xl/sharedStrings.xml', '<sst><si><t>성명</t></si><si><r><t>홍길</t></r><r><t>동 &amp; 님</t></r></si></sst>', false],
  ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>0.375</v></c><c r="C1" t="b"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>RM 6</t></is></c><c r="Z2"/></row></sheetData></worksheet>', true],
  ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>굵게</t></is></c><c r="B1" t="inlineStr"><is><t>보통</t></is></c></row></sheetData></worksheet>', true],
  ['xl/styles.xml', '<styleSheet><fonts><font><sz val="11"/></font><font><b/></font></fonts><cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>', true],
]);

(async () => {
  // ① 엑셀 읽기: 시트 목록(상대·절대 경로), 공유 문자열(서식 조각 합치기·XML 엔티티), 숫자·불리언·인라인 문자열, 빈 셀 제외
  const file = { name: 't.xlsx', arrayBuffer: async () => xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.length) };
  const book = await readWorkbookFile(file);
  assert.deepStrictEqual(book.sheets.map(s => s.name), ['현황(회복기)', '팀']);
  const cells = await getSheetCells(book, '현황(회복기)');
  assert.strictEqual(getCell(cells, 1, 1), '성명'); assert.strictEqual(getCell(cells, 1, 2), '0.375'); assert.strictEqual(getCell(cells, 1, 3), 'TRUE');
  assert.strictEqual(getCell(cells, 2, 1), '홍길동 & 님'); assert.strictEqual(getCell(cells, 2, 2), 'RM 6'); assert.strictEqual(getCell(cells, 2, 26), '');
  assert.strictEqual(await getSheetCells(book, '없는시트'), null);
  assert.strictEqual(await getSheetCells(book, '현황(회복기)'), cells, '같은 시트는 캐시를 쓴다');
  const bold = await getSheetBoldRefs(book, '팀'); assert(bold.has('A1') && !bold.has('B1'), '볼드 서식 칸만 잡힌다');
  assert.deepStrictEqual(splitRef('AB12'), { col: 28, row: 12 }); assert.strictEqual(splitRef('12'), null);
  assert.strictEqual(colToNum('Z'), 26); assert.strictEqual(numToCol(28), 'AB'); assert.strictEqual(decodeXml('&lt;&#65;&#x42;&gt;'), '<AB>');
  await assert.rejects(() => readWorkbookFile({ name: 'x', arrayBuffer: async () => new ArrayBuffer(10) }), /ZIP/, '엑셀이 아니면 안내 문구로 오류');
  console.log('OK ① 엑셀 읽기(zip·공유문자열·서식·캐시·오류)');

  // ② 정규화
  assert.strictEqual(normalizeText(null), ''); assert.strictEqual(normalizeText(' a\r\nb '), 'a\nb');
  assert.strictEqual(normKey(' 홍 길-동(1) '), '홍길동1'); assert.strictEqual(normKey('abc'), 'ABC');
  assert.strictEqual(normDoctor('RM 6'), 'RM6'); assert.strictEqual(normDoctor(6), 'RM6'); assert.strictEqual(normDoctor(''), '');
  assert.strictEqual(roomDigits('501:01'), '501'); assert.strictEqual(roomDigits('10층'), ''); assert.strictEqual(regDigits('0012-34'), '1234');
  assert.strictEqual(excelTimeToHHMM(0.375), '09:00'); assert.strictEqual(excelTimeToHHMM('x'), '');
  console.log('OK ② 정규화(이름·주치의·병실·시간)');
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
