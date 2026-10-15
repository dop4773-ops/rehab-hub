// updateErrors.js — 앱 업데이트(electron-updater) 실패 메시지를 「정확하고 짧은 사유 + 해결 방법」으로 바꾼다.
// 원래 메시지는 영어에 HTTP 헤더·주소·스택이 줄줄이 붙어 길고 무섭게 보여서, 화면에는 사유 한 문장과 안내 한 줄만 보여 주고 원문은 detail(기록 파일·마우스 올림)로만 남긴다.
// explain(err) → { reason, hint, detail }  (순수 함수, 테스트: main/test_updateErrors.js)
'use strict';

const RULES = [
  // [이름, 원문에서 찾을 패턴, 사유, 해결 안내] — 위에서부터 먼저 맞는 것을 쓴다
  ['cert', /CERT_|certificate|SSL|UNABLE_TO_VERIFY|self[- ]signed|ERR_CERT/i, '보안 인증서를 확인하지 못했어요', '병원 보안 프로그램(프록시)이 연결을 가로채고 있을 수 있어요. 전산 담당자에게 github.com 접속 허용을 요청하거나, 인터넷이 되는 곳에서 설치 파일을 받아 설치하세요.'],
  ['offline', /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i, '인터넷에 연결되어 있지 않아요(GitHub 주소를 찾지 못함)', '네트워크 연결을 확인한 뒤 다시 시도하세요. 병원망이라 외부 접속이 막혀 있으면 인터넷이 되는 곳에서 설치 파일을 받아 설치하세요.'],
  ['timeout', /ETIMEDOUT|ERR_TIMED_OUT|ESOCKETTIMEDOUT|timeout|timed out|ECONNRESET|ERR_CONNECTION_(RESET|CLOSED|REFUSED|TIMED_OUT)|ECONNREFUSED|socket hang up/i, 'GitHub에서 응답이 없어요(연결이 끊기거나 너무 오래 걸림)', '잠시 뒤 다시 시도하세요. 계속되면 망이 느리거나 막힌 것이니 인터넷이 되는 곳에서 설치 파일을 받아 설치하세요.'],
  ['ratelimit', /rate limit|API rate|\b403\b/i, 'GitHub 접속 횟수 제한에 걸렸어요', '같은 망에서 확인을 너무 자주 해서 생기는 일이에요. 한 시간쯤 뒤에 다시 시도하세요.'],
  ['auth', /\b401\b|Unauthorized|Bad credentials/i, '업데이트 저장소에 접근할 권한이 없어요', '저장소가 비공개로 바뀌었을 수 있어요. 만든 사람에게 알려 주세요.'],
  ['nofile', /latest\.yml|Cannot find|\b404\b|Not Found|ERR_HTTP_RESPONSE_CODE_FAILURE/i, '업데이트 정보 파일(latest.yml)을 GitHub 릴리즈에서 찾지 못했어요', '새 버전을 올리는 중이거나 릴리즈가 비어 있을 수 있어요. 잠시 뒤 다시 시도하고, 계속되면 만든 사람에게 알려 주세요.'],
  ['checksum', /sha512|sha256|checksum|integrity|hash mismatch/i, '받은 업데이트 파일이 손상됐어요', '다시 시도하면 새로 받아요. 계속되면 인터넷이 되는 곳에서 설치 파일을 받아 설치하세요.'],
  ['disk', /ENOSPC/i, '디스크 공간이 부족해요', '내 PC의 빈 공간을 확보한 뒤 다시 시도하세요.'],
  ['perm', /EPERM|EACCES|EBUSY|EEXIST|operation not permitted|permission denied|resource busy/i, '업데이트 파일을 저장하거나 설치하지 못했어요(권한 또는 다른 프로그램이 파일을 잡고 있음)', '백신·보안 프로그램이 막고 있을 수 있어요. 프로그램을 완전히 종료했다 다시 켠 뒤 시도하거나, 관리자 권한으로 설치 파일을 실행하세요.'],
  ['signature', /signature|publisherName|not signed/i, '업데이트 파일의 서명을 확인하지 못했어요', '만든 사람에게 알려 주세요.'],
];

function firstLine(s) { return String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; }

function explain(err) {
  const raw = String((err && (err.stack && String(err.message || '').length < 3 ? err.stack : err.message)) || err || '').trim();
  const code = err && err.code ? ' ' + err.code : '';
  const hay = raw + code;
  const detail = hay.replace(/\s+/g, ' ').slice(0, 300);
  for (const [, re, reason, hint] of RULES) if (re.test(hay)) return { reason, hint, detail };
  const line = firstLine(raw).replace(/^Error:\s*/i, '').slice(0, 120);
  return { reason: line ? `알 수 없는 오류예요 — ${line}` : '알 수 없는 오류가 발생했어요', hint: '잠시 뒤 다시 시도하고, 계속되면 설정 › 업데이트·정보의 「기록 파일」을 만든 사람에게 보내 주세요.', detail };
}

module.exports = { explain };
