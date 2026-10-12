// syncHealth.js — "OneDrive 동기화가 멈췄을 수 있나"를 판단하는 순수 함수(화면·파일·프로세스 접근 없음).
// 브라우저: <script src="core/syncHealth.js"> / Node: require() (테스트용)
// 확실한 신호는 OneDrive 프로그램이 꺼져 있는 것뿐이고, 파일이 오래된 것은 "멈췄을 수 있다"는 가능성으로만 알린다(동기화 상태를 직접 읽을 방법은 없다).
'use strict';
(function (root) {
// 평일마다 고치는 파일들 — 이 파일들이 며칠째 안 바뀌면 동기화를 의심한다
const DAILY_ROLES = ['dailySchedule', 'status', 'card3', 'card10', 'mt3', 'mat10', 'table10'];
const isOneDrivePath = (p) => /[\\/]OneDrive[^\\/]*(?:[\\/]|$)/i.test(String(p || ''));
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };
const md = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
// 마지막으로 바뀐 날 다음날부터 오늘까지의 평일 수(오늘은 11시 이후에만 센다 — 아침엔 아직 안 고쳤을 수 있다)
function workdaysSince(mtimeMs, now) {
  const last = startOfDay(mtimeMs), today = startOfDay(now), hour = new Date(now).getHours();
  let n = 0;
  for (const d = new Date(last); ; ) {
    d.setDate(d.getDate() + 1); if (d > today) break;
    const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
    if (d.getTime() === today.getTime() && hour < 11) continue;
    n++;
  }
  return n;
}
// matched: {역할: {path, name, mtimeMs}} · running: OneDrive 프로세스 실행 여부(true/false, 모르면 null) → {level:'off'|'ok'|'warn'|'err', title, detail, key}
function evaluate({ matched, running, now = Date.now(), minDays = 2 }) {
  const od = Object.entries(matched || {}).filter(([role, f]) => f && role !== 'handover' && isOneDrivePath(f.path));
  if (!od.length) return { level: 'off', title: '', detail: '', key: '' };
  if (running === false) return { level: 'err', title: 'OneDrive가 꺼져 있어요', detail: 'OneDrive 프로그램이 실행 중이 아니라서 시간표·현황이 최신이 아닐 수 있어요. 작업 표시줄에서 OneDrive를 켜 주세요.', key: 'off' };
  const daily = od.filter(([role]) => DAILY_ROLES.includes(role)).map(([, f]) => f);
  if (daily.length) {
    const newest = daily.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a)), lag = workdaysSince(newest.mtimeMs, now);
    if (lag >= minDays) return { level: 'warn', title: `OneDrive 파일이 ${lag}일째 안 바뀌었어요`, detail: `가장 최근에 바뀐 파일은 ${md(newest.mtimeMs)}의 「${newest.name}」이에요. OneDrive 동기화가 멈췄을 수 있어요 — 작업 표시줄의 OneDrive 아이콘을 확인해 보세요(연휴·휴무였다면 무시해도 돼요).`, key: `lag${lag}:${md(newest.mtimeMs)}` };
  }
  return { level: 'ok', title: '', detail: '', key: '' };
}
const api = { DAILY_ROLES, isOneDrivePath, workdaysSince, evaluate };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RehabSyncHealth = api;
})(typeof window !== 'undefined' ? window : globalThis);
