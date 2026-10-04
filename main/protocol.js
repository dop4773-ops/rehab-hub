// protocol.js — renderer(쉘)와 3개 도구 iframe을 전부 같은 app://rehab-shell/ 출처로 서빙한다.
// 목적: iframe.contentDocument로 서로 접근하려면 "진짜 동일 출처"가 필요한데, Electron 기본 file://는
// 서로 다른 로컬 문서 사이의 이 접근을 막을 수 있다. webSecurity를 끄는 대신, 커스텀 protocol로
// 표준 동일-출처 규칙을 만족시켜서 기본 보안 설정(webSecurity on)을 그대로 유지한다.
'use strict';
const path = require('path');
const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');

const SCHEME = 'app';
const HOST = 'rehab-shell';
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');

const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com", "frame-src 'self'", "object-src 'none'", "base-uri 'self'",
].join('; ');

function registerSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

function registerProtocolHandler() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('not found', { status: 404 });
    const relPath = decodeURIComponent(url.pathname || '/index.html');
    const filePath = path.normalize(path.join(RENDERER_ROOT, relPath));
    // 상위 폴더 접근(../) 차단. startsWith(RENDERER_ROOT)만 쓰면 "renderer_evil" 같은 형제 폴더도
    // 문자열이 접두어로 겹쳐서 통과해버린다 — 구분자까지 포함해서 검사해야 진짜 하위 경로만 허용된다.
    if (filePath !== RENDERER_ROOT && !filePath.startsWith(RENDERER_ROOT + path.sep)) return new Response('forbidden', { status: 403 });
    // 화면(셸·도구) 전부에 같은 보안 정책을 붙인다: 앱 안 파일만 실행하고, 서버 통신은 인수인계 구글 시트(Apps Script)로만 허용.
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers); headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  });
}

function shellUrl(relPath = '/index.html') {
  return `${SCHEME}://${HOST}${relPath}`;
}

module.exports = { registerSchemePrivileges, registerProtocolHandler, shellUrl };
