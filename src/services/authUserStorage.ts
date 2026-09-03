import { Settings } from 'react-native';

import type { User } from '../api/types';

const AUTH_USER_STORAGE_KEY = 'lottielite.auth_user';

type StoredAuthUser = Pick<User, 'phone' | 'email'>;

type UserStorage = {
  get: (key: string) => unknown;
  set: (values: Record<string, string>) => void;
};

const resolveStorage = (storage?: UserStorage) => storage ?? Settings;

/** 保存抽屉等界面需要的轻量用户信息，避免持久化完整接口响应。 */
export function saveAuthUser(
  user: Partial<StoredAuthUser>,
  storage?: UserStorage,
) {
  const value: StoredAuthUser = {
    phone: typeof user.phone === 'string' ? user.phone.trim() : '',
    email: typeof user.email === 'string' ? user.email.trim() : '',
  };
  resolveStorage(storage).set({
    [AUTH_USER_STORAGE_KEY]: JSON.stringify(value),
  });
}

/** 读取登录用户；数据缺失或损坏时返回 undefined。 */
export function getAuthUser(storage?: UserStorage): StoredAuthUser | undefined {
  try {
    const raw = resolveStorage(storage).get(AUTH_USER_STORAGE_KEY);
    if (typeof raw !== 'string' || !raw) {
      return undefined;
    }
    const value = JSON.parse(raw) as Partial<StoredAuthUser>;
    return {
      phone: typeof value.phone === 'string' ? value.phone : '',
      email: typeof value.email === 'string' ? value.email : '',
    };
  } catch {
    return undefined;
  }
}

/** 退出登录时同步清空本地用户展示信息。 */
export function clearAuthUser(storage?: UserStorage) {
  try {
    resolveStorage(storage).set({ [AUTH_USER_STORAGE_KEY]: '' });
  } catch {
    // 清理展示信息失败不阻止退出登录流程。
  }
}

/** 手机号优先，没有手机号时使用邮箱。 */
export function getAuthUserAccount(user?: Partial<StoredAuthUser>) {
  return user?.phone?.trim() || user?.email?.trim() || '未设置账号';
}
