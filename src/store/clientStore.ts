import { create } from 'zustand';

import type { ClientInitResponse } from '../api/types';

type ClientState = {
  initialization: ClientInitResponse | null;
  setInitialization: (initialization: ClientInitResponse) => void;
  clearInitialization: () => void;
};

/** 每次冷启动由客户端初始化接口刷新的公共配置。 */
export const useClientStore = create<ClientState>(set => ({
  initialization: null,
  setInitialization: initialization => set({ initialization }),
  clearInitialization: () => set({ initialization: null }),
}));
