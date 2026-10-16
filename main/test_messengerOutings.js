// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron main/test_messengerOutings.js (npm test가 알아서 함)
// ⚠ 실제 메신저 DB는 건드리지 않는다 — 임시 폴더에 가짜 DB(가상 이름)를 만들어서만 검증한다.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { createFakeMessengerDb } = require('../scripts/fake-messenger-db');
const { outingsForDate } = require('./messenger/outings');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-msg-test-'));
const hashDir = () => fs.readdirSync(dir).sort().map((f) => f + ':' + crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex')).join('|');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date(), at = (n) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));

for (const wal of [true, false]) { // 메신저가 켜져 있을 때(-wal 있음)와 꺼져 있을 때(복사본으로 읽음) 둘 다
  const file = path.join(dir, `messenger-${wal}.db`); createFakeMessengerDb(file, { today, wal });
  const before = hashDir();
  const r0 = outingsForDate(file, at(0)); assert.ok(r0.ok, r0.message);
  assert.deepStrictEqual(r0.rows.map((x) => x.patient), ['한서윤'], '오늘: 외박 1명(취소된 건 뺀다)');
  assert.strictEqual(r0.rows[0].category, '외박'); assert.strictEqual(r0.rows[0].endDate, at(2));
  assert.deepStrictEqual(outingsForDate(file, at(1)).rows.map((x) => x.patient).sort(), ['윤도윤', '한서윤'], '이틀째: 외박 중인 사람도 나온다(기간이 겹치면)');
  assert.deepStrictEqual(outingsForDate(file, at(2)).rows.map((x) => x.patient), ['한서윤'], '삭제된 건 뺀다');
  assert.strictEqual(hashDir(), before, '원본(과 그 옆 파일)이 읽기 전후로 그대로여야 한다(wal=' + wal + ')');
}
assert.strictEqual(outingsForDate(path.join(dir, 'none.db'), at(0)).code, 'NOT_FOUND');
assert.strictEqual(outingsForDate(path.join(dir, 'messenger-true.db'), '내일').code, 'BAD_DATE');
const bad = path.join(dir, 'bad.db'); createFakeMessengerDb(bad, { today, wal: false, dropColumns: { outing_schedules: ['category'] } });
assert.strictEqual(outingsForDate(bad, at(0)).code, 'INCOMPAT', '구조가 달라지면 우아하게 실패');
fs.rmSync(dir, { recursive: true, force: true });
console.log('messengerOutings: OK');
