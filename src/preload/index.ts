import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type SoutApi, type View } from '../shared/types'

// The only bridge between the UI and the main process. The UI has no Node.js access.

function subscribe<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as Args))
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: SoutApi = {
  getInfo: () => ipcRenderer.invoke(IPC.getInfo),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  getAutostart: () => ipcRenderer.invoke(IPC.getAutostart),
  setAutostart: (enabled) => ipcRenderer.invoke(IPC.setAutostart, enabled),
  getSecretsStatus: () => ipcRenderer.invoke(IPC.getSecretsStatus),
  saveTissToken: (input) => ipcRenderer.invoke(IPC.saveTissToken, input),
  testTiss: () => ipcRenderer.invoke(IPC.testTiss),
  clearSecret: (key) => ipcRenderer.invoke(IPC.clearSecret, key),
  getCalendar: () => ipcRenderer.invoke(IPC.getCalendar),
  syncCalendar: () => ipcRenderer.invoke(IPC.syncCalendar),
  updateCourse: (key, patch) => ipcRenderer.invoke(IPC.updateCourse, key, patch),
  onCalendarChanged: (listener) => subscribe(IPC.calendarChanged, listener),
  openMain: (view) => ipcRenderer.send(IPC.openMain, view),
  hideMini: () => ipcRenderer.send(IPC.hideMini),
  onNavigate: (listener) => subscribe<[View]>(IPC.navigate, listener),
  onStateChanged: (listener) => subscribe(IPC.stateChanged, listener)
}

contextBridge.exposeInMainWorld('sout', api)
