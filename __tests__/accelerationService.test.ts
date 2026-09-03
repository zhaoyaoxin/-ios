const mockStartAcceleration = jest.fn();
const mockStopAcceleration = jest.fn();
const mockNativeStop = jest.fn();
const mockNativeLoadSys = jest.fn();
const mockNativeStart = jest.fn();
const mockReadWhitelist = jest.fn();
let mockIsSimulator = false;
let mockNativeAvailable = true;

jest.mock('../src/api', () => ({
  GnjiasuApiClient: jest.fn().mockImplementation(() => ({
    startAcceleration: mockStartAcceleration,
    stopAcceleration: mockStopAcceleration,
  })),
}));

jest.mock('../src/services/VPNControllerBridge', () => ({
  __esModule: true,
  default: {
    get isSimulator() {
      return mockIsSimulator;
    },
    get loadSys() {
      return mockNativeAvailable ? mockNativeLoadSys : undefined;
    },
    get start() {
      return mockNativeAvailable ? mockNativeStart : undefined;
    },
    stop: mockNativeStop,
  },
}));

jest.mock('../src/services/authTokenStorage', () => ({
  getAuthToken: jest.fn(() => 'token'),
  saveAuthToken: jest.fn(),
}));

jest.mock('../src/services/geoIpCnService', () => ({
  readLocalGeoIpCnWhitelist: mockReadWhitelist,
}));

/** 每个用例都拿一份干净的模块，避免 speed_id 在用例之间串味。 */
const loadService = () => {
  let service!: typeof import('../src/services/accelerationService');
  jest.isolateModules(() => {
    service = require('../src/services/accelerationService');
  });
  return service;
};

const signal = () => new AbortController().signal;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSimulator = false;
  mockNativeAvailable = true;
  mockNativeStop.mockResolvedValue(undefined);
  mockNativeLoadSys.mockResolvedValue(true);
  mockNativeStart.mockResolvedValue(true);
  mockReadWhitelist.mockResolvedValue([]);
});

test.each([
  ['模拟器', true, true, 'iOS 模拟器不支持 VPN 加速，请连接 iPhone 真机测试。'],
  ['原生模块不可用', false, false, '原生加速模块不可用'],
])(
  '%s 仍先请求启动接口，随后提示原因并回滚会话',
  async (_environment, isSimulator, nativeAvailable, message) => {
    const service = loadService();
    mockIsSimulator = isSimulator;
    mockNativeAvailable = nativeAvailable;
    mockStartAcceleration.mockResolvedValue({
      code: 0,
      result: { speed_id: 556, config: {} },
    });
    mockStopAcceleration.mockResolvedValue({ code: 0 });

    await expect(service.startAcceleration(signal(), 1866)).rejects.toThrow(
      message,
    );

    expect(mockStartAcceleration).toHaveBeenCalledWith(
      { gid: 1866 },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(mockStopAcceleration).toHaveBeenCalledWith(556);
    expect(mockStartAcceleration.mock.invocationCallOrder[0]).toBeLessThan(
      mockStopAcceleration.mock.invocationCallOrder[0],
    );
    expect(mockNativeLoadSys).not.toHaveBeenCalled();
    expect(mockNativeStart).not.toHaveBeenCalled();
    expect(mockReadWhitelist).toHaveBeenCalledTimes(1);
    expect(mockStartAcceleration.mock.invocationCallOrder[0]).toBeLessThan(
      mockReadWhitelist.mock.invocationCallOrder[0],
    );
    expect(service.getCurrentSpeedId()).toBeNull();
  },
);

test('启动加速会带上 gid 并记录 speed_id', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: { result: { speed_id: 8848, config: {} } },
  });

  const result = await service.startAcceleration(signal(), 42);

  expect(mockStartAcceleration).toHaveBeenCalledWith(
    { gid: 42 },
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(result.speed_id).toBe(8848);
  expect(service.getCurrentSpeedId()).toBe(8848);
});

test('兼容 result 直接挂在顶层的信封', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 0,
    message: '',
    result: { speed_id: 100, config: {} },
  });

  await service.startAcceleration(signal(), 7);
  expect(service.getCurrentSpeedId()).toBe(100);
});

