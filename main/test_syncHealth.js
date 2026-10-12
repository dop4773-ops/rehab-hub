// 실행: node main/test_syncHealth.js — OneDrive 동기화 점검 판정(꺼짐 / 평일 파일이 며칠째 안 바뀜 / 정상 / OneDrive 아님)
'use strict';
const assert = require('assert');
const H = require('../renderer/core/syncHealth');
const T = (s) => new Date(s).getTime();
const f = (p, mtime, name = 'x.xlsx') => ({ path: p, name, mtimeMs: T(mtime) });
const OD = 'C:\\Users\\a\\OneDrive - 병원\\시간표\\', mac = '/Users/a/Library/CloudStorage/OneDrive-개인/미래병원/';
assert.ok(H.isOneDrivePath(OD + 'a.xlsx') && H.isOneDrivePath(mac + 'a.xlsx') && !H.isOneDrivePath('D:\\자료\\a.xlsx'));
// 2026-10-12는 월요일. 금요일(10/9)에 마지막으로 고쳤다면 월요일 오전은 정상, 월요일 오후는 하루 지난 것(정상), 화요일 오후부터 2일(경고)
assert.strictEqual(H.workdaysSince(T('2026-10-09T15:00'), T('2026-10-12T09:00')), 0);
assert.strictEqual(H.workdaysSince(T('2026-10-09T15:00'), T('2026-10-12T14:00')), 1);
assert.strictEqual(H.workdaysSince(T('2026-10-09T15:00'), T('2026-10-13T14:00')), 2);
assert.strictEqual(H.workdaysSince(T('2026-10-09T15:00'), T('2026-10-11T14:00')), 0, '일요일엔 세지 않는다');
const ev = (matched, running, now) => H.evaluate({ matched, running, now: T(now) });
const daily = { status: f(OD + '현황.xlsx', '2026-10-09T15:00', '현황.xlsx'), dailySchedule: f(OD + '시간표.xlsx', '2026-10-08T10:00', '시간표.xlsx') };
assert.strictEqual(ev(daily, true, '2026-10-12T14:00').level, 'ok');
const w = ev(daily, true, '2026-10-13T14:00'); assert.strictEqual(w.level, 'warn'); assert.match(w.title, /2일째/); assert.match(w.detail, /10\/9/);
assert.strictEqual(ev(daily, false, '2026-10-12T09:00').level, 'err', '꺼져 있으면 파일이 최신이어도 알린다');
assert.strictEqual(ev(daily, null, '2026-10-12T09:00').level, 'ok', '프로세스를 모르면(Mac 등) 꺼짐으로 보지 않는다');
assert.strictEqual(ev({ status: f('D:\\자료\\현황.xlsx', '2026-09-01T10:00') }, false, '2026-10-13T14:00').level, 'off', 'OneDrive 폴더가 아니면 아무것도 안 한다');
assert.strictEqual(ev({ handover: f(OD + 'a.xlsx', '2020-01-01T00:00') }, false, '2026-10-13T14:00').level, 'off');
assert.strictEqual(ev({ pta: f(OD + 'pta.xlsx', '2026-08-01T00:00') }, true, '2026-10-13T14:00').level, 'ok', '매일 고치지 않는 파일(PTA 등)은 오래돼도 경고하지 않는다');
console.log('syncHealth: OK');
