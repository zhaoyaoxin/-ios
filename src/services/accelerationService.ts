import { GnjiasuApiClient } from '../api';
import type { StartupRawResponse } from '../api/types';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';
import { readLocalGeoIpCnWhitelist } from './geoIpCnService';
import VPNControllerBridge from './VPNControllerBridge';
import {
  buildNativeStartPayload,
  DEFAULT_ACCEL_ROUTE_MODE,
  type AccelRouteMode,
} from './startupPayload';

/** 与认证服务保持一致：新接口返回 0，部分旧接口仍返回 200。 */
const isSuccessCode = (code: number) => code === 0 || code === 200;

/** /startup 的可恢复业务错误，由首页按错误码展示下一步操作。 */
export class StartupBusinessError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'StartupBusinessError';
    this.code = code;
  }
}

/** 加速流程统一日志前缀，便于在 Metro / Xcode 控制台完整筛选一次会话。 */
export const logAcceleration = (step: string, detail?: unknown) => {
  console.log(`[Acceleration] ${step}`, detail ?? '');
};

const getErrorLogDetail = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : { error: String(error) };

const apiClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

/** 本次加速会话的 speed_id，停止时要回传给服务端。 */
let currentSpeedId: number | null = null;

/** 当前加速会话 id，未在加速时为 null。 */
export function getCurrentSpeedId() {
  return currentSpeedId;
}

/**
 * startup 接口的信封形状存在歧义：StartupRawResponse 自带 code/msg/result，
 * 而 client.call 又会套一层 ApiResponse。两种都兼容，能取到 result 即可。
 */
const extractStartupResult = (
  response: unknown,
): StartupRawResponse['result'] | null => {
  const envelope = response as
    | (Partial<StartupRawResponse> & { data?: Partial<StartupRawResponse> })
    | null;
  return envelope?.result ?? envelope?.data?.result ?? null;
};

/** 兼容错误文案位于响应 message、msg 或 result.message 的后端格式。 */
const getStartupErrorMessage = (response: unknown) => {
  const envelope = response as {
    message?: unknown;
    msg?: unknown;
    result?: { message?: unknown };
    data?: { result?: { message?: unknown } };
  } | null;
  const candidates = [
    envelope?.data?.result?.message,
    envelope?.result?.message,
    envelope?.message,
    envelope?.msg,
  ];
  return (
    candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    ) ?? '加速启动失败'
  );
};

/** 原生隧道模式：1 = iOS。 */
const NATIVE_MODE_IOS = 1;

/** 原生模块未链接时（Android、测试环境）静默跳过，不阻塞业务流程。 */
const stopNativeTunnel = async () => {
  if (!VPNControllerBridge?.stop) {
    logAcceleration('停止原生隧道：原生模块未链接，跳过');
    return;
  }
  try {
    logAcceleration('停止原生隧道：开始', { mode: NATIVE_MODE_IOS });
    await VPNControllerBridge.stop(NATIVE_MODE_IOS);
    logAcceleration('停止原生隧道：完成');
  } catch (error) {
    // 隧道可能本来就没起来；这不该阻断向服务端上报停止。
    logAcceleration('停止原生隧道：失败', getErrorLogDetail(error));
  }
};

/**
 * 启动加速。完整链路：
 *   1. 用所选游戏的 gid 请求 /startup，拿到 speed_id 与线路规则配置
 *   2. 读取本地 GeoIP 白名单，loadSys(1) 加载原生系统
 *   3. 把配置翻译成原生格式，调 start(path, rule) 起隧道
 *   4. 隧道确认连上后才记录 speed_id，供停止时回传
 *
 * 任一步失败都不会留下「服务端以为在加速、本机其实没连」的悬空状态：
 * 原生起不来时会尽力向服务端回报停止。
 */
