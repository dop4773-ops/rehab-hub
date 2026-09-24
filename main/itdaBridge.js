// itdaBridge.js — 재활치료부 앱이 찾아낸 일거리(치료기록 오류·교차검증 불일치 등)를
// 잇다(itda)의 Inbox("빠른 입력, 자동 분류 없음, 단순 저장")로 한 줄 보낸다.
// 앱을 합치지 않고, 잇다의 assistant.db(SQLite)에 한 행만 직접 INSERT하는 가장 가벼운 방식.
// 자동 판단은 하지 않는다 — 사용자가 잇다에서 직접 열어보고 할일/일정으로 정리한다(잇다 Inbox 철학과 동일).
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { pushInboxItemToDb } = require('./itdaInboxWriter');

// 두 앱 다 Electron의 표준 userData 경로 관습을 쓴다 — package.json의 "name"이 폴더명이 되므로
// (itda는 "itda"), 이 앱의 userData 경로에서 한 칸 위로 올라가 "itda" 폴더를 찾으면 된다.
function itdaDbPath() {
  return path.join(app.getPath('userData'), '..', 'itda', 'assistant.db');
}

function itdaInstalled() {
  return fs.existsSync(itdaDbPath());
}

function pushInboxItem(content) {
  return pushInboxItemToDb(itdaDbPath(), content);
}

module.exports = { itdaDbPath, itdaInstalled, pushInboxItem };
