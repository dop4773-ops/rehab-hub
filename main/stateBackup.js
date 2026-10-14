// stateBackup.js — 렌더러가 보낸 중요 기록 사본({키: 글자})을 앱 데이터 폴더의 state-backup.json에 보관하고 읽어 준다.
// 앱이 자기 데이터 폴더에 쓰는 파일이며 원본(시간표·현황 등)은 건드리지 않는다. 쓰다 끊겨도 깨지지 않게 임시 파일에 쓴 뒤 바꿔 끼운다.
'use strict';
const fs = require('fs');
const path = require('path');
const MAX_BYTES = 8 * 1024 * 1024; // 비정상적으로 큰 값은 저장하지 않는다
const fileOf = (dir) => path.join(dir, 'state-backup.json');
function load(dir) {
  try { const o = JSON.parse(fs.readFileSync(fileOf(dir), 'utf8')); return o && typeof o === 'object' && o.data && typeof o.data === 'object' ? o.data : {}; } catch (e) { return {}; }
}
function save(dir, data, now = Date.now()) {
  if (!data || typeof data !== 'object') return false;
  const clean = {}; for (const [k, v] of Object.entries(data)) if (/^rehab_[a-z0-9_]+$/.test(k) && typeof v === 'string') clean[k] = v;
  const text = JSON.stringify({ v: 1, savedAt: now, data: clean });
  if (text.length > MAX_BYTES) return false;
  try { fs.mkdirSync(dir, { recursive: true }); const tmp = fileOf(dir) + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, fileOf(dir)); return true; } catch (e) { return false; }
}
module.exports = { load, save, fileOf };
