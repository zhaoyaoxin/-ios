const DEFAULT_TIMEOUT_MS = 10_000;
const SENSITIVE_KEY_PATTERN = /token|password|pwd|ticket|authorization/i;
const HTTP_LOG_ARRAY_LIMIT = 50;
const HTTP_LOG_TEXT_PREVIEW_LENGTH = 300;

/** 仅在开发环境输出网络日志，避免生产环境写入用户敏感信息。 */
const shouldLogHttps = typeof __DEV__ !== 'undefined' && __DEV__ === true;

export type HttpsRequestOptions = Omit<RequestInit, 'signal'> & {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type HttpsRequestBody = HttpsRequestOptions['body'];

export class HttpsRequestError extends Error {
  readonly status?: number;

  constructor(
    message: string,
    status?: number,
    name: string = 'HttpsRequestError',
  ) {
    super(message);
    this.name = name;
    this.status = status;
  }
}

/**
 * 取消错误沿用 Web 标准的 AbortError 命名。
 * 调用方统一用 error.name === 'AbortError' 判断「这是主动取消，不是失败」，
 * 不必关心取消来自页面卸载、上层 signal 还是别处。
 */
export const createAbortError = (message = '请求已取消') =>
  new HttpsRequestError(message, undefined, 'AbortError');

/**
 * 控制台日志需要便于联调，同时不能泄漏 Token、密码、验证码等敏感字段。
 * 数组过长时截断，避免大接口返回导致 JS 线程和 Metro 控制台卡顿。
 */
const sanitizeLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return '[内容层级过深]';
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, HTTP_LOG_ARRAY_LIMIT)
      .map(item => sanitizeLogValue(item, depth + 1));
    return value.length > HTTP_LOG_ARRAY_LIMIT
      ? [...items, `…其余 ${value.length - HTTP_LOG_ARRAY_LIMIT} 项已省略`]
      : items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        // HTTP 响应的 code 是数字状态码，不能因字段同名被脱敏；请求的 code
        // 通常是验证码/兑换码字符串，仍需隐藏。
        SENSITIVE_KEY_PATTERN.test(key) ||
        (key === 'code' && typeof item === 'string')
          ? '[已脱敏]'
          : sanitizeLogValue(item, depth + 1),
      ]),
    );
  }
  return value;
};

const parseRequestBodyForLog = (body: HttpsRequestBody): unknown => {
  if (typeof body !== 'string') {
    return body ?? undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const logHttpsRequest = (
  method: string,
  url: string,
  body: HttpsRequestBody,
  headers: Headers,
) => {
  if (!shouldLogHttps) {
    return;
  }
  console.log('[HTTPS 请求]', {
    method,
    url,
    params: sanitizeLogValue(parseRequestBodyForLog(body)),
    // token / Authorization 永远不打印；保留联调时常用的设备、平台和版本信息。
    headers: {
      mac: headers.get('mac'),
      platform: headers.get('platform'),
      version: headers.get('version'),
    },
  });
};

const logHttpsJsonResponse = (
  method: string,
  url: string,
  status: number,
  durationMs: number,
  result: unknown,
) => {
  if (!shouldLogHttps) {
    return;
  }
  console.log('[HTTPS 响应]', {
    method,
    url,
    status,
    durationMs,
    result: sanitizeLogValue(result),
  });
};

const logHttpsTextResponse = (
  method: string,
  url: string,
  status: number,
  durationMs: number,
  result: string,
) => {
  if (!shouldLogHttps) {
    return;
  }
  // geoip 文件可能很大，只展示长度及前 300 个字符，防止调试日志阻塞界面。
  console.log('[HTTPS 响应]', {
    method,
    url,
    status,
    durationMs,
    result: {
      textLength: result.length,
      preview: result.slice(0, HTTP_LOG_TEXT_PREVIEW_LENGTH),
    },
  });
};

const logHttpsError = (
  method: string,
  url: string,
  durationMs: number,
  error: Error,
) => {
  if (!shouldLogHttps) {
    return;
  }
  console.warn('[HTTPS 失败]', {
    method,
    url,
    durationMs,
    message: error.message,
    name: error.name,
  });
};

/**
 * Small fetch wrapper that intentionally rejects non-HTTPS endpoints.
 * It keeps transport policy in one place and adds timeout/cancellation support.
 */
export async function requestJson<T>(
  url: string,
  options: HttpsRequestOptions = {},
): Promise<T> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url.trim());
  } catch {
    throw new HttpsRequestError('请输入有效的 HTTPS 地址');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new HttpsRequestError('仅允许 HTTPS 请求');
  }

  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    ...fetchOptions
  } = options;

  // 传进来时就已经取消的信号不会再触发 abort 事件，这里直接短路，避免白发请求。
  if (signal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }
  let timedOut = false;

  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const startedAt = Date.now();
  logHttpsRequest(
    fetchOptions.method ?? 'GET',
    parsedUrl.toString(),
    fetchOptions.body,
    requestHeaders,
  );

  try {
    const response = await fetch(parsedUrl.toString(), {
      ...fetchOptions,
      headers: requestHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpsRequestError(
        `请求失败（HTTP ${response.status}）`,
        response.status,
      );
    }

    const result = (await response.json()) as T;
    logHttpsJsonResponse(
      fetchOptions.method ?? 'GET',
      parsedUrl.toString(),
      response.status,
      Date.now() - startedAt,
      result,
    );
    return result;
  } catch (error) {
    const requestError =
      error instanceof HttpsRequestError
        ? error
        : timedOut
        ? new HttpsRequestError(`请求超时（${timeoutMs / 1000} 秒）`)
        : signal?.aborted
        ? createAbortError()
        : new HttpsRequestError(
            error instanceof Error ? error.message : '网络请求失败',
          );
    logHttpsError(
      fetchOptions.method ?? 'GET',
      parsedUrl.toString(),
      Date.now() - startedAt,
      requestError,
    );
    throw requestError;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * 与 requestJson 共用 HTTPS、超时和取消策略，但保留服务端原始文本。
 * GeoIP 下载阶段保留原始 JSON 文本用于本地缓存，加速组装参数时再解析。
 */
export async function requestText(
  url: string,
  options: HttpsRequestOptions = {},
): Promise<string> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url.trim());
  } catch {
    throw new HttpsRequestError('请输入有效的 HTTPS 地址');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new HttpsRequestError('仅允许 HTTPS 请求');
  }

  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    ...fetchOptions
  } = options;
  if (signal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const startedAt = Date.now();
  logHttpsRequest(
    fetchOptions.method ?? 'GET',
    parsedUrl.toString(),
    fetchOptions.body,
    requestHeaders,
  );

  try {
    const response = await fetch(parsedUrl.toString(), {
      ...fetchOptions,
      headers: requestHeaders,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HttpsRequestError(
        `请求失败（HTTP ${response.status}）`,
        response.status,
      );
    }
    const result = await response.text();
    logHttpsTextResponse(
      fetchOptions.method ?? 'GET',
      parsedUrl.toString(),
      response.status,
      Date.now() - startedAt,
      result,
    );
    return result;
  } catch (error) {
    const requestError =
      error instanceof HttpsRequestError
        ? error
        : timedOut
        ? new HttpsRequestError(`请求超时（${timeoutMs / 1000} 秒）`)
        : signal?.aborted
        ? createAbortError()
        : new HttpsRequestError(
            error instanceof Error ? error.message : '网络请求失败',
          );
    logHttpsError(
      fetchOptions.method ?? 'GET',
      parsedUrl.toString(),
      Date.now() - startedAt,
      requestError,
    );
    throw requestError;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
