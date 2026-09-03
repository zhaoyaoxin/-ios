import {
  clearAuthUser,
  getAuthUser,
  getAuthUserAccount,
  saveAuthUser,
} from '../src/services/authUserStorage';

const createStorage = () => {
  const values: Record<string, string> = {};
  return {
    get: jest.fn((key: string) => values[key]),
    set: jest.fn((next: Record<string, string>) => Object.assign(values, next)),
  };
};

test('persists user contact details and prefers phone for display', () => {
  const storage = createStorage();
  saveAuthUser({ phone: '13800138000', email: 'user@example.com' }, storage);

  const user = getAuthUser(storage);
  expect(user).toEqual({ phone: '13800138000', email: 'user@example.com' });
  expect(getAuthUserAccount(user)).toBe('13800138000');
  expect(getAuthUserAccount({ phone: '', email: 'user@example.com' })).toBe(
    'user@example.com',
  );

  clearAuthUser(storage);
  expect(getAuthUser(storage)).toBeUndefined();
});