test.each(['direct', 'wrapped'])(
  '%s 信封从 result.data 读取公共规则，空 exit 原样传给原生',
  async envelope => {
    const service = loadService();
    const whitelist = ['1.0.1.0/24', '1.0.2.0/23'];
    mockReadWhitelist.mockResolvedValue(whitelist);
    const data = {
      DNS: [{ server: '114.114.114.114', domain: ['*.example.com'] }],
      blacklist: [
        { process: '*', host: '192.168.0.0/16', port: '*', protocol: '*' },
      ],
      ip_domain_white: ['10.0.0.0/8'],
      ip_domain_black: ['203.0.113.0/24'],
    };
    const result = {
      speed_id: 19000096,
      config: {
        game_rule: [
          {
            id: 1,
            offset: 1460,
            'flow-level': 1,
            entrance: [{ ip: '192.0.2.1', port: [8000] }],
            exit: [],
            dest: [
              { process: '*', host: '*.example.com', port: '*', protocol: '*' },
            ],
          },
        ],
      },
      data,
    };
    mockStartAcceleration.mockResolvedValue(
      envelope === 'direct'
        ? { code: 0, result }
        : { code: 0, data: { result } },
    );

    const requestSignal = signal();
    await service.startAcceleration(requestSignal, 1866);

    expect(mockReadWhitelist).toHaveBeenCalledWith({ signal: requestSignal });
    expect(mockStartAcceleration.mock.invocationCallOrder[0]).toBeLessThan(
      mockReadWhitelist.mock.invocationCallOrder[0],
    );
    expect(mockReadWhitelist.mock.invocationCallOrder[0]).toBeLessThan(
      mockNativeStart.mock.invocationCallOrder[0],
    );

    const [pathJson, ruleJson] = mockNativeStart.mock.calls[0];
    expect(typeof pathJson).toBe('string');
    expect(typeof ruleJson).toBe('string');
    expect(JSON.parse(pathJson)).toEqual([
      {
        lid: 1,
        entrance: [{ ip: '192.0.2.1', port: [8000] }],
        export: [],
      },
    ]);
    expect(JSON.parse(ruleJson)).toMatchObject({
      dns: data.DNS,
      black_list: data.blacklist,
      white_list: whitelist,
      ip_domain_white: data.ip_domain_white,
      ip_domain_black: data.ip_domain_black,
      rules: [{ rgid: 1, line_id: 1 }],
    });
    expect(mockStopAcceleration).not.toHaveBeenCalled();
  },
);

test('result.data 的空数组优先于旧数据，空 game_rule 不阻断原生调用', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 0,
    result: {
      speed_id: 19000096,
      config: {
        game_rule: [],
        data: {
          DNS: [{ server: '8.8.8.8', domain: ['*.example.com'] }],
          blacklist: [
            { process: '*', host: '127.0.0.1', port: '*', protocol: '*' },
          ],
          ip_domain_white: ['10.0.0.0/8'],
          ip_domain_black: ['203.0.113.0/24'],
        },
      },
      data: {
        DNS: [],
        blacklist: [],
        ip_domain_white: [],
        ip_domain_black: [],
      },
    },
  });

  await service.startAcceleration(signal(), 1866);

  const [pathJson, ruleJson] = mockNativeStart.mock.calls[0];
  expect(JSON.parse(pathJson)).toEqual([]);
  expect(JSON.parse(ruleJson)).toMatchObject({
    rules: [],
    dns: [],
    black_list: [],
    white_list: [],
    ip_domain_white: [],
    ip_domain_black: [],
  });
});

test('模拟器上也先处理 startup 业务错误，保留错误码供页面决定后续交互', async () => {
  const service = loadService();
  mockIsSimulator = true;
  mockStartAcceleration.mockResolvedValue({
    code: -2,
    message: '账号已暂停，请先启用后再使用',
    data: null,
  });

  await expect(service.startAcceleration(signal(), 7)).rejects.toMatchObject({
    name: 'StartupBusinessError',
    code: -2,
    message: '账号已暂停，请先启用后再使用',
  });
  expect(service.getCurrentSpeedId()).toBeNull();
  expect(mockStartAcceleration).toHaveBeenCalledTimes(1);
  expect(mockStopAcceleration).not.toHaveBeenCalled();
  expect(mockNativeLoadSys).not.toHaveBeenCalled();
});

test('停止加速：先关原生隧道，再用 speed_id 上报服务端', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: { result: { speed_id: 777, config: {} } },
  });
  mockStopAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: null,
  });

  await service.startAcceleration(signal(), 7);
  await service.stopAcceleration(signal());

  expect(mockNativeStop).toHaveBeenCalledWith(1);
  expect(mockStopAcceleration).toHaveBeenCalledWith(
    777,
    expect.objectContaining({ signal: expect.anything() }),
  );
  // 会话结束后清空 id，避免重复上报
  expect(service.getCurrentSpeedId()).toBeNull();
});

test('没有 speed_id 时只关隧道，不调停止接口', async () => {
  const service = loadService();

  await service.stopAcceleration(signal());

  expect(mockNativeStop).toHaveBeenCalledWith(1);
  expect(mockStopAcceleration).not.toHaveBeenCalled();
});

