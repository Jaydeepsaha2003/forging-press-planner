import type { IPC } from '../../shared/ipc-channels';

export interface FpApi {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
  channels: typeof IPC;
}

declare global {
  interface Window {
    fp: FpApi;
  }
}

export const fp: FpApi = window.fp;
