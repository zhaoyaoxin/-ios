import { NativeModules, NativeEventEmitter } from 'react-native';

interface VPNControllerBridgeInterface {
  /** 编译目标是否为 iOS 模拟器；该环境无法建立系统 VPN 隧道。 */
  readonly isSimulator: boolean;

  /**
   * 加载系统
   * @param mode 模式：1 = iOS, 2 = Mac
   * @returns Promise<boolean> 成功返回 true，失败返回 false
   */
  loadSys(mode: number): Promise<boolean>;

  /**
   * 启动加速。Promise resolve 表示系统 VPN 已 Connected。
   * @param jsonPathResult 路径信息的 JSON 字符串
   * @param jsonGamesRules 规则信息的 JSON 字符串；可选字段 accel_route_mode:
   *   "abroad"(默认) = 国内加速国外；"china" = 国外加速国内
   * @returns Promise<boolean> Connected 后为 true
   */
  start(jsonPathResult: string, jsonGamesRules: string): Promise<boolean>;

  /**
   * 停止加速
   * @param mode 模式：1 = iOS, 2 = Mac
   * @returns Promise<boolean> 成功返回 true，失败返回 false
   */
  stop(mode: number): Promise<boolean>;

  /**
   * 获取流量信息
   * @returns Promise<{sendBytes: number, receiveBytes: number}> 上行和下行流量（字节）
   */
  getTrafficInfo(): Promise<{
    sendBytes: number;
    receiveBytes: number;
  }>;

  /**
   * 获取速度信息
   * @param mode 模式：1 = iOS, 2 = Mac
   * @returns Promise<any> 返回包含延迟、日志等信息的 JSON 对象
   */
  getSpeedInfo(mode: number): Promise<any>;

  /**
   * 开始网络测速
   * @param testURL 测速文件 URL（可选，默认使用内置 URL）
   * @param timeout 超时时间（秒，默认 30）
   * @param updateIntervalMs 进度更新间隔（毫秒，默认 1000）
   * @returns Promise<void> 测速是异步的，通过事件监听进度和结果
   */
  testSpeed(
    testURL?: string,
    timeout?: number,
    updateIntervalMs?: number,
  ): Promise<void>;
}

const { VPNControllerBridge } = NativeModules;

const vpnControllerBridge = VPNControllerBridge as VPNControllerBridgeInterface;

// 创建事件发射器
const speedTestEventEmitter = VPNControllerBridge
  ? new NativeEventEmitter(VPNControllerBridge as any)
  : null;

// 调试：检查事件发射器是否创建成功
if (!speedTestEventEmitter) {
  console.warn('VPNControllerBridge 事件发射器创建失败');
} else {
  console.log('VPNControllerBridge 事件发射器创建成功');
}

/**
 * 测速结果接口
 */
export interface SpeedTestResult {
  fileSizeBytes: number;
  fileSizeKB: number;
  durationMs: number;
  averageSpeedKbps: number;
  startTime: string;
  endTime: string;
}

/**
 * 测速进度回调
 */
export type SpeedTestProgressCallback = (
  progress: number,
  speedKbps: number,
) => void;

/**
 * 测速完成回调
 */
export type SpeedTestCompleteCallback = (
  result: SpeedTestResult | null,
  error: Error | null,
) => void;

/**
 * 开始网络测速
 * @param options 测速选项
 * @param onProgress 进度回调（可选）
 * @param onComplete 完成回调（可选）
 * @returns Promise<void> 启动测速后立即返回，进度和结果通过回调函数获取
 */
export async function testSpeed(
  options?: {
    testURL?: string;
    timeout?: number;
    updateIntervalMs?: number;
  },
  onProgress?: SpeedTestProgressCallback,
  onComplete?: SpeedTestCompleteCallback,
): Promise<void> {
  const {
    testURL = 'https://speed.cloudflare.com/__down?during=download&bytes=1073741824',
    timeout = 30,
    updateIntervalMs = 1000,
  } = options || {};

  try {
    // 设置事件监听器（如果支持）
    let progressSubscription: any = null;
    let completeSubscription: any = null;

    if (speedTestEventEmitter) {
      // 监听进度事件
      if (onProgress) {
        console.log('设置进度事件监听器');
        progressSubscription = speedTestEventEmitter.addListener(
          'SpeedTestProgress',
          (event: { progress: number; speedKbps: number }) => {
            console.log('收到进度事件:', event);
            onProgress(event.progress, event.speedKbps);
          },
        );
      }

      // 监听完成事件
      if (onComplete) {
        console.log('设置完成事件监听器');
        completeSubscription = speedTestEventEmitter.addListener(
          'SpeedTestComplete',
          (event: {
            result?: SpeedTestResult;
            error?: { code: number; message: string };
          }) => {
            console.log('收到完成事件:', event);
            // 清理订阅
            if (progressSubscription) {
              progressSubscription.remove();
            }
            if (completeSubscription) {
              completeSubscription.remove();
            }

            if (event.error) {
              onComplete(null, new Error(event.error.message));
            } else if (event.result) {
              onComplete(event.result, null);
            } else {
              onComplete(null, new Error('未知错误'));
            }
          },
        );
      }
    }

    // 启动测速
    await vpnControllerBridge.testSpeed(testURL, timeout, updateIntervalMs);

    // 如果不支持事件监听，提示用户
    if (!speedTestEventEmitter && (onProgress || onComplete)) {
      console.warn(
        '事件监听器不可用，进度和结果回调可能无法正常工作。请检查原生代码是否正确实现了事件发送。',
      );
    }
  } catch (error) {
    console.error('启动测速失败:', error);
    if (onComplete) {
      onComplete(null, error as Error);
    }
    throw error;
  }
}

export default vpnControllerBridge;
