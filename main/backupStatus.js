// backupStatus.js — OneDrive_Backup.ps1 이 남기는 backup.log 와 스크립트 설정을 읽어 "지금 백업이 정상인가"를 판정한다(순수 함수).
// 백업 자체는 PowerShell이 하고, 이 모듈은 읽기만 한다 — 백업 로직을 다시 만들지 않는다.
'use strict';

// 스크립트에서 설정 값을 꺼낸다. 스크립트가 없거나 형식이 달라 못 찾은 값은 null.
function parseScript(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const str = (name) => { const m = new RegExp('\\$' + name + '\\s*=\\s*"([^"]+)"').exec(t); return m ? m[1] : null; };
  const num = (re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
  const sources = [];
  const re = /Name\s*=\s*"([^"]+)"\s*Source\s*=\s*"([^"]+)"/g;
  for (let m; (m = re.exec(t));) sources.push({ name: m[1], source: m[2] });
  return {
    sources,
    realtimeRoot: str('RealtimeRoot'), scheduleRoot: str('ScheduleRoot'), logFile: str('LogFile'),
    retentionDays: num(/\$Folders\.Count\s*-le\s*(\d+)/),
    startHour: num(/\$Hour\s*-ge\s*(\d+)/), endHour: num(/\$Hour\s*-le\s*(\d+)/), minute: num(/\$Minute\s*-eq\s*(\d+)/),
    realtimeEverySec: num(/Start-Sleep\s+-Seconds\s+(\d+)/),
    mirrorRealtime: /\/MIR\b/.test(t),
  };
}

// "[2026-10-01 11:50:04] 메시지" → [{ms, msg}] (PC 로컬 시각)
function parseLog(text) {
  const out = [];
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\[(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\]\s?(.*)$/.exec(line);
    if (m) out.push({ ms: new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), msg: m[7].trim() });
  }
  return out;
}

const PROBLEM_RE = /^(ERROR|EXCEPTION|SOURCE NOT FOUND|G DRIVE NOT READY|DELETE ERROR)/;
const RESULT_RE = /^(OK|ERROR): (\S+) Robocopy=(\d+)/;
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

// 예약 백업 실행 이력: START ~ END 를 한 건으로 묶는다. END 없이 다른 기록이 이어지면 "중단"(스크립트가 도중에 멈추거나 PC가 꺼짐).
function scheduledRuns(events, now) {
  const runs = []; let cur = null;
  const close = (state) => { if (cur) { cur.state = state; runs.push(cur); cur = null; } };
  for (const e of events) {
    const st = /^SCHEDULED BACKUP START: (\d{4}-\d\d-\d\d) (\d\d)-(\d\d)/.exec(e.msg);
    if (st) { close('interrupted'); cur = { startMs: e.ms, key: `${st[1]} ${st[2]}:${st[3]}`, hour: +st[2], day: st[1], folders: [], endMs: null }; continue; }
    if (!cur) continue;
    if (/^SCHEDULED BACKUP END/.test(e.msg)) { cur.endMs = e.ms; close('done'); continue; }
    const r = RESULT_RE.exec(e.msg);
    if (r) { cur.folders.push({ name: r[2], code: +r[3], ok: r[1] === 'OK' }); continue; }
    if (PROBLEM_RE.test(e.msg)) { (cur.problems = cur.problems || []).push(e.msg); continue; }
    close('interrupted'); // 예약 백업 중에 나올 수 없는 줄(실시간 시작·프로그램 재시작 등)
  }
  if (cur) close(now - cur.startMs < 3 * MIN ? 'running' : 'interrupted');
  return runs;
}

