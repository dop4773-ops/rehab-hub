// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron main/test_itdaEvents.js (npm test가 알아서 함)
// ⚠ 실제 잇다 DB는 건드리지 않는다 — 임시 폴더에 스크래치 DB를 만들어서만 검증한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { parseGrandTitle, readGrandEvents } = require('./itdaEvents');

const P = (t, l) => parseGrandTitle(t, l);
assert.deepStrictEqual(P('RM7(5,7병동)'), { rm: 'RM7', wards: '5,7', route: 'round2' });
assert.strictEqual(P('RM7(9,8병동)').route, 'round1', '병동 순서가 바뀌어도 같은 회차');
assert.strictEqual(P('RM7(5,7병동)').route, 'round2');
assert.strictEqual(P('그랜드라운딩(RM9_8,9병동)').route, 'round1');
assert.strictEqual(P('그랜드라운딩(RM9/5,7층)', '5,7층').rm, 'RM9');
assert.strictEqual(P('그랜드라운딩(RM8/8,9층)').route, 'round1');
assert.deepStrictEqual(P('RM6', '8,9층'), { rm: 'RM6', wards: '8,9', route: 'round1' }, '제목에 병동이 없으면 장소에서');
assert.deepStrictEqual(P('회의'), { rm: null, wards: null, route: null });
console.log('OK ① 제목에서 RM·병동·회차 읽기');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-itda-events-test-'));
const dbPath = path.join(dir, 'assistant.db');
const db = new Database(dbPath);
db.exec(`CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT, category_id INTEGER, location TEXT, start_at TEXT, deleted_at TEXT);
INSERT INTO categories VALUES (1,'그랜드라운딩'),(2,'업무');
INSERT INTO events VALUES
 (1,'RM4(8,9병동)',1,NULL,'2026-10-13 00:00:00',NULL),
 (2,'RM7(5,7병동)',1,NULL,'2026-10-14 00:00:00',NULL),
 (3,'지난 일정 RM9(8,9병동)',1,NULL,'2026-10-04 00:00:00',NULL),
 (4,'오늘 RM8(8,9병동)',1,NULL,'2026-10-05 00:00:00',NULL),
 (5,'RM6(8,9병동)',1,NULL,'2026-10-20 00:00:00','2026-10-01 00:00:00'),
 (6,'다른 카테고리 RM1(8,9병동)',2,NULL,'2026-10-15 00:00:00',NULL);`);
db.close();
const r = readGrandEvents(dbPath, '2026-10-05');
assert(r.ok);
assert.deepStrictEqual(r.events.map(e => [e.date, e.rm, e.route]), [['2026-10-05', 'RM8', 'round1'], ['2026-10-13', 'RM4', 'round1'], ['2026-10-14', 'RM7', 'round2']], '오늘 포함·이전 제외·삭제/다른 카테고리 제외·날짜순');
// 읽기 전용 확인: 같은 DB에 쓰기 시도가 막혀야 한다
const ro = new Database(dbPath, { readonly: true }); assert.throws(() => ro.prepare("INSERT INTO categories VALUES (9,'x')").run()); ro.close();
assert.strictEqual(readGrandEvents(path.join(dir, '없음.db'), '2026-10-05').ok, false);
// 설정에서 카테고리 이름을 바꾼 경우: 그 이름의 일정만 가져온다(두 번째 카테고리 이름은 위 데이터에서 확인)
const cat2 = new Database(dbPath, { readonly: true }).prepare('SELECT name FROM categories WHERE id=2').get().name;
assert.deepStrictEqual(readGrandEvents(dbPath, '2026-10-05', 40, cat2).events.map(e => e.rm), ['RM1'], '카테고리 이름 지정');
assert.deepStrictEqual(readGrandEvents(dbPath, '2026-10-05', 40, '없는 카테고리').events, []);
console.log('OK ② 오늘 이후 그랜드라운딩 일정만 읽기 전용으로 조회');
fs.rmSync(dir, { recursive: true, force: true });
console.log('ALL PASS');
