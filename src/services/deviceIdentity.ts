import { Settings } from 'react-native';

const INSTALL_MAC_STORAGE_KEY = 'lottielite.install_mac_address';
const MAC_ADDRESS_PATTERN = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;

type SettingsStorage = {
  get: (key: string) => unknown;
  set: (values: Record<string, string>) => void;
};

/**
 * 生成本地管理的单播 MAC 格式标识。
 * 02 表示该地址由应用本地生成，不会冒充设备的真实硬件 MAC。
 */
export function createInstallMacAddress(random = Math.random) {
  const bytes = Array.from({ length: 5 }, () =>
    Math.floor(random() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase(),
  );
  return ['02', ...bytes].join(':');
}

/**
 * 首次安装启动时生成标识并写入 iOS UserDefaults，之后始终复用同一个值。
 */
export function getOrCreateInstallMacAddress(storage?: SettingsStorage) {
  let resolvedStorage: SettingsStorage;
  try {
    resolvedStorage = storage ?? Settings;
  } catch {
    // 非 iOS 原生环境没有 SettingsManager，仅生成当前会话可用的安装标识。
    return createInstallMacAddress();
  }

  let savedValue: unknown;
  try {
    savedValue = resolvedStorage.get(INSTALL_MAC_STORAGE_KEY);
  } catch {
    // Jest 或原生模块尚未就绪时允许继续生成，避免阻断 App 启动。
    savedValue = undefined;
  }
  if (typeof savedValue === 'string' && MAC_ADDRESS_PATTERN.test(savedValue)) {
    return savedValue;
  }

  const generatedValue = createInstallMacAddress();
  try {
    resolvedStorage.set({ [INSTALL_MAC_STORAGE_KEY]: generatedValue });
  } catch {
    // iOS 正常运行时 Settings 会写入 UserDefaults；无原生环境时只返回本次值。
  }
  return generatedValue;
}
