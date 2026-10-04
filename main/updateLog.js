// updateLog.js — 업데이트 기록(이 PC에서 확인·다운로드·설치·오류가 있었던 때)과 GitHub 릴리즈 목록 정리(순수 함수 + 앱 데이터 폴더의 작은 JSON 파일).
// 원본 업무 파일과는 무관하다: 쓰는 곳은 앱 데이터 폴더의 update-log.json 하나뿐.
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 200;

function readEntries(file) {
  try { const a = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
// entry: {t, event, version?, message?, source?} — 최신이 위로 오도록 앞에 넣고 오래된 것은 잘라낸다
function appendEntry(file, entry, now = Date.now()) {
  const list = [{ t: now, ...entry }].concat(readEntries(file)).slice(0, MAX_ENTRIES);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list));
  return list;
}

// GitHub API(/releases) 응답 → 화면에 보일 목록. 초안(draft)은 빼고, 최신 순.
function normalizeReleases(json) {
  if (!Array.isArray(json)) return [];
  return json.filter(r => r && !r.draft).map(r => ({
    tag: String(r.tag_name || ''), version: String(r.tag_name || '').replace(/^v/i, ''), name: r.name || r.tag_name || '',
    date: r.published_at || r.created_at || '', body: String(r.body || '').trim(), url: r.html_url || '', prerelease: !!r.prerelease,
  })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
// package.json의 build.publish에서 GitHub 저장소 주소를 만든다
function repoInfo(pkg) {
  const p = pkg && pkg.build && pkg.build.publish;
  if (!p || p.provider !== 'github' || !p.owner || !p.repo) return null;
  const url = `https://github.com/${p.owner}/${p.repo}`;
  return { owner: p.owner, repo: p.repo, url, releasesUrl: url + '/releases', apiUrl: `https://api.github.com/repos/${p.owner}/${p.repo}/releases?per_page=30` };
}

module.exports = { readEntries, appendEntry, normalizeReleases, repoInfo, MAX_ENTRIES };
