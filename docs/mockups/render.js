// 사용: ./node_modules/.bin/electron docs/mockups/render.js  — 목업 HTML을 PNG로 저장한다
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.whenReady().then(async () => {
  for (const n of (process.argv[2] ? [process.argv[2]] : ['home', 'data'])) {
    const w = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: false } });
    await w.loadFile(path.join(__dirname, `${n}_mockup.html`)); await new Promise(r => setTimeout(r, 1200));
    const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(__dirname, `${n}_mockup.png`), img.toPNG()); w.destroy();
  }
  app.quit();
});
