import { requestJson, requestText } from '../services/httpsClient';
import { getOrCreateInstallMacAddress } from '../services/deviceIdentity';
import type * as Api from './types';

export const API_ORIGINS = {
  production: 'https://clientapi.gnjiasu.com',
  development: 'https://devclientapi.gnjiasu.com',
} as const;

export type ApiEnvironment = keyof typeof API_ORIGINS;

export interface GnjiasuApiClientOptions {
  environment?: ApiEnvironment;
  /** 不传时自动读取或创建本次安装对应的本地 MAC 格式标识。 */
  mac?: string;
  version: string;
  platform?: Api.ClientPlatform;
  token?: string;
  timeoutMs?: number;
  onTokenRefresh?: (token: string) => void;
}

export interface ApiCallOptions {
  signal?: AbortSignal;
}

const createQuery = (params: Record<string, string | number | undefined>) => {
  const query = Object.entries(params)
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
  return query ? `?${query}` : '';
};

/**
 * 根据接口文档生成的 React Native HTTPS 客户端。
 * Token、设备标识和版本头集中维护，业务页面不需要重复拼接请求头。
 */
export class GnjiasuApiClient {
  private readonly origin: string;
  private readonly mac: string;
  private readonly version: string;
  private readonly platform: Api.ClientPlatform;
  private readonly timeoutMs?: number;
  private readonly onTokenRefresh?: (token: string) => void;
  private token?: string;

