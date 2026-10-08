import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
  addOwnEvent: (input) => ipcRenderer.invoke(IPC.addOwnEvent, input),
  updateOwnEvent: (id, input) => ipcRenderer.invoke(IPC.updateOwnEvent, id, input),
  deleteOwnEvent: (id, day) => ipcRenderer.invoke(IPC.deleteOwnEvent, id, day),
  onCalendarChanged: (listener) => subscribe(IPC.calendarChanged, listener),
  getTasks: () => ipcRenderer.invoke(IPC.getTasks),
  syncTasks: () => ipcRenderer.invoke(IPC.syncTasks),
  loginTuwel: () => ipcRenderer.invoke(IPC.loginTuwel),
  logoutTuwel: () => ipcRenderer.invoke(IPC.logoutTuwel),
  addTodo: (input) => ipcRenderer.invoke(IPC.addTodo, input),
  setTaskDone: (id, done) => ipcRenderer.invoke(IPC.setTaskDone, id, done),
  deleteTodo: (id) => ipcRenderer.invoke(IPC.deleteTodo, id),
  onTasksChanged: (listener) => subscribe(IPC.tasksChanged, listener),
  getChanges: () => ipcRenderer.invoke(IPC.getChanges),
  dismissChange: (id) => ipcRenderer.invoke(IPC.dismissChange, id),
  onChangesChanged: (listener) => subscribe(IPC.changesChanged, listener),
  getExams: () => ipcRenderer.invoke(IPC.getExams),
  syncExams: () => ipcRenderer.invoke(IPC.syncExams),
  dismissExam: (id, dismissed) => ipcRenderer.invoke(IPC.dismissExam, id, dismissed),
  onExamsChanged: (listener) => subscribe(IPC.examsChanged, listener),
  getNotes: () => ipcRenderer.invoke(IPC.getNotes),
  setupNotes: (dir) => ipcRenderer.invoke(IPC.setupNotes, dir),
  chooseNotesDir: () => ipcRenderer.invoke(IPC.chooseNotesDir),
  readNote: (path) => ipcRenderer.invoke(IPC.readNote, path),
  writeNote: (path, content, baseModified) => ipcRenderer.invoke(IPC.writeNote, path, content, baseModified),
  flushNote: (path, content, baseModified) => ipcRenderer.sendSync(IPC.flushNote, path, content, baseModified) === true,
  createNote: (input) => ipcRenderer.invoke(IPC.createNote, input),
  noteForEvent: (eventId) => ipcRenderer.invoke(IPC.noteForEvent, eventId),
  noteForTask: (taskId) => ipcRenderer.invoke(IPC.noteForTask, taskId),
  quickNote: (text) => ipcRenderer.invoke(IPC.quickNote, text),
  renameNote: (path, name) => ipcRenderer.invoke(IPC.renameNote, path, name),
  moveNote: (path, courseKey) => ipcRenderer.invoke(IPC.moveNote, path, courseKey),
  trashNote: (path) => ipcRenderer.invoke(IPC.trashNote, path),
  importPdfs: (courseKey, files) => ipcRenderer.invoke(IPC.importPdfs, courseKey, files),
  showNoteInFolder: (path) => ipcRenderer.send(IPC.showNoteInFolder, path),
  searchNotes: (query) => ipcRenderer.invoke(IPC.searchNotes, query),
  onNotesChanged: (listener) => subscribe(IPC.notesChanged, listener),
  filePath: (file) => webUtils.getPathForFile(file),
  openMain: (view, note) => ipcRenderer.send(IPC.openMain, view, note),
  hideMini: () => ipcRenderer.send(IPC.hideMini),
  onNavigate: (listener) => subscribe<[View, string | undefined]>(IPC.navigate, listener),
  onStateChanged: (listener) => subscribe(IPC.stateChanged, listener)
}

contextBridge.exposeInMainWorld('sout', api)
