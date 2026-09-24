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

function registerSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

function registerProtocolHandler() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('not found', { status: 404 });
    const relPath = decodeURIComponent(url.pathname || '/index.html');
    const filePath = path.normalize(path.join(RENDERER_ROOT, relPath));
    if (!filePath.startsWith(RENDERER_ROOT)) return new Response('forbidden', { status: 403 }); // 상위 폴더 접근(../) 차단
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function shellUrl(relPath = '/index.html') {
  return `${SCHEME}://${HOST}${relPath}`;
}

module.exports = { registerSchemePrivileges, registerProtocolHandler, shellUrl };
