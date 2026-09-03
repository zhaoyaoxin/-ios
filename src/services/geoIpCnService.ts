import { Settings } from 'react-native';

import type { GnjiasuApiClient } from '../api';
import { GnjiasuApiClient as ApiClient } from '../api';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';

const GEOIP_CN_MD5_STORAGE_KEY = 'lottielite.geoip_cn_md5';
const GEOIP_CN_CONTENT_STORAGE_KEY = 'lottielite.geoip_cn_content';

/** 仅保留 init MD5 版本标识的规范形式，避免大小写差异触发重复下载。 */
const normalizeMd5 = (value?: string | null) =>
  value?.trim().toLowerCase() ?? '';

const logGeoIp = (message: string, detail?: unknown) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__ === true) {
    console.log(`[GeoIP] ${message}`, detail ?? '');
  }
};

/**
 * 版本标识和原始 JSON 保存在 JS 可访问的 Settings 持久化键中。
 * 加速时由 JS 解析为白名单数组，通过 start 的规则 JSON 传给原生层。
 */
export type GeoIpCnStorage = {
  getMd5: () => Promise<string | null>;
  getContent: () => Promise<string | null>;
  save: (rawJson: string, md5: string) => Promise<boolean>;
};

type SettingsStorage = {
  get: (key: string) => unknown;
  set: (values: Record<string, string>) => void;
};

const jsGeoIpStorage: GeoIpCnStorage = {
  async getMd5() {
    try {
      const value = (Settings as SettingsStorage).get(GEOIP_CN_MD5_STORAGE_KEY);
      return typeof value === 'string' && value.trim() ? value : null;
    } catch {
      return null;
    }
  },
  async getContent() {
    try {
      const value = (Settings as SettingsStorage).get(
        GEOIP_CN_CONTENT_STORAGE_KEY,
      );
      return typeof value === 'string' && value.trim() ? value : null;
    } catch {
      return null;
    }
  },
  async save(rawJson, md5) {
    try {
      // 一次 set 同时更新内容和 init 版本标识，JS 下次启动能直接读取二者。
      (Settings as SettingsStorage).set({
        [GEOIP_CN_CONTENT_STORAGE_KEY]: rawJson,
        [GEOIP_CN_MD5_STORAGE_KEY]: md5,
      });
      return true;
    } catch {
      return false;
    }
  },
};

type GeoIpApiClient = Pick<GnjiasuApiClient, 'getGeoIpCn'>;
type GeoIpBootstrapClient = Pick<GnjiasuApiClient, 'getGeoIpCn' | 'initialize'>;

// 读取函数可能在启动流程之外调用，准备一个可独立工作的 iOS API 客户端。
const geoIpApiClient = new ApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

// init 已经拿到过的摘要会保存在当前 JS 会话，避免「本地文件缺失」时重复请求 init。
let latestGeoIpCnMd5: string | undefined;

export type GeoIpCnSyncResult = 'up-to-date' | 'updated';

/** 由 init 流程记录最新服务端摘要，供按需读取函数复用。 */
export function rememberGeoIpCnMd5(md5?: string) {
  latestGeoIpCnMd5 = normalizeMd5(md5) || undefined;
}

/** 请求原始 GeoIP JSON，并在 JS 本地缓存中同时写入内容和对应版本标识。 */
async function downloadAndSaveGeoIpCn(
  client: GeoIpApiClient,
  storage: GeoIpCnStorage,
  md5: string,
  options?: { signal?: AbortSignal },
): Promise<'updated'> {
  const rawJson = await client.getGeoIpCn(options);
  if (!rawJson.trim()) {
    throw new Error('中国 IP 库下载为空');
  }
  const saved = await storage.save(rawJson, md5);
  if (!saved) {
    throw new Error('中国 IP 库保存失败');
  }
  logGeoIp('文件下载并保存成功', { textLength: rawJson.length });
  return 'updated';
}

