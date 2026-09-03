import { GnjiasuApiClient } from '../src/api';

const originalFetch = globalThis.fetch;

const mockApiResponse = (data: unknown = undefined, extra = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ code: 0, data, message: 'ok', ...extra }),
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('uses development origin and appends device headers', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValue(mockApiResponse({ speed_id: 1 }));
  globalThis.fetch = fetchMock;
  const client = new GnjiasuApiClient({
    environment: 'development',
    mac: 'device-id',
    version: '1.0.0',
    token: 'token-value',
  });

  await client.startAcceleration({ gid: 100 });

  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://devclientapi.gnjiasu.com/api/v1/client/startup');
  expect(options.method).toBe('POST');
  expect(options.body).toBe('{"gid":100}');
  expect(options.headers.get('mac')).toBe('device-id');
  expect(options.headers.get('platform')).toBe('ios');
  expect(options.headers.get('version')).toBe('1.0.0');
  expect(options.headers.get('Authorization')).toBe('Bearer token-value');
  expect(options.headers.get('token')).toBe('token-value');
});

test('sends ios platform when requesting and using a phone code', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(mockApiResponse())
    .mockResolvedValueOnce(mockApiResponse({ token: 'token-value' }));
  globalThis.fetch = fetchMock;
  const client = new GnjiasuApiClient({
    mac: 'device-id',
    version: '1.0.0',
  });

  await client.sendSmsCode({ country_code: '86', phone: '13800138000' });
  await client.phoneLogin({
    country_code: '86',
    phone: '13800138000',
    code: '123456',
  });

  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    country_code: '86',
    phone: '13800138000',
    mac: 'device-id',
    platform: 'ios',
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    country_code: '86',
    phone: '13800138000',
    code: '123456',
    mac: 'device-id',
    platform: 'ios',
  });
});

test('downloads geoip as untouched text while retaining iOS common headers', async () => {
  const rawGeoIp = '["1.0.1.0/24","1.0.2.0/23"]\n';
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => rawGeoIp,
  });
  globalThis.fetch = fetchMock;
  const client = new GnjiasuApiClient({
    mac: 'device-id',
    version: '1.0.0',
  });

  await expect(client.getGeoIpCn()).resolves.toBe(rawGeoIp);

  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://devclientapi.gnjiasu.com/storage/geoip_cn.json');
  expect(options.method).toBe('GET');
  expect(options.headers.get('mac')).toBe('device-id');
  expect(options.headers.get('platform')).toBe('ios');
  expect(options.headers.get('version')).toBe('1.0.0');
});

test('encodes query parameters and stores a refreshed token', async () => {
  const onTokenRefresh = jest.fn();
  const fetchMock = jest
    .fn()
    .mockResolvedValue(
      mockApiResponse({ items: [] }, { new_token: 'next-token' }),
    );
  globalThis.fetch = fetchMock;
  const client = new GnjiasuApiClient({
    mac: 'device-id',
    version: '1.0.0',
    onTokenRefresh,
  });

  await client.getArticles({ category_slug: '会员 活动', page: 2 });
  await client.getProfile();

  expect(fetchMock.mock.calls[0][0]).toContain(
    'category_slug=%E4%BC%9A%E5%91%98%20%E6%B4%BB%E5%8A%A8&page=2',
  );
  expect(onTokenRefresh).toHaveBeenCalledWith('next-token');
  expect(fetchMock.mock.calls[1][1].headers.get('Authorization')).toBe(
    'Bearer next-token',
  );
});

test('uses the independent production domain with common headers for card redemption', async () => {
  const fetchMock = jest.fn().mockResolvedValue(mockApiResponse());
  globalThis.fetch = fetchMock;
  const client = new GnjiasuApiClient({
    // 本用例断言的就是生产兑换域名，显式声明环境，不依赖默认值。
    environment: 'production',
    mac: 'device-id',
    version: '1.0.0',
    token: 'token-value',
  });

  await client.redeemCard({
    token: 'token',
    code: 'CODE',
    is_domestic: true,
    mac: 'device-id',
    version: '1.0.0',
  });

  expect(fetchMock.mock.calls[0][0]).toBe(
    'https://cdk.dianhv.com/api/card/redeem',
  );
  const headers = fetchMock.mock.calls[0][1].headers;
  expect(headers.get('mac')).toBe('device-id');
  expect(headers.get('platform')).toBe('ios');
  expect(headers.get('version')).toBe('1.0.0');
  expect(headers.get('Authorization')).toBe('Bearer token-value');
  expect(headers.get('token')).toBe('token-value');
});
