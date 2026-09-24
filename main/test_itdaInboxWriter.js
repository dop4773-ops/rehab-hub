// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron main/test_itdaInboxWriter.js
// better-sqlite3는 Electron ABI로 빌드되어 있어(npm postinstall의 electron-rebuild) plain node로는
// 못 돌린다 — ELECTRON_RUN_AS_NODE로 Electron의 Node 런타임을 그대로 빌려쓴다.
// ⚠ 실제 잇다 DB(~/Library/Application Support/itda/assistant.db)는 사용자의 실제 데이터라
// 이 테스트는 절대 건드리지 않는다 — 매번 임시 폴더에 새 스크래치 DB를 만들어서만 검증한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { pushInboxItemToDb } = require('./itdaInboxWriter');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-itda-bridge-test-'));
const dbPath = path.join(dir, 'assistant.db');

// 실제 잇다 스키마의 inbox_items 테이블만 최소로 재현(이 테스트가 검증하려는 범위에 필요한 컬럼만).
const db = new Database(dbPath);
db.exec(`CREATE TABLE inbox_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  is_processed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)`);
db.close();

// ① 정상 삽입
const r1 = pushInboxItemToDb(dbPath, '[재활치료부 앱] 교차검증 불일치 4건 발견');
assert.strictEqual(r1.ok, true, JSON.stringify(r1));
const check = new Database(dbPath);
const rows = check.prepare('SELECT content, is_processed FROM inbox_items').all();
check.close();
assert.strictEqual(rows.length, 1, '한 행만 삽입되어야 함');
assert.strictEqual(rows[0].content, '[재활치료부 앱] 교차검증 불일치 4건 발견');
assert.strictEqual(rows[0].is_processed, 0, '자동으로 처리 완료 표시하면 안 됨(사용자가 직접 분류)');
console.log('OK ① inbox_items에 정확히 한 행 삽입됨(자동 처리 표시 없음)');

// ② DB 파일이 없으면(잇다 미설치) 예외를 던지지 않고 친절한 실패로 응답
const missing = pushInboxItemToDb(path.join(dir, '없음', 'assistant.db'), '내용');
assert.strictEqual(missing.ok, false);
assert(missing.message.includes('설치'), missing.message);
console.log('OK ② 잇다 DB가 없을 때도 죽지 않고 안내 메시지로 응답');

// ③ 빈 내용은 보내지 않음
const empty = pushInboxItemToDb(dbPath, '   ');
assert.strictEqual(empty.ok, false);
console.log('OK ③ 빈 내용은 보내지 않음');

// ④ 실제 잇다 스키마의 트리거(예: search_index 연동)가 있어도 raw INSERT가 깨지지 않는지 확인
//    (트리거가 참조하는 다른 테이블이 있는 실제 환경을 흉내: search_index 비슷한 부수 테이블 + 트리거)
const dbPath2 = path.join(dir, 'assistant_with_trigger.db');
const db2 = new Database(dbPath2);
db2.exec(`
  CREATE TABLE inbox_items (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, is_processed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE search_index (type TEXT, ref_id INTEGER, title TEXT, body TEXT);
  CREATE TRIGGER trg_inbox_ai AFTER INSERT ON inbox_items BEGIN
    INSERT INTO search_index (type, ref_id, title, body) VALUES ('inbox', NEW.id, '', NEW.content);
  END;
`);
db2.close();
const r2 = pushInboxItemToDb(dbPath2, '트리거 있는 실제 스키마 흉내');
assert.strictEqual(r2.ok, true, JSON.stringify(r2));
const check2 = new Database(dbPath2);
const idx = check2.prepare('SELECT * FROM search_index').all();
check2.close();
assert.strictEqual(idx.length, 1, '기존 트리거가 그대로 발동해야 함(앱이 아니라 DB 엔진이 실행하므로)');
console.log('OK ④ 잇다의 기존 트리거(search_index 등)와도 충돌 없이 함께 동작');

fs.rmSync(dir, { recursive: true, force: true });
console.log('ALL PASS');
