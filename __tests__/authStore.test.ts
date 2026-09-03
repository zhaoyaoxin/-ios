import {
  maskPhoneNumber,
  selectUserAccount,
  useAuthStore,
} from '../src/store/authStore';

afterEach(() => useAuthStore.getState().clearUser());

test('stores the current user and prefers phone over email', () => {
  useAuthStore.getState().setUser({
    id: 6,
    phone: '13800138000',
    email: 'user@example.com',
  } as never);

  expect(selectUserAccount(useAuthStore.getState())).toBe('138****8000');

  useAuthStore.getState().setUser({
    phone: '',
    email: 'user@example.com',
  } as never);
  expect(selectUserAccount(useAuthStore.getState())).toBe('user@example.com');
});

test('masks short phone-like values without exposing the middle digits', () => {
  expect(maskPhoneNumber('1234567')).toBe('*****67');
});
