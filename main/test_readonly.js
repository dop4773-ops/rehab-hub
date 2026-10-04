// 실행: node main/test_readonly.js
// "원본 파일(시간표·현황·인수인계 등)은 절대 건드리지 않는다"는 규칙을 코드로 지키는 정적 검사.
// 새 코드가 파일을 쓰거나 지우거나 서버에 쓰기 요청을 보내면 이 테스트가 실패해서, 사람이 한 번 더 확인하게 한다.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

// ① main/ 에서 파일을 쓰거나 지우는 코드는 아래 파일에만 있고, 대상은 앱 자체 설정/보관 파일(userData)뿐이어야 한다
const WRITE_RE = /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|unlinkSync|unlink|rmSync|rm|rmdirSync|rmdir|renameSync|rename|copyFileSync|copyFile|truncateSync|truncate|openSync)\s*\(/;
const ALLOWED = {
  'main/updater.js': /settingsPath/,                       // 업데이트 모드 설정
  'main/folderStore.js': /storePath|manualPath/,           // 등록 폴더 목록·직접 고른 파일 목록(경로만 저장)
  'main/scheduleArchive.js': /fileFor\(/,                  // 그랜드라운딩 일정 보관함(앱 데이터 폴더)
  'main/ipc/backup.ipc.js': /configPath/,                  // 백업 로그 위치 설정
  'main/updateLog.js': /file\b/,                           // 업데이트 기록(앱 데이터 폴더의 update-log.json)
};
const mainFiles = walk(path.join(root, 'main')).filter(f => f.endsWith('.js') && !/\/test_/.test(f.split(path.sep).join('/')));
const found = [];
for (const f of mainFiles.concat(path.join(root, 'preload.js'))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line) || !WRITE_RE.test(line)) return;
    found.push({ file: rel(f), line: i + 1, text: line.trim() });
  });
}
for (const hit of found) {
  const ok = ALLOWED[hit.file];
  assert(ok, `허용되지 않은 파일 쓰기/삭제 코드: ${hit.file}:${hit.line}  ${hit.text}\n→ 원본 파일을 건드리는 코드가 아닌지 확인하고, 앱 설정 파일이면 이 테스트의 ALLOWED에 이유와 함께 추가하세요.`);
  assert(ok.test(hit.text), `쓰기 대상이 앱 설정/보관 경로가 아닙니다: ${hit.file}:${hit.line}  ${hit.text}`);
}
console.log(`OK ① main/ 파일 쓰기 ${found.length}곳 전부 앱 설정·보관 파일 대상`);

// ② 잇다 Inbox에 한 줄 쓰는 코드(itdaInboxWriter)는 사용자가 "잇다로 보내기"를 누를 때만 — 호출 지점이 그 IPC 하나뿐인지 확인
const callers = mainFiles.filter(f => /itdaInboxWriter/.test(fs.readFileSync(f, 'utf8')) && !/itdaInboxWriter\.js$/.test(f)).map(rel);
assert.deepStrictEqual(callers, ['main/itdaBridge.js'], `잇다 쓰기 호출 지점이 늘었습니다: ${callers}`);
console.log('OK ② 잇다 Inbox 쓰기는 "잇다로 보내기" 한 경로뿐');

// ③ 화면(renderer)에는 파일 쓰기 권한·서버 쓰기 요청이 없어야 한다. 내보내기는 새 파일 다운로드(Blob)뿐.
const rendererFiles = walk(path.join(root, 'renderer')).filter(f => /\.(js|html)$/.test(f));
const BAD = [
  [/createWritable|showSaveFilePicker|getFileHandle|removeEntry|FileSystemWritable/, '브라우저 파일 쓰기 API'],
  [/mode\s*:\s*['"]readwrite['"]/, '읽기/쓰기 권한 요청(읽기만 허용)'],
  [/method\s*:\s*['"](POST|PUT|DELETE|PATCH)['"]/i, '서버 쓰기 요청(인수인계는 조회만 허용)'],
];
// 예외: 인수인계 화면은 원래 쓰던 구글 시트 인수인계 프로그램 그대로라 휴지통·퇴원 처리 등 서버 쓰기가 있다(사용자 요청 2026-10-05).
// 이건 시간표·현황 등 엑셀 원본이 아니라 인수인계 구글 시트 전용이며, 요청은 전부 그 시트 주소(GAS_URL)로만 간다.
const HANDOVER_APP = 'renderer/tools/인수인계.html';
for (const f of rendererFiles) {
  const text = fs.readFileSync(f, 'utf8');
  for (const [re, why] of BAD) {
    if (rel(f) === HANDOVER_APP && /서버 쓰기/.test(why)) continue;
    assert(!re.test(text), `${rel(f)}: ${why} 사용`);
  }
}
const ho = fs.readFileSync(path.join(root, HANDOVER_APP), 'utf8');
const fetchTargets = [...ho.matchAll(/fetch\(\s*([^,)]+)/g)].map(m => m[1].trim());
assert(fetchTargets.length > 0 && fetchTargets.every(t => /^(GAS_URL|`\$\{GAS_URL\})/.test(t)), `인수인계 화면이 구글 시트 주소(GAS_URL) 밖으로 요청을 보냄: ${fetchTargets}`);
assert(!/createWritable|showSaveFilePicker|getFileHandle|removeEntry/.test(ho), '인수인계 화면에 로컬 파일 쓰기 API');
console.log('OK ③ 화면 코드에 파일 쓰기·서버 쓰기 없음(폴더 선택은 읽기 전용)');
console.log('ALL PASS');