/**
 * 在应用启动时比较本地保存的 init MD5 和本次 init 返回的 MD5：
 * 相同不请求；不同或本地不存在时请求 /storage/geoip_cn.json 并由 JS 层保存。
 * 若 init 没有返回 MD5，无法判断本地文件是否最新，因此本次启动强制重新下载。
 */
export async function syncGeoIpCn(
  remoteMd5: string | undefined,
  client: GeoIpApiClient,
  storage: GeoIpCnStorage = jsGeoIpStorage,
  options?: { signal?: AbortSignal },
): Promise<GeoIpCnSyncResult> {
  const normalizedRemoteMd5 = normalizeMd5(remoteMd5);
  if (!normalizedRemoteMd5) {
    logGeoIp(
      'init 未返回 geoip_cn_md5，无法比对版本，强制请求 /storage/geoip_cn.json',
    );
    // 没有服务端版本时用空版本标识保存；下次启动仍会走本分支并重新同步。
    return downloadAndSaveGeoIpCn(client, storage, '', options);
  } else {
    const localMd5 = normalizeMd5(await storage.getMd5());
    logGeoIp('启动版本比对', {
      initGeoIpCnMd5: normalizedRemoteMd5,
      localGeoIpCnMd5: localMd5 || null,
    });
    if (localMd5 === normalizedRemoteMd5) {
      logGeoIp('版本一致，不请求 /storage/geoip_cn.json');
      return 'up-to-date';
    }

    logGeoIp('版本不一致，开始请求 /storage/geoip_cn.json');
    return downloadAndSaveGeoIpCn(
      client,
      storage,
      normalizedRemoteMd5,
      options,
    );
  }
}

export type ReadLocalGeoIpCnOptions = {
  storage?: GeoIpCnStorage;
  client?: GeoIpBootstrapClient;
  signal?: AbortSignal;
};

/**
 * 读取 JS 本地缓存的原始 /storage/geoip_cn.json 内容。
 * 若不存在，会先取得 init 的 geoip_cn_md5（本次启动已取得则复用），再下载、保存、
 * 返回。若 init 没有版本字段，也会强制下载，业务层无需自己判断缓存是否存在。
 */
export async function readLocalGeoIpCnContent(
  options: ReadLocalGeoIpCnOptions = {},
): Promise<string | null> {
  const storage = options.storage ?? jsGeoIpStorage;
  const cachedContent = await storage.getContent();
  if (cachedContent?.trim()) {
    return cachedContent;
  }

  const client = options.client ?? geoIpApiClient;
  let remoteMd5 = latestGeoIpCnMd5;
  if (!remoteMd5) {
    const initResponse = await client.initialize({ signal: options.signal });
    if (initResponse.code !== 0 && initResponse.code !== 200) {
      throw new Error(initResponse.message || '客户端初始化失败');
    }
    remoteMd5 = initResponse.data?.geoip_cn_md5;
    rememberGeoIpCnMd5(remoteMd5);
  }
  await syncGeoIpCn(remoteMd5, client, storage, {
    signal: options.signal,
  });
  const downloadedContent = await storage.getContent();
  if (!downloadedContent?.trim()) {
    throw new Error('中国 IP 库保存后仍无法读取');
  }
  return downloadedContent;
}

/** 读取启动时缓存的白名单，保留全部条目及空数组，不把 JSON 文本二次编码。 */
export async function readLocalGeoIpCnWhitelist(
  options: ReadLocalGeoIpCnOptions = {},
): Promise<string[]> {
  const rawJson = await readLocalGeoIpCnContent(options);
  let whitelist: unknown;
  try {
    whitelist = JSON.parse(rawJson ?? '');
  } catch {
    throw new Error('中国 IP 白名单 JSON 无法解析');
  }
  if (
    !Array.isArray(whitelist) ||
    !whitelist.every(item => typeof item === 'string')
  ) {
    throw new Error('中国 IP 白名单格式错误：需要字符串数组');
  }
  return whitelist;
}
