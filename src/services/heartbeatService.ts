import { GnjiasuApiClient } from '../api';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';
import { HttpsRequestError } from './httpsClient';

/** 心跳间隔：首次立即发送，之后每 5 分钟一次。 */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 一次心跳的业务结果。
 *
 * 关键区分：网络失败 ≠ 下线。只有服务端明确回 401 / -1 / -2 才动登录态和加速状态，
 * 其余一律归为 transient，只上报不下线，下一轮继续重试。
 */
export type HeartbeatOutcome =
  /** 正常，什么都不做 */
  | { type: 'ok' }
  /** HTTP 401：令牌失效，被强制下线 */
  | { type: 'force-logout' }
  /** code -1：别处登录了，超出设备数 */
  | { type: 'multi-device' }
  /** code -2：会员到期 */
  | { type: 'expired' }
  /** 网络抖动、超时、未知状态码：不下线 */
  | { type: 'transient'; error: Error };

/** 收到这三种指令后心跳自行停止。 */
const isTerminalOutcome = (outcome: HeartbeatOutcome) =>
  outcome.type === 'force-logout' ||
  outcome.type === 'multi-device' ||
  outcome.type === 'expired';

export type HeartbeatClient = Pick<GnjiasuApiClient, 'heartbeat' | 'setToken'>;

// 与认证服务保持一致：新接口返回 0，部分旧接口仍返回 200。
const isSuccessCode = (code: number) => code === 0 || code === 200;

const defaultClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

/**
 * 发送一次心跳并翻译成业务结果。
 * 每次都重新注入 Token，保证登录后拿到的是最新凭证。
 */
export async function sendHeartbeat(
  client: HeartbeatClient = defaultClient,
): Promise<HeartbeatOutcome> {
  client.setToken(getAuthToken());

  try {
    const response = await client.heartbeat();

    if (response.code === -1) {
      return { type: 'multi-device' };
    }
    if (response.code === -2) {
      return { type: 'expired' };
    }
    if (isSuccessCode(response.code)) {
      return { type: 'ok' };
    }
    // 未在协议内的状态码按抖动处理，不误伤登录态。
    return {
      type: 'transient',
      error: new Error(response.message || `心跳返回未知状态码 ${response.code}`),
    };
  } catch (error) {
    if (error instanceof HttpsRequestError && error.status === 401) {
      return { type: 'force-logout' };
    }
    return {
      type: 'transient',
      error: error instanceof Error ? error : new Error('心跳请求失败'),
    };
  }
}

export type StartHeartbeatOptions = {
  client?: HeartbeatClient;
  intervalMs?: number;
  onOutcome: (outcome: HeartbeatOutcome) => void;
};

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** 心跳是否在运行，便于外部避免重复启动。 */
export function isHeartbeatRunning() {
  return running;
}

/** 停止心跳。可重复调用。 */
export function stopHeartbeat() {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 启动心跳：立刻打一次，之后按 intervalMs 轮询。
 * 重复调用会先停掉上一轮，不会出现两个定时器。
 */
export function startHeartbeat({
  client = defaultClient,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  onOutcome,
}: StartHeartbeatOptions) {
  stopHeartbeat();
  running = true;

  const beat = async () => {
    const outcome = await sendHeartbeat(client);
    // 请求期间被外部停止（如退出登录），本轮结果作废。
    if (!running) {
      return;
    }
    if (isTerminalOutcome(outcome)) {
      stopHeartbeat();
    }
    onOutcome(outcome);
  };

  void beat();
  timer = setInterval(beat, intervalMs);
}
