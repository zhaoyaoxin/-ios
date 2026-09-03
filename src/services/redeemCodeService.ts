import { GnjiasuApiClient } from '../api';
import type { User } from '../api/types';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';
import { saveAuthUser } from './authUserStorage';
import { getOrCreateInstallMacAddress } from './deviceIdentity';

export const LEGACY_REDEEM_CODE_REGEX = /^\d{2}to\d{4}h\d{7}$/;

const apiClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

type RedeemApiClient = Pick<
  GnjiasuApiClient,
  'getProfile' | 'redeemCard' | 'redeemCode'
>;

const wait = (duration: number) =>
  new Promise<void>(resolve => setTimeout(resolve, duration));

const isSuccess = (code: number) => code === 0 || code === 200;

/** 根据口令格式选择旧卡密或新口令接口，成功后刷新用户资料。 */
export async function redeemPasscode(
  passcode: string,
  user: Pick<User, 'product_id'> | null,
  client: RedeemApiClient = apiClient,
  delay: (duration: number) => Promise<void> = wait,
) {
  const code = passcode.trim();
  if (!code) {
    throw new Error('请输入兑换码');
  }

  const response = LEGACY_REDEEM_CODE_REGEX.test(code)
    ? await client.redeemCard({
        token: getAuthToken() ?? '',
        code,
        // product_id=2 为国内，其余为海外；用户信息缺失时兼容为国内。
        is_domestic: user?.product_id === undefined || user.product_id === 2,
        mac: getOrCreateInstallMacAddress(),
        version: APP_VERSION,
      })
    : await client.redeemCode(code);

  if (!isSuccess(response.code)) {
    throw new Error(response.message || '兑换失败');
  }

  // 服务端兑换状态存在短暂同步延迟，等待后再读取最新会员信息。
  await delay(2000);
  const profile = await client.getProfile();
  if (!isSuccess(profile.code) || !profile.data?.user) {
    throw new Error(profile.message || '用户信息刷新失败');
  }
  saveAuthUser(profile.data.user);
  return profile.data.user;
}
