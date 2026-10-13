// test_dailyReport.js — 홈 「오늘 점검」 결과 만들기. 실행: node main/test_dailyReport.js
'use strict';
const assert = require('assert'); const D = require('../renderer/core/dailyReport.js');
const now = Date.parse('2026-10-13T09:00:00');
const base = { files: { reqFound: 6, reqTotal: 6, missReq: [], stale: [], err: [], synced: 2 }, handover: { cls: 'ok', text: '인수인계 방금 가져옴' }, cross: { count: 0, since: null, carry: null, anomalies: [], skipNotes: [], byWho: [] }, acting: { count: 0 }, sync: { level: 'ok' }, backup: { level: 'ok', title: '백업 정상' }, now };

let r = D.build(base);
assert.strictEqual(r.level, 'ok'); assert.ok(/이상 없음/.test(r.text)); assert.ok(/필수 파일 6\/6 최신 · 이번에 2개/.test(r.text)); assert.ok(r.text.startsWith('[10/13(화) 오늘 점검]'));

r = D.build({ ...base, files: { ...base.files, missReq: ['작업치료현황'], stale: ['3F 전체시간표'] }, cross: null, acting: null });
assert.strictEqual(r.level, 'err'); assert.ok(/필수 파일 1개를 못 찾았어요: 작업치료현황/.test(r.text)); assert.ok(/교차검증을 실행하지 못했어요/.test(r.text)); assert.ok(/액팅 기록 파일이 없어/.test(r.text));

r = D.build({ ...base, cross: { count: 5, since: '2026-10-12', newCount: 2, resolvedCount: 4, carry: { count: 3, hot: 1 }, anomalies: ['현황판 입원·재입원 환자 12명 (평소 40명)'], skipNotes: ['PTA 대조'], byWho: [{ name: '김A', count: 3 }] } });
assert.strictEqual(r.level, 'err', '3일 이상 계속된 건이 있으면 빨강');
assert.ok(/불일치 5건 \(10\/12 이후 새로 2 · 해결 4\)/.test(r.text)); assert.ok(/자료가 평소와 달라요: 현황판/.test(r.text)); assert.ok(/검사하지 못한 것: PTA 대조/.test(r.text)); assert.ok(/김A 3/.test(r.text));
const cs = r.sections.find(s => s.key === 'cross'); assert.strictEqual(cs.level, 'err');

r = D.build({ ...base, cross: { ...base.cross, count: 2, carry: { count: 1, hot: 0 } }, sync: { level: 'err', title: 'OneDrive가 꺼져 있어요', detail: '켜 주세요' }, backup: { level: 'off' } });
assert.strictEqual(r.level, 'err', '파일 구역의 OneDrive 꺼짐이 전체를 빨강으로'); assert.ok(/OneDrive가 꺼져 있어요 — 켜 주세요/.test(r.text)); assert.ok(!r.sections.some(s => s.key === 'backup'));
assert.strictEqual(D.build({ ...base, acting: { count: 3, warnCount: 1 } }).level, 'err');
assert.strictEqual(D.build({ ...base, handover: { cls: 'warn', text: '인수인계 3시간 전' } }).level, 'warn');
assert.strictEqual(D.build({}).sections.length >= 3, true, '빈 입력도 안 깨짐');
console.log('dailyReport: OK');
