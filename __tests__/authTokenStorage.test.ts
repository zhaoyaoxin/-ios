import {
  clearAuthToken,
  getAuthToken,
  saveAuthToken,
} from '../src/services/authTokenStorage';

const createMemoryStorage = (initialToken?: string) => {
  const values = new Map<string, string>();
  if (initialToken !== undefined) {
    values.set('lottielite.auth_token', initialToken);
  }
  return {
    get: jest.fn((key: string) => values.get(key)),
    set: jest.fn((entries: Record<string, string>) => {
      Object.entries(entries).forEach(([key, value]) => values.set(key, value));
    }),
  };
};

test('saves, reads and clears the auth token', () => {
  const storage = createMemoryStorage();

  expect(getAuthToken(storage)).toBeUndefined();
  saveAuthToken(' token-value ', storage);
  expect(getAuthToken(storage)).toBe('token-value');
  clearAuthToken(storage);
  expect(getAuthToken(storage)).toBeUndefined();
});

test('rejects an empty auth token', () => {
  expect(() => saveAuthToken('  ', createMemoryStorage())).toThrow(
    '不能保存空的登录 Token',
  );
});
