import { GnjiasuApiClient } from '../api';
import type { IosCategory } from '../api/types';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';

/** 与其他服务保持一致：新接口返回 0，部分旧接口仍返回 200。 */
const isSuccessCode = (code: number) => code === 0 || code === 200;

const apiClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

type HelpApiClient = Pick<GnjiasuApiClient, 'getIosCategories'>;

/** 常见问题页的咨询分类树：一级作分类，children 作问题列表。 */
export async function loadHelpCategories(
  client: HelpApiClient = apiClient,
  options?: { signal?: AbortSignal },
): Promise<IosCategory[]> {
  const response = await client.getIosCategories(options);
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '分类列表获取失败');
  }
  return response.data ?? [];
}
