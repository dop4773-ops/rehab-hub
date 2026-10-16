// 실행: node main/test_modalclose.js — "팝업은 Esc나 닫기 버튼으로만 닫힌다(바깥을 눌러도 안 닫힘)" 규칙을 지키는 정적 검사.
// 팝업 바깥(어두운 배경)을 눌렀을 때 닫는 코드가 새로 생기면 이 테스트가 실패해서 한 번 더 확인하게 한다.
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const files = [...fs.readdirSync(root).filter(f => f.endsWith('.js')).map(f => path.join(root, f)), ...fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.html')).map(f => path.join(root, 'tools', f))];
// 배경을 눌러 닫는 모양들: e.target.id==='xxxModal' · e.target === this/ov/모달 요소 · dialog 바깥 클릭
const BAD = [/target\.id\s*===\s*'[A-Za-z]*(Modal|Panel|Dialog)'\s*\)?\s*(\{|[A-Za-z.]*close|e\.currentTarget|\$\()/, /target\s*===\s*this\)\s*close/i, /e\.target\s*===\s*(ov|\$\(['A-Za-z#]*[Mm]odal['"]?\))\s*\)/, /\bt\s*===\s*\$\('#mback'\)/, /target\.id\s*===\s*'[A-Za-z]*(Modal|Panel|Dialog)'\s*\|\|/, /target\.id\s*===\s*'[A-Za-z]*(Modal|Dialog)'\s*\)\s*[A-Za-z.]*(close|remove)/];
const hits = [];
for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  if (/^\s*(\/\/|\*)/.test(line)) return;
  if (BAD.some(re => re.test(line))) hits.push(`${path.relative(root, f)}:${i + 1} ${line.trim().slice(0, 140)}`);
});
assert.deepStrictEqual(hits, [], '팝업 바깥을 눌러 닫는 코드가 있어요(Esc·닫기 버튼으로만 닫혀야 해요):\n' + hits.join('\n'));
console.log('modalclose: OK');
