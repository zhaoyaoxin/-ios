import {
  readLocalGeoIpCnContent,
  readLocalGeoIpCnWhitelist,
  rememberGeoIpCnMd5,
  syncGeoIpCn,
} from '../src/services/geoIpCnService';

test.each([
  ['["1.0.1.0/24", "1.0.2.0/23"]\n', ['1.0.1.0/24', '1.0.2.0/23']],
  ['[]', []],
] as const)('解析缓存白名单 %s，不重复下载', async (rawJson, expected) => {
  const storage = {
    getMd5: jest.fn(async () => 'md5'),
    getContent: jest.fn(async () => rawJson),
    save: jest.fn(),
  };
  const client = { initialize: jest.fn(), getGeoIpCn: jest.fn() };

  await expect(readLocalGeoIpCnWhitelist({ storage, client })).resolves.toEqual(
    expected,
  );
  expect(client.initialize).not.toHaveBeenCalled();
  expect(client.getGeoIpCn).not.toHaveBeenCalled();
});

test.each(['not json', '{}', '[1]', '[null]'])(
  '白名单内容 %s 无法作为字符串数组传入原生',
  async rawJson => {
    const storage = {
      getMd5: jest.fn(async () => 'md5'),
      getContent: jest.fn(async () => rawJson),
      save: jest.fn(),
    };

    await expect(readLocalGeoIpCnWhitelist({ storage })).rejects.toThrow(
      '中国 IP 白名单',
    );
  },
);

test('skips downloading geoip when the saved init MD5 already matches', async () => {
  const client = { getGeoIpCn: jest.fn() };
  const storage = {
    getMd5: jest.fn(async () => 'ABC123'),
    getContent: jest.fn(async () => null),
    save: jest.fn(),
  };

  await expect(syncGeoIpCn('abc123', client, storage)).resolves.toBe(
    'up-to-date',
  );
  expect(client.getGeoIpCn).not.toHaveBeenCalled();
  expect(storage.save).not.toHaveBeenCalled();
});

test('downloads and stores the untouched geoip JSON when its MD5 changes', async () => {
  const rawGeoIp = '["1.0.1.0/24"]\n';
  const client = { getGeoIpCn: jest.fn(async () => rawGeoIp) };
  const storage = {
    getMd5: jest.fn(async () => 'old-md5'),
    getContent: jest.fn(async () => null),
    save: jest.fn(async () => true),
  };
  const signal = new AbortController().signal;

  await expect(
    syncGeoIpCn('new-md5', client, storage, { signal }),
  ).resolves.toBe('updated');
  expect(client.getGeoIpCn).toHaveBeenCalledWith({ signal });
  expect(storage.save).toHaveBeenCalledWith(rawGeoIp, 'new-md5');
});

test('downloads geoip on every startup when init does not provide an MD5', async () => {
  const rawGeoIp = '["1.0.1.0/24"]\n';
  const client = { getGeoIpCn: jest.fn(async () => rawGeoIp) };
  const storage = {
    getMd5: jest.fn(async () => 'previous-md5'),
    getContent: jest.fn(async () => rawGeoIp),
    save: jest.fn(async () => true),
  };

  await expect(syncGeoIpCn(undefined, client, storage)).resolves.toBe(
    'updated',
  );
  expect(storage.getMd5).not.toHaveBeenCalled();
  expect(client.getGeoIpCn).toHaveBeenCalledWith(undefined);
  // 空字符串表示本次 init 未提供可供下次比对的版本标识。
  expect(storage.save).toHaveBeenCalledWith(rawGeoIp, '');
});

test('reads the raw geoip JSON from JS local storage', async () => {
  const storage = {
    getMd5: jest.fn(async () => 'new-md5'),
    getContent: jest.fn(async () => '["1.0.1.0/24"]\n'),
    save: jest.fn(async () => true),
  };

  await expect(readLocalGeoIpCnContent({ storage })).resolves.toBe(
    '["1.0.1.0/24"]\n',
  );
  expect(storage.getContent).toHaveBeenCalledTimes(1);
});

test('downloads, stores, and returns geoip when the JS local cache is missing', async () => {
  const rawGeoIp = '["1.0.1.0/24"]\n';
  const storage = {
    getMd5: jest.fn(async () => null),
    getContent: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rawGeoIp),
    save: jest.fn(async () => true),
  };
  const client = {
    initialize: jest.fn(async () => ({
      code: 0,
      message: 'ok',
      data: {
        ip: '127.0.0.1',
        is_overseas: false,
        country: 'CN',
        province: '',
        heartbeat_interval: 60,
        banners: [],
        ads: {},
        content_md5: '',
        geoip_cn_md5: 'new-md5',
        default_games: [],
        search_default_game_ids: [],
      },
    })),
    getGeoIpCn: jest.fn(async () => rawGeoIp),
  };

  await expect(readLocalGeoIpCnContent({ storage, client })).resolves.toBe(
    rawGeoIp,
  );
  expect(client.initialize).toHaveBeenCalledTimes(1);
  expect(client.getGeoIpCn).toHaveBeenCalledWith({ signal: undefined });
  expect(storage.save).toHaveBeenCalledWith(rawGeoIp, 'new-md5');
  expect(storage.getContent).toHaveBeenCalledTimes(2);
});

test('downloads geoip when the JS cache is missing even if init has no MD5', async () => {
  // 清除前序用例留下的本次启动 MD5，模拟 init 未提供版本字段。
  rememberGeoIpCnMd5(undefined);
  const rawGeoIp = '["1.0.1.0/24"]\n';
  const storage = {
    getMd5: jest.fn(async () => null),
    getContent: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(rawGeoIp),
    save: jest.fn(async () => true),
  };
  const client = {
    initialize: jest.fn(async () => ({
      code: 0,
      message: 'ok',
      data: {
        ip: '127.0.0.1',
        is_overseas: false,
        country: 'CN',
        province: '',
        heartbeat_interval: 60,
        banners: [],
        ads: {},
        content_md5: '',
        default_games: [],
        search_default_game_ids: [],
      },
    })),
    getGeoIpCn: jest.fn(async () => rawGeoIp),
  };

  await expect(readLocalGeoIpCnContent({ storage, client })).resolves.toBe(
    rawGeoIp,
  );
  expect(client.initialize).toHaveBeenCalledTimes(1);
  expect(client.getGeoIpCn).toHaveBeenCalledWith({ signal: undefined });
  expect(storage.save).toHaveBeenCalledWith(rawGeoIp, '');
});
