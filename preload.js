// preload.js — renderer(HTML/JS)에서는 window.rehab.* 로만 메인 프로세스 기능에 접근 가능.
// ipcRenderer, fs, require 등은 절대 노출하지 않는다.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rehab', {
  folders: {
    choose: (label) => ipcRenderer.invoke('folders:choose', label),
    list: () => ipcRenderer.invoke('folders:list'),
    remove: (id) => ipcRenderer.invoke('folders:remove', id),
    scanAll: () => ipcRenderer.invoke('folders:scanAll'),
    fileRoles: () => ipcRenderer.invoke('folders:fileRoles'),
    readFile: (path) => ipcRenderer.invoke('folders:readFile', path),
    openFolder: (path) => ipcRenderer.invoke('folders:openFolder', path),
  },
  schedules: {
    save: (dateKey, patients) => ipcRenderer.invoke('schedules:save', dateKey, patients),
    list: () => ipcRenderer.invoke('schedules:list'),
    load: (dateKeys) => ipcRenderer.invoke('schedules:load', dateKeys),
    delete: (dateKey) => ipcRenderer.invoke('schedules:delete', dateKey),
  },
  itda: {
    installed: () => ipcRenderer.invoke('itda:installed'),
    pushInboxItem: (content) => ipcRenderer.invoke('itda:pushInboxItem', content),
  },
  updater: {
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    checkNow: () => ipcRenderer.invoke('updater:checkNow'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (cb) => ipcRenderer.on('updater:status', (event, status) => cb(status)),
  },
});
