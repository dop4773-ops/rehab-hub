// 실행: node main/test_updater.js
// update_mode(수동/자동) 저장·조회 왕복과 기본값을 확인한다(electron-updater는 개발 모드 분기 이전에
// 등록되는 핸들러만 테스트 — 패키징 전용 부분은 실제 electron 없이는 검증 불가).
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initUpdater } = require('./updater');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-updater-test-'));
const fakeApp = { isPackaged: false, getPath: () => userDataDir, getVersion: () => '0.0.0-test' };

const handlers = new Map();
const fakeIpcMain = { handle: (channel, fn) => handlers.set(channel, fn) };

initUpdater(fakeApp, fakeIpcMain, () => null);

(async () => {
  // ① 기본값은 수동
  assert.strictEqual(await handlers.get('updater:getMode')(), 'manual', '신규 설치 기본값은 수동이어야 함');
  console.log('OK ① 저장된 값이 없으면 기본값은 수동');

  // ② 자동으로 바꾸면 저장되고 그대로 다시 읽힘
  assert.strictEqual(await handlers.get('updater:setMode')(null, 'auto'), 'auto');
  assert.strictEqual(await handlers.get('updater:getMode')(), 'auto', '설정한 값이 그대로 조회돼야 함');
  console.log('OK ② 자동으로 설정하면 저장되고 다시 읽어도 유지됨');

  // ③ 잘못된 값은 수동으로 방어
  await handlers.get('updater:setMode')(null, '이상한값');
  assert.strictEqual(await handlers.get('updater:getMode')(), 'manual', '\'auto\' 이외의 값은 수동으로 방어해야 함');
  console.log('OK ③ auto/manual 이외의 값은 수동으로 안전하게 처리');

  // ④ 개발 모드에서는 checkNow/quitAndInstall이 dev-mode 응답
  assert.strictEqual((await handlers.get('updater:checkNow')()).status, 'dev-mode');
  assert.strictEqual((await handlers.get('updater:quitAndInstall')()).status, 'dev-mode');
  console.log('OK ④ 개발 모드(패키징 안 됨)에서는 checkNow/quitAndInstall이 안전하게 dev-mode 응답');
})();
