// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron main/test_itdaEvents.js (npm test가 알아서 함)
// ⚠ 실제 잇다 DB는 건드리지 않는다 — 임시 폴더에 스크래치 DB를 만들어서만 검증한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { parseGrandTitle, readGrandEvents, parseLeaveTitle, parseEvalTitle, readHomeInfo } = require('./itdaEvents');

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

// 홈 현황판: 구글캘린더 부재 + 평가 예정
assert.deepStrictEqual(parseLeaveTitle('정유정T연차'), { name: '정유정', label: '연차', half: '' });
assert.deepStrictEqual(parseLeaveTitle('박란영T 오후반차'), { name: '박란영', label: '오후반차', half: 'PM' });
assert.strictEqual(parseLeaveTitle('김OT오전반차').half, 'AM');
assert.strictEqual(parseLeaveTitle('성지현T휴가').label, '휴가');
assert.strictEqual(parseLeaveTitle('3팀'), null, '선생님 일정이 아님');
assert.strictEqual(parseLeaveTitle(''), null);
assert.deepStrictEqual(parseEvalTitle('이정홍,최병권,김순자E COSAS'), { names: ['이정홍', '최병권', '김순자E'], test: 'COSAS' });
assert.deepStrictEqual(parseEvalTitle('윤창호'), { names: ['윤창호'], test: '' });
const db2 = new Database(dbPath);
db2.exec(`INSERT INTO categories VALUES (3,'평가');
INSERT INTO events VALUES (10,'윤창호 COSAS',3,NULL,'2026-10-06 00:00:00',NULL),(11,'지난 평가 A COSAS',3,NULL,'2026-10-01 00:00:00',NULL),(12,'너무 먼 B COSAS',3,NULL,'2026-12-01 00:00:00',NULL),(13,'삭제 C COSAS',3,NULL,'2026-10-07 00:00:00','2026-10-01 00:00:00');
CREATE TABLE google_calendar_events (id INTEGER PRIMARY KEY, title TEXT, start_at TEXT, end_at TEXT);
INSERT INTO google_calendar_events VALUES
 (1,'정유정T연차','2026-10-05 00:00:00','2026-10-05 23:59:59'),
 (2,'성지현T휴가','2026-10-04 00:00:00','2026-10-06 23:59:59'),
 (3,'3팀','2026-10-05 00:00:00','2026-10-05 23:59:59'),
 (4,'이규림T연차','2026-10-12 00:00:00','2026-10-12 23:59:59'),
 (5,'박란영T오후반차','2026-10-06 00:00:00','2026-10-07 00:00:00');`);
db2.close();
const h = readHomeInfo(dbPath, '2026-10-05', '2026-10-11', '2026-10-26');
assert(h.ok);
assert.deepStrictEqual(h.leaves.map(l => [l.name, l.label, l.from, l.to]), [['성지현', '휴가', '2026-10-04', '2026-10-06'], ['정유정', '연차', '2026-10-05', '2026-10-05'], ['박란영', '오후반차', '2026-10-06', '2026-10-06']], '기간에 걸친 부재만, 선생님 일정만, 다음날 0시 끝은 하루 줄임');
assert.deepStrictEqual(h.evals.map(e => [e.date, e.names[0], e.test]), [['2026-10-06', '윤창호', 'COSAS']], '평가 예정은 기간 안·삭제 제외');
assert.strictEqual(readHomeInfo(path.join(dir, '없음.db'), '2026-10-05', '2026-10-11').ok, false);
// 구글캘린더 테이블이 없는 옛 잇다 DB: 평가 예정은 그대로, 부재만 안내
const old = path.join(dir, 'old.db'); const d3 = new Database(old); d3.exec("CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT, category_id INTEGER, location TEXT, start_at TEXT, deleted_at TEXT);"); d3.close();
const ho = readHomeInfo(old, '2026-10-05', '2026-10-11'); assert(ho.ok && ho.leaves.length === 0 && ho.leaveError);
console.log('OK ③ 홈 현황판: 구글캘린더 부재·평가 예정 읽기');
fs.rmSync(dir, { recursive: true, force: true });
console.log('ALL PASS');
