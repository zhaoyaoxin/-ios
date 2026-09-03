import {
  HEARTBEAT_INTERVAL_MS,
  isHeartbeatRunning,
  sendHeartbeat,
  startHeartbeat,
  stopHeartbeat,
  type HeartbeatOutcome,
} from '../src/services/heartbeatService';
import { HttpsRequestError } from '../src/services/httpsClient';

jest.mock('../src/services/authTokenStorage', () => ({
  getAuthToken: jest.fn(() => 'token'),
  saveAuthToken: jest.fn(),
}));

const makeClient = (impl: () => Promise<unknown>) => ({
  heartbeat: jest.fn(impl) as never,
  setToken: jest.fn(),
});

const ok = () => makeClient(async () => ({ code: 200, data: null, message: '' }));

/** 抽干挂起的微任务，等待 beat() 的 await 链走完。 */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

afterEach(() => {
  stopHeartbeat();
  jest.useRealTimers();
});

test('状态码映射：200/0 正常，-1 多设备，-2 到期，401 强制下线，其余抖动', async () => {
  await expect(sendHeartbeat(ok())).resolves.toEqual({ type: 'ok' });
  await expect(
    sendHeartbeat(makeClient(async () => ({ code: 0, data: null, message: '' }))),
  ).resolves.toEqual({ type: 'ok' });
  await expect(
    sendHeartbeat(makeClient(async () => ({ code: -1, data: null, message: '' }))),
  ).resolves.toEqual({ type: 'multi-device' });
  await expect(
    sendHeartbeat(makeClient(async () => ({ code: -2, data: null, message: '' }))),
  ).resolves.toEqual({ type: 'expired' });

  const unauthorized = await sendHeartbeat(
    makeClient(async () => {
      throw new HttpsRequestError('请求失败（HTTP 401）', 401);
    }),
  );
  expect(unauthorized).toEqual({ type: 'force-logout' });

  // 网络失败 ≠ 下线
  const offline = await sendHeartbeat(
    makeClient(async () => {
      throw new HttpsRequestError('请求超时（10 秒）');
    }),
  );
  expect(offline.type).toBe('transient');

  // 协议外的状态码也按抖动处理，不误伤登录态
  const unknown = await sendHeartbeat(
    makeClient(async () => ({ code: 500, data: null, message: '服务异常' })),
  );
  expect(unknown.type).toBe('transient');
});

test('立刻打一次，之后每 5 分钟一次；抖动不中断', async () => {
  jest.useFakeTimers();
  const outcomes: HeartbeatOutcome[] = [];
  let calls = 0;
  const client = makeClient(async () => {
    calls += 1;
    if (calls === 2) {
      throw new HttpsRequestError('网络请求失败');
    }
    return { code: 200, data: null, message: '' };
  });

  startHeartbeat({ client, onOutcome: o => outcomes.push(o) });
  await flush();
  expect(calls).toBe(1); // 立刻打了一次

  jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
  await flush();
  expect(calls).toBe(2);

  // 第二轮是网络失败，心跳必须继续
  jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
  await flush();
  expect(calls).toBe(3);
  expect(isHeartbeatRunning()).toBe(true);
  expect(outcomes.map(o => o.type)).toEqual(['ok', 'transient', 'ok']);
});

test('收到下线指令后自行停止，不再轮询', async () => {
  jest.useFakeTimers();
  const outcomes: HeartbeatOutcome[] = [];
  let calls = 0;
  const client = makeClient(async () => {
    calls += 1;
    return { code: -2, data: null, message: '会员到期' };
  });

  startHeartbeat({ client, onOutcome: o => outcomes.push(o) });
  await flush();

  expect(outcomes).toEqual([{ type: 'expired' }]);
  expect(isHeartbeatRunning()).toBe(false);

  jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
  await flush();
  expect(calls).toBe(1); // 不再有后续轮询
});