function analyzeLog(events, config, now) {
  const cfg = { startHour: 8, endHour: 17, retentionDays: 7, realtimeEverySec: 60, ...Object.fromEntries(Object.entries(config || {}).filter(([, v]) => v != null)) };
  const last = (re) => { for (let i = events.length - 1; i >= 0; i--) if (re.test(events[i].msg)) return events[i]; return null; };
  const lastEvent = events[events.length - 1] || null;
  const lastStart = last(/^BACKUP PROGRAM STARTED/);
  const lastRealtimeEnd = last(/^REALTIME END/);
  const runs = scheduledRuns(events, now);
  const lastRun = runs[runs.length - 1] || null;
  const lastDone = [...runs].reverse().find(r => r.state === 'done') || null;

  // 가장 최근 실시간 동기화 한 번의 폴더별 결과
  let lastRealtime = [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (/^REALTIME START/.test(events[i].msg)) {
      lastRealtime = events.slice(i + 1).map(e => RESULT_RE.exec(e.msg)).filter(Boolean).slice(0, 8).map(r => ({ name: r[2], code: +r[3], ok: r[1] === 'OK' }));
      break;
    }
  }

  const since = now - 7 * DAY;
  const problems = events.filter(e => e.ms >= since && PROBLEM_RE.test(e.msg)).map(e => ({ ms: e.ms, msg: e.msg })).reverse();
  const recentRuns = runs.filter(r => r.startMs >= since);
  const interrupted = recentRuns.filter(r => r.state === 'interrupted');

  // 오늘 예약 백업: 프로그램이 켜진 뒤의 정각만 "예정"으로 센다(꺼져 있던 시간은 놓친 게 아님)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayRuns = runs.filter(r => r.day === dayKey(now));
  const ticks = [];
  for (let h = cfg.startHour; h <= cfg.endHour; h++) {
    const tickMs = todayStart.getTime() + h * HOUR;
    const run = todayRuns.find(r => r.hour === h);
    let state;
    if (run) state = run.state;
    else if (tickMs > now) state = 'upcoming';
    else if (now - tickMs < 2 * MIN) state = 'upcoming';
    else if (!events.some(e => Math.abs(e.ms - tickMs) <= 3 * MIN)) state = 'off'; // 그 시각 전후로 아무 기록이 없다 = 프로그램이 꺼져 있었음(놓친 게 아님)
    else state = 'missed';
    ticks.push({ hour: h, state });
  }

  // 최근 7일 일별 요약
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(now); d0.setHours(0, 0, 0, 0); d0.setTime(d0.getTime() - i * DAY);
    const key = dayKey(d0.getTime());
    const ev = events.filter(e => dayKey(e.ms) === key);
    if (!ev.length) { days.push({ day: key, active: false }); continue; }
    const dr = runs.filter(r => r.day === key);
    days.push({
      day: key, active: true, firstMs: ev[0].ms, lastMs: ev[ev.length - 1].ms,
      scheduledDone: dr.filter(r => r.state === 'done').length, interrupted: dr.filter(r => r.state === 'interrupted').length,
      restarts: ev.filter(e => /^BACKUP PROGRAM STARTED/.test(e.msg)).length,
      problems: ev.filter(e => PROBLEM_RE.test(e.msg)).length,
    });
  }

  // 다음 예약 백업: 정각(분=0)마다 시작 ~ 종료 시각 사이에만 실행된다
  const nextTick = new Date(now); nextTick.setMinutes(0, 0, 0); nextTick.setTime(nextTick.getTime() + HOUR);
  if (nextTick.getHours() > cfg.endHour) { nextTick.setDate(nextTick.getDate() + 1); nextTick.setHours(cfg.startHour, 0, 0, 0); }
  else if (nextTick.getHours() < cfg.startHour) nextTick.setHours(cfg.startHour, 0, 0, 0);

  // 가동 판정: 실시간 동기화가 주기마다 로그를 남기므로 마지막 기록이 최근이면 켜져 있는 것
  const idleMs = lastEvent ? now - lastEvent.ms : Infinity;
  const running = idleMs <= Math.max(3 * MIN, cfg.realtimeEverySec * 3000);
  const nowHour = new Date(now).getHours();
  const workHours = nowHour >= cfg.startHour - 1 && nowHour <= cfg.endHour + 1;
  const lastCycleBad = lastRealtime.some(r => !r.ok);
  const todayBad = ticks.filter(t => t.state === 'missed' || t.state === 'interrupted').length;
  const gNotReady = problems.find(p => /^G DRIVE NOT READY/.test(p.msg) && now - p.ms < 2 * HOUR);
  const problems24h = problems.filter(p => now - p.ms < DAY).length;

  let level, title, detail;
  if (!events.length) { level = 'unknown'; title = '백업 기록이 없어요'; detail = '로그 파일은 있지만 읽을 수 있는 기록이 없어요.'; }
  else if (!running) {
    const ago = Math.round(idleMs / MIN);
    const agoText = ago < 120 ? `${ago}분 전` : ago < 2880 ? `${Math.round(ago / 60)}시간 전` : `${Math.round(ago / 1440)}일 전`;
    if (workHours) { level = 'warn'; title = '백업 프로그램이 멈춘 것으로 보여요'; detail = `마지막 기록이 ${agoText}예요. 백업 PC에서 StartOneDriveBackup 이 실행 중인지 확인해 주세요.`; }
    else { level = 'off'; title = '지금은 꺼져 있어요 (근무 시간 외)'; detail = `마지막 기록은 ${agoText}예요. 근무 시간에 켜져 있었다면 정상이에요.`; }
  } else if (lastCycleBad) { level = 'err'; title = '실시간 백업에 오류가 있어요'; detail = `가장 최근 동기화에서 실패한 폴더: ${lastRealtime.filter(r => !r.ok).map(r => r.name).join(', ')}`; }
  else if (gNotReady) { level = 'warn'; title = 'G 드라이브가 연결되지 않았어요'; detail = '예약 백업(구글 드라이브 보관)이 건너뛰어졌어요. G 드라이브 로그인 상태를 확인해 주세요.'; }
  else if (todayBad) { level = 'warn'; title = `오늘 예약 백업 ${todayBad}건이 정상 완료되지 않았어요`; detail = '아래 "오늘 예약 백업"에서 어느 시각인지 확인해 주세요.'; }
  else if (problems24h) { level = 'warn'; title = `최근 24시간 오류 기록 ${problems24h}건`; detail = '아래 "최근 문제"를 확인해 주세요.'; }
  else { level = 'ok'; title = '백업이 정상 실행 중이에요'; detail = `마지막 실시간 동기화 ${Math.max(0, Math.round(idleMs / 1000))}초 전.`; }

  const dels = events.filter(e => /^OLD BACKUP DELETED/.test(e.msg));
  return {
    level, title, detail, running,
    lastEventMs: lastEvent && lastEvent.ms, lastStartMs: lastStart && lastStart.ms, lastRealtimeEndMs: lastRealtimeEnd && lastRealtimeEnd.ms,
    lastRealtime,
    lastScheduled: lastRun && { startMs: lastRun.startMs, endMs: lastRun.endMs, key: lastRun.key, state: lastRun.state, folders: lastRun.folders },
    lastDoneMs: lastDone && lastDone.endMs,
    today: { ticks, expected: ticks.filter(t => ['done', 'interrupted', 'missed', 'running'].includes(t.state)).length, done: ticks.filter(t => t.state === 'done').length },
    nextMs: nextTick.getTime(),
    days, problems: problems.slice(0, 10), problems24h,
    interrupted: interrupted.slice(-5).map(r => ({ key: r.key, startMs: r.startMs })).reverse(),
    lastDeleted: dels.length ? { ms: dels[dels.length - 1].ms, name: dels[dels.length - 1].msg.replace(/^OLD BACKUP DELETED:\s*/, '') } : null,
    restartsTotal: events.filter(e => /^BACKUP PROGRAM STARTED/.test(e.msg)).length,
    config: cfg,
  };
}

function buildStatus({ logText, scriptText, now = Date.now() }) {
  const script = scriptText != null ? parseScript(scriptText) : null;
  const events = parseLog(logText);
  return { script, ...analyzeLog(events, script, now) };
}

module.exports = { parseScript, parseLog, scheduledRuns, analyzeLog, buildStatus };