test('强制停止：上报失败也不抛错，但隧道必须已断开', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: { result: { speed_id: 5, config: {} } },
  });
  mockStopAcceleration.mockRejectedValue(new Error('网络不可用'));

  await service.startAcceleration(signal(), 7);
  await expect(service.forceStopAcceleration()).resolves.toBeUndefined();

  expect(mockNativeStop).toHaveBeenCalledWith(1);
  expect(service.getCurrentSpeedId()).toBeNull();
});

test('先 loadSys(1) 再 start，隧道连上后才记录会话', async () => {
  const service = loadService();
  const order: string[] = [];
  mockNativeLoadSys.mockImplementation(async () => {
    order.push('loadSys');
    return true;
  });
  mockNativeStart.mockImplementation(async () => {
    order.push('start');
    return true;
  });
  mockStartAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: {
      result: {
        speed_id: 321,
        config: {
          game_rule: [
            {
              id: 9,
              offset: 1,
              'flow-level': 2,
              entrance: [{ ip: '1.2.3.4', port: [8000] }],
              exit: [{ addr: '2816-454', nat: 'NAT' }],
              dest: [
                {
                  process: '*',
                  host: '*.a.com',
                  port: '443',
                  protocol: 'tcp',
                },
              ],
            },
          ],
          data: {
            DNS: [{ server: '8.8.8.8', domain: ['*.a.com'] }],
            blacklist: [],
            ip_domain_white: ['10.0.0.0/8'],
            ip_domain_black: ['192.168.0.0/16'],
          },
        },
      },
    },
  });

  await service.startAcceleration(signal(), 9);

  expect(order).toEqual(['loadSys', 'start']);
  expect(mockNativeLoadSys).toHaveBeenCalledWith(1);

  const [pathJson, ruleJson] = mockNativeStart.mock.calls[0];
  expect(JSON.parse(pathJson)).toEqual([
    {
      lid: 9,
      entrance: [{ ip: '1.2.3.4', port: [8000] }],
      export: [{ k1name: '2816-454', ip: 'NAT' }],
    },
  ]);
  const rule = JSON.parse(ruleJson);
  expect(rule.rules[0]).toMatchObject({ rgid: 9, line_id: 9 });
  expect(rule.rules[0].list[0]).toEqual({
    process: '*',
    dest_ip_domain: ['*.a.com'],
    port: '443',
    protocol: 'tcp',
  });
  expect(rule.accel_route_mode).toBe('china');
  expect(rule.dns).toEqual([{ server: '8.8.8.8', domain: ['*.a.com'] }]);
  expect(rule.black_list).toEqual([]);
  expect(rule.ip_domain_white).toEqual(['10.0.0.0/8']);
  expect(rule.ip_domain_black).toEqual(['192.168.0.0/16']);
  expect(service.getCurrentSpeedId()).toBe(321);
});

test('隧道起不来时回滚服务端会话，且不记录 speed_id', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: { result: { speed_id: 555, config: { game_rule: [] } } },
  });
  mockNativeStart.mockResolvedValue(false);
  mockStopAcceleration.mockResolvedValue({
    code: 200,
    message: '',
    data: null,
  });

  await expect(service.startAcceleration(signal(), 9)).rejects.toThrow(
    '隧道未能连接',
  );

  expect(mockStopAcceleration).toHaveBeenCalledWith(555);
  expect(service.getCurrentSpeedId()).toBeNull();
});

test('真机原生启动拒绝时保留错误并回滚服务端会话', async () => {
  const service = loadService();
  const error = new Error('IPC failed');
  mockStartAcceleration.mockResolvedValue({
    code: 0,
    result: { speed_id: 556, config: {} },
  });
  mockNativeStart.mockRejectedValue(error);
  mockStopAcceleration.mockResolvedValue({ code: 0 });

  await expect(service.startAcceleration(signal(), 1866)).rejects.toBe(error);

  expect(mockStopAcceleration).toHaveBeenCalledWith(556);
  expect(service.getCurrentSpeedId()).toBeNull();
});

test('白名单读取失败仍先请求 startup，随后回滚会话且不启动隧道', async () => {
  const service = loadService();
  mockStartAcceleration.mockResolvedValue({
    code: 0,
    result: { speed_id: 557, config: { game_rule: [] } },
  });
  mockReadWhitelist.mockRejectedValue(
    new Error('中国 IP 白名单 JSON 无法解析'),
  );
  mockStopAcceleration.mockResolvedValue({ code: 0 });

  await expect(service.startAcceleration(signal(), 1866)).rejects.toThrow(
    '中国 IP 白名单 JSON 无法解析',
  );
  expect(mockStartAcceleration).toHaveBeenCalledTimes(1);
  expect(mockStopAcceleration).toHaveBeenCalledWith(557);
  expect(mockNativeStart).not.toHaveBeenCalled();
  expect(service.getCurrentSpeedId()).toBeNull();
});
