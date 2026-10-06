// 실행: node main/test_settings.js
// 설정 기본값·검증, 예전 저장값 옮겨오기, 단축키 충돌 판정, 설정 파일 내보내기/가져오기를 확인한다.
'use strict';
const assert = require('assert');
const S = require('../renderer/settings-core');

const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } });

// ① 기본값, 잘못된 값은 기본값으로
assert.deepStrictEqual(S.normalize(null), S.DEFAULTS);
const n = S.normalize({ fontSize: 'huge', checkSec: '60', color: 'vivid', shortcuts: 'yes', grandTime: '13', itdaCategory: '  ', syncMode: '5' });
assert.strictEqual(n.fontSize, 'normal'); assert.strictEqual(n.checkSec, 60); assert.strictEqual(n.color, 'vivid');
assert.strictEqual(n.shortcuts, true); assert.strictEqual(n.grandTime, '13'); assert.strictEqual(n.itdaCategory, '그랜드라운딩'); assert.strictEqual(n.syncMode, '5');
assert.notStrictEqual(S.normalize({}).keymap, S.DEFAULTS.keymap); // 기본값 객체를 공유하지 않는다

// ② 저장/불러오기 왕복, 예전 키에서 한 번 옮겨오기
const o = {}; S.save(mem(o), S.normalize({ dataView: 'board', startView: 'data' }));
assert.strictEqual(S.load(mem(o)).dataView, 'board'); assert.strictEqual(S.load(mem(o)).startView, 'data');
const legacy = S.load(mem({ rehab_sync_mode: '30', rehab_data_view_v1: 'board' }));
assert.strictEqual(legacy.syncMode, '30'); assert.strictEqual(legacy.dataView, 'board');
assert.deepStrictEqual(S.load(mem({ rehab_settings_v1: '{깨진' })), S.DEFAULTS);

// ③ 단축키 표기·입력
assert.strictEqual(S.normKeys('shift+ctrl+f'), 'Ctrl+Shift+F');
assert.strictEqual(S.normKeys('Ctrl+Enter'), 'Ctrl+Enter');
assert.strictEqual(S.keysFromEvent({ ctrlKey: true, key: 'k' }), 'Ctrl+K');
assert.strictEqual(S.keysFromEvent({ metaKey: true, shiftKey: true, key: 'f' }), 'Ctrl+Shift+F');
assert.strictEqual(S.keysFromEvent({ key: 'k' }), null); // Ctrl 없이는 안 됨
assert.strictEqual(S.keysFromEvent({ ctrlKey: true, key: 'Control' }), null);
assert.strictEqual(S.normalize({ keymap: { a: 'F5', b: 'ctrl+j' } }).keymap.a, undefined); // Ctrl 없는 조합은 버린다
assert.strictEqual(S.normalize({ keymap: { b: 'ctrl+j' } }).keymap.b, 'Ctrl+J');

// ④ 충돌: 같은 화면·공통끼리만 겹침, 다른 화면끼리는 같은 키 허용
const items = [{ id: 'nav:home', scope: 'global', keys: 'Ctrl+1' }, { id: 'a.find', scope: 'acting', keys: 'Ctrl+F' }, { id: 'c.find', scope: 'cross', keys: 'Ctrl+F' }, { id: 'c.run', scope: 'cross', keys: 'Ctrl+Enter' }];
assert.strictEqual(S.findConflict(items, 'a.find', 'Ctrl+1').id, 'nav:home');     // 공통과 겹침
assert.strictEqual(S.findConflict(items, 'c.run', 'Ctrl+F').id, 'c.find');        // 같은 화면과 겹침
assert.strictEqual(S.findConflict(items, 'a.find', 'Ctrl+Enter'), null);          // 다른 화면의 키는 괜찮음
assert.strictEqual(S.findConflict(items, 'a.find', 'Ctrl+C').reserved, true);
assert.strictEqual(S.findConflict(items, 'c.run', 'Ctrl+F', { 'c.find': 'Ctrl+G' }), null); // 바꿔 둔 키는 새 키 기준

// ⑤ 설정 파일 내보내기/가져오기
const json = S.exportJson(S.normalize({ fontSize: 'large' }), [{ id: '1', label: '시간표', dirPath: 'G:\\a' }], '0.9.0', new Date('2026-10-06T00:00:00Z'));
const back = S.parseImport(json);
assert.ok(back.ok); assert.strictEqual(back.settings.fontSize, 'large'); assert.deepStrictEqual(back.folders, [{ label: '시간표', dirPath: 'G:\\a' }]);
assert.strictEqual(S.parseImport('이건 설정이 아님').ok, false);
assert.strictEqual(S.parseImport('{"app":"other","settings":{}}').ok, false);

console.log('settings: OK');
