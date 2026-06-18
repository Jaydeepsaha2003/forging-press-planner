import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>,
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  channels: IPC,
};

contextBridge.exposeInMainWorld('fp', api);

export type FpApi = typeof api;
