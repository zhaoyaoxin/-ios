import { GnjiasuApiClient } from '../api';
import type { OrderListData } from '../api/types';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';
import { saveAuthUser } from './authUserStorage';
import { rememberGeoIpCnMd5, syncGeoIpCn } from './geoIpCnService';

// 当前认证服务存在两套成功码：新接口返回 0，部分旧接口仍返回 200。
const isSuccessCode = (code: number) => code === 0 || code === 200;

const apiClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

export type VerificationAccountInput =
  | { type: 'phone'; countryCode: string; phone: string }
  | { type: 'email'; email: string };

type VerificationApiClient = Pick<
  GnjiasuApiClient,
  | 'emailLogin'
  | 'bindEmail'
  | 'bindPhone'
  | 'changeProductType'
  | 'getProfile'
  | 'getOrders'
  | 'getGeoIpCn'
  | 'initialize'
  | 'login'
  | 'phoneLogin'
  | 'resetPasswordByEmail'
  | 'restoreProfile'
  | 'sendEmailCode'
  | 'sendSmsCode'
  | 'setToken'
  | 'setPassword'
  | 'toggleProductPause'
>;

/** 获取当前用户订单列表。 */
export async function loadOrderPage(
  page = 1,
  size = 20,
  client: VerificationApiClient = apiClient,
): Promise<OrderListData> {
  const response = await client.getOrders({ page, size });
  if (!isSuccessCode(response.code) || !response.data) {
    throw new Error(response.message || '订单列表获取失败');
  }
  return response.data;
}

const normalizeBindingPhone = (phone: string) => {
  const normalized = phone.trim();
  if (!/^1\d{10}$/.test(normalized)) {
    throw new Error('请输入正确的中国大陆手机号');
  }
  return normalized;
};

const normalizeBindingEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    throw new Error('请输入正确的邮箱');
  }
  return normalized;
};

/** 绑定手机号前发送验证码；ticket 必须来自腾讯验证码。 */
export async function sendPhoneBindingCode(
  phone: string,
  ticket: string,
  client: VerificationApiClient = apiClient,
) {
  const normalizedPhone = normalizeBindingPhone(phone);
  if (!ticket.trim()) {
    throw new Error('请先完成安全验证');
  }
  const response = await client.sendSmsCode({
    country_code: '86',
    phone: normalizedPhone,
    ticket: ticket.trim(),
  });
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '短信验证码发送失败');
  }
}

/** 绑定邮箱前发送验证码，mac、platform 由 API Client 统一补充。 */
export async function sendEmailBindingCode(
  email: string,
  client: VerificationApiClient = apiClient,
) {
  const response = await client.sendEmailCode(normalizeBindingEmail(email));
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '邮箱验证码发送失败');
  }
}

export async function bindCurrentPhone(
  phone: string,
  code: string,
  client: VerificationApiClient = apiClient,
) {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new Error('请输入短信验证码');
  }
  const response = await client.bindPhone({
    country_code: '86',
    phone: normalizeBindingPhone(phone),
    code: normalizedCode,
  });
  if (!isSuccessCode(response.code) || !response.data?.user) {
    throw new Error(response.message || '手机号绑定失败');
  }
  saveAuthUser(response.data.user);
  return response.data.user;
}

export async function bindCurrentEmail(
  email: string,
  code: string,
  password: string,
  client: VerificationApiClient = apiClient,
) {
  const normalizedCode = code.trim();
  if (!normalizedCode || !password) {
    throw new Error('请输入邮箱验证码和登录密码');
  }
  const response = await client.bindEmail({
    email: normalizeBindingEmail(email),
    code: normalizedCode,
    password,
  });
  if (!isSuccessCode(response.code) || !response.data?.user) {
    throw new Error(response.message || '邮箱绑定失败');
  }
  saveAuthUser(response.data.user);
  return response.data.user;
}

/** 邮箱账号通过验证码重置密码。 */
export async function resetCurrentPasswordByEmail(
  email: string,
  code: string,
  newPassword: string,
  client: VerificationApiClient = apiClient,
) {
  const normalizedCode = code.trim();
  const password = newPassword.trim();
  if (!normalizedCode || !password) {
    throw new Error('请输入邮箱验证码和新密码');
  }
  const response = await client.resetPasswordByEmail({
    email: normalizeBindingEmail(email),
    code: normalizedCode,
    new_password: password,
  });
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '密码修改失败');
  }
}

/** 已有用户使用账号密码登录。login() 会自动补充 mac 和 ios 平台字段。 */
export async function loginWithPassword(
  username: string,
  password: string,
  client: VerificationApiClient = apiClient,
) {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || !password) {
    throw new Error('请输入账号和密码');
  }
  const response = await client.login({
    username: normalizedUsername,
    password,
  });
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '登录失败');
  }
  if (!response.data?.token) {
    throw new Error('登录成功但接口未返回 Token');
  }
  saveAuthToken(response.data.token);
  saveAuthUser(response.data.user);
  client.setToken(response.data.token);
  return response.data;
}