export async function startAcceleration(
  signal: AbortSignal,
  gid: number,
  accelRouteMode: AccelRouteMode = DEFAULT_ACCEL_ROUTE_MODE,
) {
  // 点击启动后先请求服务端；本机环境不能阻断 HTTPS 启动请求。
  logAcceleration('启动服务：请求 /api/v1/client/startup', {
    gid,
    accelRouteMode,
  });
  const response = await apiClient.startAcceleration({ gid }, { signal });
  logAcceleration('启动服务：收到 /startup 响应', {
    code: response.code,
    message: response.message,
  });

  if (!isSuccessCode(response.code)) {
    const message = getStartupErrorMessage(response);
    logAcceleration('启动服务：服务端拒绝启动', {
      code: response.code,
      message,
    });
    throw new StartupBusinessError(response.code, message);
  }

  const result = extractStartupResult(response);
  if (!result) {
    logAcceleration('启动服务：响应缺少线路配置');
    throw new Error('加速启动失败：服务端未返回线路配置');
  }

  const speedId = result.speed_id;
  logAcceleration('启动服务：取得线路配置', {
    speedId,
    gameRuleCount: result.config?.game_rule?.length ?? 0,
  });

  try {
    const geoIpWhiteList = await readLocalGeoIpCnWhitelist({ signal });
    logAcceleration('启动服务：已读取本地白名单', {
      whiteListCount: geoIpWhiteList.length,
    });

    const { pathJson, ruleJson } = buildNativeStartPayload(
      result,
      accelRouteMode,
      geoIpWhiteList,
    );
    logAcceleration('启动服务：已生成原生线路与规则', {
      pathJsonLength: pathJson.length,
      ruleJsonLength: ruleJson.length,
    });
    // 直接输出待传入的完整字符串，不套用 HTTPS 日志的层级/数组截断。
    // 在环境检查前记录，模拟器上也能核对参数；实际调用复用同一组变量。
    logAcceleration(
      '启动服务：原生 start 参数 1 jsonPathResult（string）',
      pathJson,
    );
    logAcceleration(
      '启动服务：原生 start 参数 2 jsonGamesRules（string）',
      ruleJson,
    );

    // 服务端已创建会话，本机无法启动时通过下方 catch 回滚。
    if (!VPNControllerBridge?.loadSys || !VPNControllerBridge?.start) {
      logAcceleration('启动服务：原生加速模块不可用');
      throw new Error('原生加速模块不可用');
    }
    if (VPNControllerBridge.isSimulator) {
      logAcceleration('启动服务：模拟器不支持 VPN，将回滚服务端会话');
      throw new Error('iOS 模拟器不支持 VPN 加速，请连接 iPhone 真机测试。');
    }

    logAcceleration('启动服务：加载原生 VPN 系统', {
      mode: NATIVE_MODE_IOS,
    });
    await VPNControllerBridge.loadSys(NATIVE_MODE_IOS);
    logAcceleration('启动服务：原生 VPN 系统已加载');

    logAcceleration('启动服务：请求建立原生隧道');
    const connected = await VPNControllerBridge.start(pathJson, ruleJson);
    logAcceleration('启动服务：原生隧道返回', { connected });
    if (!connected) {
      throw new Error('隧道未能连接');
    }
  } catch (error) {
    logAcceleration('启动服务：启动失败，开始回滚服务端会话', {
      speedId,
      ...getErrorLogDetail(error),
    });
    // 隧道没起来，撤销服务端那一侧的加速会话，避免状态不一致。
    try {
      await apiClient.stopAcceleration(speedId);
      logAcceleration('启动服务：服务端会话回滚成功', { speedId });
    } catch (stopError) {
      logAcceleration('启动服务：服务端会话回滚失败', {
        speedId,
        ...getErrorLogDetail(stopError),
      });
    }
    throw error;
  }

  currentSpeedId = speedId;
  logAcceleration('启动服务：加速已启动', { speedId });
  return result;
}

/**
 * 停止加速：先关原生隧道，再向服务端上报停止。
 * 先断隧道，保证即使上报失败用户的网络也已经恢复直连。
 */
export async function stopAcceleration(signal: AbortSignal) {
  logAcceleration('停止服务：开始');
  await stopNativeTunnel();

  const speedId = currentSpeedId;
  currentSpeedId = null;

  // 没有会话 id 说明本次启动没走到服务端，无需上报。
  if (speedId === null) {
    logAcceleration('停止服务：无 speed_id，无需请求服务端');
    return;
  }

  logAcceleration('停止服务：请求 /api/v1/client/stop', { speedId });
  const response = await apiClient.stopAcceleration(speedId, { signal });
  logAcceleration('停止服务：收到 /stop 响应', {
    speedId,
    code: response.code,
    message: response.message,
  });
  if (!isSuccessCode(response.code)) {
    logAcceleration('停止服务：服务端停止失败', {
      speedId,
      code: response.code,
      message: response.message,
    });
    throw new Error(response.message || '加速停止失败');
  }
  logAcceleration('停止服务：加速已停止', { speedId });
}

/**
 * 被服务端指令强制中断加速（会员到期、强制下线）。
 * 与用户主动停止的区别：不因上报失败抛错，隧道必须断干净。
 */
export async function forceStopAcceleration() {
  logAcceleration('强制停止：开始');
  await stopNativeTunnel();

  const speedId = currentSpeedId;
  currentSpeedId = null;
  if (speedId === null) {
    logAcceleration('强制停止：无 speed_id，无需请求服务端');
    return;
  }

  try {
    logAcceleration('强制停止：请求 /api/v1/client/stop', { speedId });
    await apiClient.stopAcceleration(speedId);
    logAcceleration('强制停止：服务端会话已停止', { speedId });
  } catch (error) {
    logAcceleration('强制停止：服务端上报失败', {
      speedId,
      ...getErrorLogDetail(error),
    });
  }
}
