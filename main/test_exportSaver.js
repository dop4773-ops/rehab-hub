// 실행: node main/test_exportSaver.js
// 파일 내보내기 저장 위치 규칙: 기본은 다운로드 폴더, 설정한 폴더가 있으면 그곳, 같은 이름은 덮어쓰지 않고 번호를 붙인다.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const E = require('./exportSaver');

const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-ud-')), dl = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-dl-')), custom = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-c-'));
try {
  // ① 설정 없음 → 다운로드 폴더
  assert.strictEqual(E.resolveDir(ud, dl, {}), dl);
  // ② 폴더를 지정하면 그곳, 지정한 폴더가 사라지면 다운로드 폴더로 되돌아감, 비우면 기본
  E.saveDir(ud, custom); assert.strictEqual(E.resolveDir(ud, dl, {}), custom);
  fs.rmSync(custom, { recursive: true }); assert.strictEqual(E.resolveDir(ud, dl, {}), dl);
  fs.mkdirSync(custom); E.saveDir(ud, ''); assert.strictEqual(E.resolveDir(ud, dl, {}), dl);
  // ③ 점검용 환경변수가 가장 먼저
  E.saveDir(ud, custom); assert.strictEqual(E.resolveDir(ud, dl, { REHAB_EXPORT_DIR: '/x/y' }), '/x/y');
  // ④ 같은 이름은 번호를 붙여 덮어쓰지 않음, 위험한 글자는 바꿈
  const set = new Set(); const ex = (p) => set.has(p);
  const p1 = E.uniquePath(dl, '그랜드라운딩_전체.xlsx', ex); assert.strictEqual(path.basename(p1), '그랜드라운딩_전체.xlsx'); set.add(p1);
  const p2 = E.uniquePath(dl, '그랜드라운딩_전체.xlsx', ex); assert.strictEqual(path.basename(p2), '그랜드라운딩_전체 (1).xlsx'); set.add(p2);
  assert.strictEqual(path.basename(E.uniquePath(dl, '그랜드라운딩_전체.xlsx', ex)), '그랜드라운딩_전체 (2).xlsx');
  assert.strictEqual(E.safeName('../a:b*c?.csv'), '_a_b_c_.csv'); assert.strictEqual(path.dirname(E.uniquePath(dl, '../../etc/passwd', ex)), dl);
  assert.strictEqual(E.safeName(''), '내보내기');
  console.log('exportSaver: OK');
} finally { for (const d of [ud, dl, custom]) fs.rmSync(d, { recursive: true, force: true }); }
