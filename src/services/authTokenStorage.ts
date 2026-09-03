import { Settings } from 'react-native';

const AUTH_TOKEN_STORAGE_KEY = 'lottielite.auth_token';

type TokenStorage = {
  get: (key: string) => unknown;
  set: (values: Record<string, string>) => void;
};

const resolveStorage = (storage?: TokenStorage) => storage ?? Settings;

/** 读取已持久化的登录 Token；空字符串和异常都视为未登录。 */
export function getAuthToken(storage?: TokenStorage) {
  try {
    const value = resolveStorage(storage).get(AUTH_TOKEN_STORAGE_KEY);
    return typeof value === 'string' && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

/** 登录成功后保存 Token，供下次冷启动恢复登录态。 */
export function saveAuthToken(token: string, storage?: TokenStorage) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('不能保存空的登录 Token');
  }
  resolveStorage(storage).set({ [AUTH_TOKEN_STORAGE_KEY]: normalizedToken });
}

/** 退出登录后清空 Token；Settings 没有 remove，因此写入空字符串。 */
export function clearAuthToken(storage?: TokenStorage) {
  try {
    resolveStorage(storage).set({ [AUTH_TOKEN_STORAGE_KEY]: '' });
  } catch {
    // 清理失败不阻止界面退出登录，下一次鉴权仍由服务端校验。
  }
}
