import {HttpsRequestError, requestJson} from '../src/services/httpsClient';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('rejects an insecure endpoint before fetching', async () => {
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock;

  await expect(requestJson('http://example.com/data')).rejects.toEqual(
    expect.objectContaining({message: '仅允许 HTTPS 请求'}),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test('returns parsed JSON from an HTTPS endpoint', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ready: true}),
  });

  await expect(requestJson('https://example.com/data')).resolves.toEqual({
    ready: true,
  });
});

test('surfaces the HTTP status code', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 503,
  });

  await expect(requestJson('https://example.com/data')).rejects.toEqual(
    new HttpsRequestError('请求失败（HTTP 503）', 503),
  );
});

test('请求途中取消：错误名为 AbortError，便于调用方与真实失败区分', async () => {
  const controller = new AbortController();
  globalThis.fetch = jest.fn(
    () =>
      new Promise((_resolve, reject) => {
        controller.abort();
        // 真实 fetch 被 abort 时抛的是 DOMException/Error，这里模拟同样效果。
        reject(new Error('Aborted'));
      }),
  ) as unknown as typeof fetch;

  await expect(
    requestJson('https://example.com/data', { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError', message: '请求已取消' });
});

test('传入已取消的 signal 时直接短路，不发请求', async () => {
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const controller = new AbortController();
  controller.abort();

  await expect(
    requestJson('https://example.com/data', { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
});
