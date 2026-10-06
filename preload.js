// preload.js — renderer(HTML/JS)에서는 window.rehab.* 로만 메인 프로세스 기능에 접근 가능.
// ipcRenderer, fs, require 등은 절대 노출하지 않는다.
'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('rehab', {
  folders: {
    choose: (label) => ipcRenderer.invoke('folders:choose', label),
    list: () => ipcRenderer.invoke('folders:list'),
    addPath: (dirPath, label) => ipcRenderer.invoke('folders:addPath', dirPath, label),
    remove: (id) => ipcRenderer.invoke('folders:remove', id),
    scanAll: () => ipcRenderer.invoke('folders:scanAll'),
    fileRoles: () => ipcRenderer.invoke('folders:fileRoles'),
    readFile: (path) => ipcRenderer.invoke('folders:readFile', path),
    openFolder: (path) => ipcRenderer.invoke('folders:openFolder', path),
    chooseFile: (role) => ipcRenderer.invoke('folders:chooseFile', role),
    clearManual: (role) => ipcRenderer.invoke('folders:clearManual', role),
  },
  schedules: {
    save: (entry) => ipcRenderer.invoke('schedules:save', entry),
    list: () => ipcRenderer.invoke('schedules:list'),
    load: (ids) => ipcRenderer.invoke('schedules:load', ids),
    delete: (id) => ipcRenderer.invoke('schedules:delete', id),
  },
  backup: {
    status: () => ipcRenderer.invoke('backup:status'),
    chooseLog: () => ipcRenderer.invoke('backup:chooseLog'),
    resetLog: () => ipcRenderer.invoke('backup:resetLog'),
    open: (kind) => ipcRenderer.invoke('backup:open', kind),
  },
  itda: {
    installed: () => ipcRenderer.invoke('itda:installed'),
    grandEvents: (category) => ipcRenderer.invoke('itda:grandEvents', category),
    pushInboxItem: (content) => ipcRenderer.invoke('itda:pushInboxItem', content),
  },
  app: {
    dataDir: () => ipcRenderer.invoke('app:dataDir'),
    openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
    setZoom: (factor) => webFrame.setZoomFactor(factor), // 설정 > 글자 크기 — 도구 화면(iframe)까지 같이 커지고 작아진다
  },
  updater: {
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    getMode: () => ipcRenderer.invoke('updater:getMode'),
    setMode: (mode) => ipcRenderer.invoke('updater:setMode', mode),
    checkNow: () => ipcRenderer.invoke('updater:checkNow'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    postpone: () => ipcRenderer.invoke('updater:postpone'),
    openLog: () => ipcRenderer.invoke('updater:openLog'),
    getInfo: () => ipcRenderer.invoke('updater:getInfo'),
    getLog: () => ipcRenderer.invoke('updater:getLog'),
    releases: () => ipcRenderer.invoke('updater:releases'),
    openUrl: (kind) => ipcRenderer.invoke('updater:openUrl', kind),
    onStatus: (cb) => ipcRenderer.on('updater:status', (event, status) => cb(status)),
  },
});
