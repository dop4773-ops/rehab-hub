// 실행: node main/test_backupStatus.js
// backup.log / OneDrive_Backup.ps1 판정 규칙을 가짜 로그로 확인한다.
'use strict';
const assert = require('assert');
const { parseScript, parseLog, buildStatus } = require('./backupStatus');

const PS1 = `\uFEFF$Sources = @(
    @{
        Name = "Hospital"
        Source = "C:\\Users\\User\\OneDrive\\미래병원(OT)"
    },
    @{
        Name = "Schedule"
        Source = "C:\\Users\\User\\OneDrive\\시간표 및 현황"
    }
)
$RealtimeRoot = "C:\\Users\\User\\Desktop\\원드라이브 백업"
$ScheduleRoot = "G:\\내 드라이브\\원드라이브 스케줄백업"
$LogFile = "C:\\OneDriveBackup\\backup.log"
robocopy $Source $Destination /MIR /R:1
if ($Folders.Count -le 7) { return }
if ($Hour -ge 8 -and $Hour -le 17 -and $Minute -eq 0) {}
Start-Sleep -Seconds 60`;

// ① 스크립트 설정
const sc = parseScript(PS1);
assert.strictEqual(sc.sources.length, 2); assert.strictEqual(sc.sources[1].name, 'Schedule');
assert.strictEqual(sc.scheduleRoot, 'G:\\내 드라이브\\원드라이브 스케줄백업'); assert.strictEqual(sc.logFile, 'C:\\OneDriveBackup\\backup.log');
assert.strictEqual(sc.retentionDays, 7); assert.strictEqual(sc.startHour, 8); assert.strictEqual(sc.endHour, 17); assert.strictEqual(sc.realtimeEverySec, 60); assert(sc.mirrorRealtime);
assert.strictEqual(parseScript('').sources.length, 0); assert.strictEqual(parseScript('').retentionDays, null);
console.log('OK ① 스크립트 설정 읽기');

// 로그 만들기: [시각, 메시지]
const L = (rows) => '\uFEFF' + rows.map(([t, m]) => `[${t}] ${m}`).join('\n');
const cycle = (t, codes = [0, 1]) => [[t, 'REALTIME START'], [t, `OK: Hospital Robocopy=${codes[0]}`], [t, `OK: Schedule Robocopy=${codes[1]}`], [t, 'REALTIME END']];
const at = (y, mo, d, h, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

// ② 정상: 오늘 08·09시 예약 완료, 방금까지 실시간 동기화
let rows = [['2026-10-05 07:40:00', 'BACKUP PROGRAM STARTED']];
for (const h of [8, 9]) rows.push([`2026-10-05 0${h}:00:01`, `SCHEDULED BACKUP START: 2026-10-05 0${h}-00`], [`2026-10-05 0${h}:00:02`, 'OK: Hospital Robocopy=1'], [`2026-10-05 0${h}:00:02`, 'OK: Schedule Robocopy=0'], [`2026-10-05 0${h}:00:03`, `SCHEDULED BACKUP END: 2026-10-05 0${h}-00`]);
rows = rows.concat(cycle('2026-10-05 09:30:00'));
let st = buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 9, 30, 30) });
assert.strictEqual(st.level, 'ok'); assert(st.running);
assert.strictEqual(st.today.done, 2); assert.strictEqual(st.today.expected, 2, '켜진 뒤 지나간 정각만 예정으로 센다');
assert.strictEqual(new Date(st.nextMs).getHours(), 10);
assert.strictEqual(st.lastScheduled.state, 'done'); assert.strictEqual(st.lastScheduled.folders.length, 2);
console.log('OK ② 정상 실행·오늘 예약 현황·다음 예약');

// ③ 예약 백업이 끝나지 않고 다음 기록이 이어짐 → 중단, 오늘 정각을 건너뜀 → missed
rows = [['2026-10-05 07:40:00', 'BACKUP PROGRAM STARTED'], ['2026-10-05 08:00:01', 'SCHEDULED BACKUP START: 2026-10-05 08-00'], ['2026-10-05 08:00:02', 'OK: Hospital Robocopy=1'], ...cycle('2026-10-05 08:01:00')];
for (let m = 2; m <= 70; m += 1) rows.push(...cycle(`2026-10-05 ${String(8 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`));
st = buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 9, 11, 10) });
assert.strictEqual(st.today.ticks.find(t => t.hour === 8).state, 'interrupted');
assert.strictEqual(st.today.ticks.find(t => t.hour === 9).state, 'missed', '프로그램이 켜져 있었는데 09시 예약 기록이 없음');
assert.strictEqual(st.level, 'warn'); assert.strictEqual(st.interrupted.length, 1);
console.log('OK ③ 중단된 예약 백업·놓친 예약 백업');

// ④ 마지막 기록이 오래됨: 근무 시간이면 경고, 밤이면 꺼짐(경고 아님)
rows = [['2026-10-05 07:40:00', 'BACKUP PROGRAM STARTED'], ...cycle('2026-10-05 10:00:00')];
assert.strictEqual(buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 11, 0) }).level, 'warn');
st = buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 22, 0) });
assert.strictEqual(st.level, 'off'); assert(!st.running);
assert.strictEqual(new Date(st.nextMs).getHours(), 8, '17시 이후엔 다음 날 시작 시각');
assert.strictEqual(st.today.ticks.find(t => t.hour === 9).state, 'off', '꺼져 있던 시각은 놓친 게 아니다');
console.log('OK ④ 멈춤/꺼짐 구분');

// ⑤ 오류: 최근 동기화 폴더 실패 → err, G 드라이브 미연결 → warn
rows = [['2026-10-05 08:00:00', 'BACKUP PROGRAM STARTED'], ['2026-10-05 08:01:00', 'REALTIME START'], ['2026-10-05 08:01:00', 'ERROR: Hospital Robocopy=16'], ['2026-10-05 08:01:01', 'REALTIME END']];
st = buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 8, 1, 30) });
assert.strictEqual(st.level, 'err'); assert(/Hospital/.test(st.detail)); assert.strictEqual(st.problems.length, 1);
rows = [['2026-10-05 08:00:00', 'BACKUP PROGRAM STARTED'], ['2026-10-05 08:00:05', 'G DRIVE NOT READY'], ...cycle('2026-10-05 08:01:00')];
assert.strictEqual(buildStatus({ logText: L(rows), scriptText: PS1, now: at(2026, 10, 5, 8, 1, 30) }).level, 'warn');
console.log('OK ⑤ 오류·G 드라이브 미연결');

// ⑥ 스크립트가 없어도 기본값(08~17시, 보관 7일)으로 동작, 로그가 비어 있으면 unknown
st = buildStatus({ logText: L(cycle('2026-10-05 09:30:00')), scriptText: null, now: at(2026, 10, 5, 9, 31) });
assert.strictEqual(st.script, null); assert.strictEqual(st.config.retentionDays, 7);
assert.strictEqual(buildStatus({ logText: '', scriptText: null }).level, 'unknown');
assert.strictEqual(parseLog('\uFEFF[2026-10-05 09:30:00] hi\n잡음 줄')[0].msg, 'hi');
console.log('OK ⑥ 스크립트 없음·빈 로그·BOM');
console.log('ALL PASS');