/** 每次应用冷启动获取最新客户端初始化配置。 */
export async function loadClientInitialization(
  client: VerificationApiClient = apiClient,
  options?: { signal?: AbortSignal },
) {
  const response = await client.initialize(options);
  if (!isSuccessCode(response.code) || !response.data) {
    throw new Error(response.message || '客户端初始化失败');
  }

  // geoip 是路由性能数据，不让 CDN 临时失败阻塞登录/首页；原生端会继续使用
  // 已缓存或包内的 IP 库，并在下次冷启动自动重试同步。
  rememberGeoIpCnMd5(response.data.geoip_cn_md5);
  try {
    await syncGeoIpCn(response.data.geoip_cn_md5, client, undefined, options);
  } catch (error) {
    console.warn('中国 IP 库同步失败，将保留当前本地版本', error);
  }
  return response.data;
}

/** 已有 Token 但没有本地用户缓存时，从服务端恢复抽屉所需的账号信息。 */
export async function loadCurrentAuthUser(
  client: VerificationApiClient = apiClient,
  options?: { signal?: AbortSignal },
) {
  const response = await client.getProfile(options);
  if (!isSuccessCode(response.code) || !response.data?.user) {
    throw new Error(response.message || '用户信息获取失败');
  }
  saveAuthUser(response.data.user);
  return response.data.user;
}

/**
 * 充值完成后刷新用户资料。
 *
 * 与 loadCurrentAuthUser 的区别：这里走 restoreProfile(/user/profile)，
 * 用于订单落账后重新拉取会员时长等权益字段。
 */
export async function restoreCurrentAuthUser(
  client: VerificationApiClient = apiClient,
  options?: { signal?: AbortSignal },
) {
  const response = await client.restoreProfile(options);
  if (!isSuccessCode(response.code) || !response.data?.user) {
    throw new Error(response.message || '用户信息刷新失败');
  }
  saveAuthUser(response.data.user);
  return response.data.user;
}

/** 切换可暂停时长状态，并立即重新获取服务端用户资料。 */
export async function toggleCurrentProductPause(
  action: 'enable' | 'disable',
  client: VerificationApiClient = apiClient,
) {
  const response = await client.toggleProductPause({ action });
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '会员状态切换失败');
  }
  return loadCurrentAuthUser(client);
}

/** 切换会员产品类型后立即刷新全局展示所需的会员资料。 */
export async function changeCurrentProductType(
  targetType: number,
  client: VerificationApiClient = apiClient,
) {
  const response = await client.changeProductType({ target_type: targetType });
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '会员类型切换失败');
  }
  return loadCurrentAuthUser(client);
}

/** 自动识别中国大陆手机号或邮箱，并整理为接口需要的字段。 */
export function parseVerificationAccount(
  value: string,
): VerificationAccountInput {
  const normalized = value.trim();
  const phoneMatch = normalized.match(/^(?:\+?86)?(1[3-9]\d{9})$/);
  if (phoneMatch) {
    return { type: 'phone', countryCode: '86', phone: phoneMatch[1] };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { type: 'email', email: normalized.toLowerCase() };
  }
  throw new Error('请输入正确的手机号或邮箱');
}

function normalizeVerificationAccount(
  account: VerificationAccountInput,
): VerificationAccountInput {
  if (account.type === 'phone') {
    const countryCode = account.countryCode.replace(/\D/g, '');
    const phone = account.phone.replace(/[\s()-]/g, '');
    if (!countryCode || !/^\d{4,15}$/.test(phone)) {
      throw new Error('请输入正确的手机号');
    }
    return { type: 'phone', countryCode, phone };
  }
  const email = account.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('请输入正确的邮箱');
  }
  return { type: 'email', email };
}

export async function sendVerificationCode(
  accountInput: VerificationAccountInput,
  client: VerificationApiClient = apiClient,
) {
  const account = normalizeVerificationAccount(accountInput);
  const response =
    account.type === 'phone'
      ? await client.sendSmsCode({
          country_code: account.countryCode,
          phone: account.phone,
        })
      : await client.sendEmailCode(account.email);

  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '验证码发送失败');
  }
}

export async function loginWithVerificationCode(
  accountInput: VerificationAccountInput,
  code: string,
  client: VerificationApiClient = apiClient,
  options?: { registration?: boolean },
) {
  const account = normalizeVerificationAccount(accountInput);
  const response =
    account.type === 'phone'
      ? await client.phoneLogin({
          country_code: account.countryCode,
          phone: account.phone,
          code,
        })
      : await client.emailLogin({
          email: account.email,
          code,
          // 邮箱注册按现有后端约定传入初始密码，随后新用户必须重新设置。
          ...(options?.registration ? { password: '123456' } : {}),
        });

  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '验证码登录失败');
  }
  if (!response.data?.token) {
    throw new Error('登录成功但接口未返回 Token');
  }

  saveAuthToken(response.data.token);
  saveAuthUser(response.data.user);
  client.setToken(response.data.token);
  return response.data;
}

/** 新注册用户设置正式登录密码。 */
export async function setCurrentUserPassword(
  newPassword: string,
  client: VerificationApiClient = apiClient,
) {
  const password = newPassword.trim();
  if (!password) {
    throw new Error('请输入新密码');
  }
  const response = await client.setPassword(password);
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '密码设置失败');
  }
}