  constructor(options: GnjiasuApiClientOptions) {
    // TODO: 联调期间默认走测试域名，上线前改回 'production'。
    this.origin = API_ORIGINS[options.environment ?? 'development'];
    this.mac = options.mac ?? getOrCreateInstallMacAddress();
    this.version = options.version;
    this.platform = options.platform ?? 'ios';
    this.token = options.token;
    this.timeoutMs = options.timeoutMs;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  setToken(token?: string) {
    this.token = token;
  }

  /** 所有接口（包含静态 JSON）共用同一套 iOS 设备与鉴权请求头。 */
  private createHeaders() {
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client-Type': 'react-native-ios',
      mac: this.mac,
      // iOS 包不允许由调用方遗漏或改写 platform；服务端以此识别原生端。
      platform: this.platform,
      version: this.version,
    });
    if (this.token) {
      // 同时保留标准 Bearer 鉴权和后端兼容的 token 请求头。
      headers.set('Authorization', `Bearer ${this.token}`);
      headers.set('token', this.token);
    }
    return headers;
  }

  private async call<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    options: ApiCallOptions = {},
  ): Promise<Api.ApiResponse<T>> {
    const headers = this.createHeaders();

    const response = await requestJson<Api.ApiResponse<T>>(
      `${this.origin}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options.signal,
        timeoutMs: this.timeoutMs,
      },
    );

    // 后端可能通过 new_token 轮换登录凭证，统一在请求层更新。
    if (response.new_token) {
      this.token = response.new_token;
      this.onTokenRefresh?.(response.new_token);
    }
    return response;
  }

  login(request: Api.LoginRequest, options?: ApiCallOptions) {
    return this.call<Api.LoginResponse>(
      '/api/v1/client/login',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  phoneLogin(
    request: { country_code: string; phone: string; code: string },
    options?: ApiCallOptions,
  ) {
    return this.call<Api.LoginResponse>(
      '/api/v1/client/phone-login-reg',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  sendEmailCode(email: string, options?: ApiCallOptions) {
    return this.call<void>(
      '/api/v1/client/email/send-code',
      'POST',
      { email, mac: this.mac, platform: this.platform },
      options,
    );
  }

  emailLogin(
    request: { email: string; code: string; password?: string },
    options?: ApiCallOptions,
  ) {
    return this.call<Api.LoginResponse>(
      '/api/v1/client/email-login-reg',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  resetPasswordByEmail(
    request: { email: string; code: string; new_password: string },
    options?: ApiCallOptions,
  ) {
    return this.call<void>(
      '/api/v1/client/email/reset-password',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  bindEmail(
    request: { email: string; code: string; password: string },
    options?: ApiCallOptions,
  ) {
    return this.call<{ user: Api.User }>(
      '/api/v1/client/user/bind-email',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  bindPhone(
    request: { country_code: string; phone: string; code: string },
    options?: ApiCallOptions,
  ) {
    return this.call<{ user: Api.User }>(
      '/api/v1/client/user/bind-phone',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  logout(options?: ApiCallOptions) {
    return this.call<void>('/api/v1/client/user/logout', 'POST', {}, options);
  }

  businessLogout(options?: ApiCallOptions) {
    return this.call<void>('/api/v1/client/logout', 'POST', {}, options);
  }

  getProfile(options?: ApiCallOptions) {
    return this.call<Api.UserProfileResponse>(
      '/api/v1/client/user/profile',
      'GET',
      undefined,
      options,
    );
  }

  restoreProfile(options?: ApiCallOptions) {
    return this.call<{ user: Api.User }>(
      '/user/profile',
      'GET',
      undefined,
      options,
    );
  }

  heartbeat(options?: ApiCallOptions) {
    return this.call<Api.HeartbeatResponse>(
      '/api/v1/client/user/heartbeat',
      'POST',
      {},
      options,
    );
  }

  modifyPassword(request: Api.ModifyPasswordRequest, options?: ApiCallOptions) {
    return this.call<void>(
      '/api/v1/client/user/cpwd',
      'POST',
      request,
      options,
    );
  }

  setPassword(newPassword: string, options?: ApiCallOptions) {
    return this.call<void>(
      '/api/v1/client/user/set-password',
      'POST',
      { new_pwd: newPassword },
      options,
    );
  }

  sendSmsCode(
    request: { country_code: string; phone: string; ticket?: string },
    options?: ApiCallOptions,
  ) {
    return this.call<void>(
      '/api/v1/client/sms/send',
      'POST',
      { ...request, mac: this.mac, platform: this.platform },
      options,
    );
  }

  initialize(options?: ApiCallOptions) {
    return this.call<Api.ClientInitResponse>(
      '/api/v1/client/init',
      'GET',
      undefined,
      options,
    );
  }

  checkUpdate(request: Api.ClientUpdateRequest, options?: ApiCallOptions) {
    return this.call<Api.ClientUpdateData>(
      '/api/v1/client/update',
      'POST',
      request,
      options,
    );
  }

  checkUpdateV3(request: Api.ClientUpdateRequest, options?: ApiCallOptions) {
    return this.call<Api.ClientUpdateData>(
      '/api/v1/client/updatev3',
      'POST',
      request,
      options,
    );
  }

  getUpdateV3Config(options?: ApiCallOptions) {
    return this.call<Api.ClientUpdateV3Data>(
      '/api/v1/client/updatev3',
      'GET',
      undefined,
      options,
    );
  }

  getS3Credential(
    request: Api.S3UploadCredentialRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<Api.S3UploadCredentialData>(
      '/api/v1/client/uploads/s3-credential',
      'POST',
      request,
      options,
    );
  }

  getContent(options?: ApiCallOptions) {
    return this.call<Api.ContentItem[]>(
      '/storage/content.json',
      'GET',
      undefined,
      options,
    );
  }

  /**
   * 读取 GeoIP 原始文件，由 JS 缓存；加速时解析为规则 JSON 的 white_list。
   */
  getGeoIpCn(options: ApiCallOptions = {}) {
    return requestText(`${this.origin}/storage/geoip_cn.json`, {
      method: 'GET',
      headers: this.createHeaders(),
      signal: options.signal,
      timeoutMs: this.timeoutMs,
    });
  }

  startAcceleration(request: Api.StartUpRequest, options?: ApiCallOptions) {
    return this.call<Api.StartupRawResponse>(
      '/api/v1/client/startup',
      'POST',
      request,
      options,
    );
  }

  getGameRouteOptions(
    request: Api.GameRouteOptionsRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<Api.GameRouteOptionsData>(
      '/api/v1/client/game/route-options',
      'POST',
      request,
      options,
    );
  }

  stopAcceleration(speedId: number, options?: ApiCallOptions) {
    return this.call<void>(
      '/api/v1/client/stop',
      'POST',
      { speed_id: speedId },
      options,
    );
  }

  reportSpeed(request: Api.SpeedReportRequest, options?: ApiCallOptions) {
    return this.call<void>(
      '/api/v1/client/speed/report',
      'POST',
      request,
      options,
    );
  }

  redeemCode(code: string, options?: ApiCallOptions) {
    return this.call<void>('/api/v1/client/code', 'POST', { code }, options);
  }

  getOrders(
    params: { size?: number; page?: number } = {},
    options?: ApiCallOptions,
  ) {
    return this.call<Api.OrderListData>(
      `/api/v1/client/orders${createQuery(params)}`,
      'GET',
      undefined,
      options,
    );
  }

  getArticles(
    params: {
      type?: string;
      category_slug?: string;
      per_page?: number;
      page?: number;
    } = {},
    options?: ApiCallOptions,
  ) {
    return this.call<unknown>(
      `/api/v1/articles${createQuery(params)}`,
      'GET',
      undefined,
      options,
    );
  }

  changeProductType(
    request: Api.ChangeProductTypeRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<void>(
      '/api/v1/client/product/change-type',
      'POST',
      request,
      options,
    );
  }

  toggleProductPause(
    request: Api.TogglePauseRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<void>(
      '/api/v1/client/product/toggle-pause',
      'POST',
      request,
      options,
    );
  }

  identifyProduct(
    request: Api.ProductIdentificationRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<void>(
      '/api/v1/client/product/identification',
      'POST',
      request,
      options,
    );
  }

  getExclusiveIpSubscriptions(options?: ApiCallOptions) {
    return this.call<Api.ExclusiveIpSubscriptionsData>(
      '/api/v1/client/exclusive-ip/subscriptions',
      'GET',
      undefined,
      options,
    );
  }

  getExclusiveIpPrices(options?: ApiCallOptions) {
    return this.call<Api.ExclusiveIpPricesData>(
      '/api/v1/client/exclusive-ip/prices',
      'GET',
      undefined,
      options,
    );
  }

  checkPayment(tradeNo: string, options?: ApiCallOptions) {
    return this.call<Api.PayCheckData>(
      `/pay/check${createQuery({ trade_no: tradeNo })}`,
      'GET',
      undefined,
      options,
    );
  }

  /* ── iOS 端专用接口 ──────────────────────────────────── */

  /** iOS 分类树，二级分类在 children 上。 */
  getIosCategories(options?: ApiCallOptions) {
    return this.call<Api.IosCategory[]>(
      '/api/v1/ios/categories',
      'GET',
      undefined,
      options,
    );
  }

  /** iOS 游戏列表。返回项的 id 即加速所需的 gid。 */
  getIosGames(options?: ApiCallOptions) {
    return this.call<Api.IosGame[]>(
      '/api/v1/ios/games',
      'GET',
      undefined,
      options,
    );
  }

  /** iOS 卡品价格列表，含 Apple Product ID，按国内/海外与包月/小时分桶。 */
  getIosCardProducts(options?: ApiCallOptions) {
    return this.call<Api.IosCardProductsData>(
      '/api/v1/ios/card-products',
      'GET',
      undefined,
      options,
    );
  }

  /** 创建 Apple IAP 未支付订单，拿到后交给 StoreKit 发起支付。 */
  createApplePayOrder(
    request: Api.AppleOrderRequest,
    options?: ApiCallOptions,
  ) {
    return this.call<Api.AppleOrderData>(
      '/api/v1/client/pay/apple/create',
      'POST',
      request,
      options,
    );
  }

  redeemCard<T = unknown>(
    request: Api.RedeemCardRequest,
    options: ApiCallOptions = {},
  ) {
    const origin =
      this.origin === API_ORIGINS.production
        ? 'https://cdk.dianhv.com/api/card/redeem'
        : `${API_ORIGINS.development}/kami/api/card/redeem`;
    return requestJson<Api.RedeemCardResponse<T>>(origin, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        mac: this.mac,
        platform: this.platform,
        version: this.version,
        ...(this.token
          ? {
              Authorization: `Bearer ${this.token}`,
              token: this.token,
            }
          : {}),
      },
      body: JSON.stringify(request),
      signal: options.signal,
      timeoutMs: this.timeoutMs,
    });
  }
}
