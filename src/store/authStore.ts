import { create } from 'zustand';

import type { User } from '../api/types';

type AuthState = {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
};

/**
 * 当前进程的登录用户状态。
 * App 每次冷启动都会通过个人资料接口刷新这里的数据，页面只订阅需要的字段。
 */
export const useAuthStore = create<AuthState>(set => ({
  user: null,
  setUser: user => set({ user }),
  clearUser: () => set({ user: null }),
}));

/** 手机号只在展示层脱敏，Zustand 中仍保留接口返回的完整数据。 */
export const maskPhoneNumber = (phone: string) => {
  const normalized = phone.trim();
  if (normalized.length <= 7) {
    return normalized.replace(/.(?=.{2})/g, '*');
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
};

/** 侧边抽屉账号展示：优先显示脱敏手机号，其次显示邮箱。 */
export const selectUserAccount = (state: AuthState) => {
  const phone = state.user?.phone?.trim();
  return phone
    ? maskPhoneNumber(phone)
    : state.user?.email?.trim() || '未设置账号';
};
