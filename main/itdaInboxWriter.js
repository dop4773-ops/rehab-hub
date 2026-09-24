// itdaInboxWriter.js — 잇다(itda)의 assistant.db에 Inbox 항목 한 줄을 직접 INSERT하는 핵심 로직.
// electron 모듈에 의존하지 않는다(경로 계산은 itdaBridge.js가 담당) — 그래야
// ELECTRON_RUN_AS_NODE로 better-sqlite3(Electron ABI로 빌드됨)를 그대로 쓰면서 테스트할 수 있다.
'use strict';
const fs = require('fs');

// 매번 새 커넥션을 열고 바로 닫는다 — 이 앱은 잇다에 항상 붙어있을 필요가 없고(가끔 한 줄
// 보내는 용도), 커넥션을 계속 들고 있으면 잇다 쪽 업데이트/백업 작업과 파일을 오래 붙잡을 수 있다.
function pushInboxItemToDb(dbPath, content) {
  if (!fs.existsSync(dbPath)) {
    return { ok: false, message: '잇다가 설치되어 있지 않거나 아직 한 번도 실행되지 않았습니다.' };
  }
  if (!content || !content.trim()) {
    return { ok: false, message: '보낼 내용이 없습니다.' };
  }
  const Database = require('better-sqlite3');
  let db;
  try {
    db = new Database(dbPath);
    db.pragma('busy_timeout = 3000'); // 잇다가 마침 쓰기 작업 중이어도 잠깐 기다렸다 진행
    db.prepare('INSERT INTO inbox_items (content) VALUES (?)').run(content);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `잇다 Inbox에 저장하지 못했습니다: ${err.message}` };
  } finally {
    if (db) db.close();
  }
}

module.exports = { pushInboxItemToDb };
