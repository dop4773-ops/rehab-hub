// test_updateErrors.js — 업데이트 실패 사유 변환. 실행: node main/test_updateErrors.js
'use strict';
const assert = require('assert'); const { explain } = require('./updateErrors');
const E = (m, code) => Object.assign(new Error(m), code ? { code } : {});
const t = (err, re, label) => { const x = explain(err); assert.ok(re.test(x.reason), `${label}: ${x.reason}`); assert.ok(x.hint.length > 5 && x.reason.length < 90 + 30, label + ' 길이'); assert.ok(!/\n/.test(x.reason), label + ' 줄바꿈 없음'); return x; };
t(E('net::ERR_INTERNET_DISCONNECTED'), /인터넷에 연결/, '인터넷 끊김');
t(E('getaddrinfo ENOTFOUND github.com', 'ENOTFOUND'), /인터넷에 연결/, 'DNS');
t(E('net::ERR_CERT_AUTHORITY_INVALID'), /인증서/, '인증서');
t(E('unable to verify the first certificate'), /인증서/, '인증서2');
t(E('connect ETIMEDOUT 20.200.245.247:443', 'ETIMEDOUT'), /응답이 없어요/, '시간 초과');
t(E('read ECONNRESET'), /응답이 없어요/, '연결 끊김');
// electron-updater가 흔히 내는 긴 404 메시지: 헤더 덩어리가 붙어도 사유는 한 문장
const long404 = 'Cannot find latest.yml in the latest release artifacts (https://github.com/dop4773-ops/rehab-hub/releases/download/v0.44.0/latest.yml): HttpError: 404\n"method: GET url: https://github.com/dop4773-ops/rehab-hub/releases/download/v0.44.0/latest.yml\n\nPlease double check that your authentication token is correct.\nHeaders: {\n  "server": "GitHub.com"\n}';
const x404 = t(E(long404), /latest\.yml/, '404'); assert.ok(x404.detail.length <= 300 && !/\n/.test(x404.detail));
t(E('HttpError: 403 rate limit exceeded'), /횟수 제한/, '403');
t(E('401 Unauthorized'), /권한/, '401');
t(E('sha512 checksum mismatch, expected abc got def'), /손상/, '체크섬');
t(E('ENOSPC: no space left on device', 'ENOSPC'), /디스크 공간/, '디스크');
t(E("EPERM: operation not permitted, open 'C:\\...\\installer.exe'", 'EPERM'), /권한|파일을 잡고/, '권한');
// 알 수 없는 오류: 원문 첫 줄만 짧게, 안내는 따로
const unk = explain(E('Something weird happened\nstack line 1\nstack line 2')); assert.ok(/알 수 없는 오류예요 — Something weird happened/.test(unk.reason) && !/stack line/.test(unk.reason));
assert.ok(explain(null).reason.includes('알 수 없는 오류'));
assert.ok(explain('문자열 오류').detail.includes('문자열 오류'));
console.log('updateErrors 테스트 통과');
