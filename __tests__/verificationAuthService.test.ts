import { saveAuthToken } from '../src/services/authTokenStorage';
import { saveAuthUser } from '../src/services/authUserStorage';
import {
  bindCurrentEmail,
  bindCurrentPhone,
  changeCurrentProductType,
  loadClientInitialization,
  loadCurrentAuthUser,
  loadOrderPage,
  loginWithPassword,
  loginWithVerificationCode,
  parseVerificationAccount,
  resetCurrentPasswordByEmail,
  sendEmailBindingCode,
  sendPhoneBindingCode,
  sendVerificationCode,
  setCurrentUserPassword,
  toggleCurrentProductPause,
} from '../src/services/verificationAuthService';

jest.mock('../src/services/authTokenStorage', () => ({
  getAuthToken: jest.fn(() => undefined),
  saveAuthToken: jest.fn(),
}));

jest.mock('../src/services/authUserStorage', () => ({
  saveAuthUser: jest.fn(),
}));

const createClient = () => ({
  bindEmail: jest.fn(),
  bindPhone: jest.fn(),
  changeProductType: jest.fn(),
  emailLogin: jest.fn(),
  getProfile: jest.fn(),
  getGeoIpCn: jest.fn(),
  getOrders: jest.fn(),
  initialize: jest.fn(),
  login: jest.fn(),
  phoneLogin: jest.fn(),
  resetPasswordByEmail: jest.fn(),
  restoreProfile: jest.fn(),
  sendEmailCode: jest.fn(),
  sendSmsCode: jest.fn(),
  setToken: jest.fn(),
  setPassword: jest.fn(),
  toggleProductPause: jest.fn(),
});

test('loads the current user order list', async () => {
  const client = createClient();
  const data = {
    items: [],
    pagination: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
  };
  client.getOrders.mockResolvedValue({ code: 0, message: 'ok', data });

  await expect(loadOrderPage(1, 20, client)).resolves.toBe(data);
  expect(client.getOrders).toHaveBeenCalledWith({ page: 1, size: 20 });
});

test('sends binding codes and persists bound user data', async () => {
  const client = createClient();
  const phoneUser = { id: 6, phone: '13800138000', email: '' };
  const emailUser = { ...phoneUser, email: 'user@example.com' };
  client.sendSmsCode.mockResolvedValue({ code: 0, message: 'ok' });
  client.sendEmailCode.mockResolvedValue({ code: 200, message: 'ok' });
  client.bindPhone.mockResolvedValue({
    code: 200,
    message: 'ok',
    data: { user: phoneUser },
  });
  client.bindEmail.mockResolvedValue({
    code: 200,
    message: 'ok',
    data: { user: emailUser },
  });

  await sendPhoneBindingCode('13800138000', 'captcha-ticket', client);
  expect(client.sendSmsCode).toHaveBeenCalledWith({
    country_code: '86',
    phone: '13800138000',
    ticket: 'captcha-ticket',
  });
  await sendEmailBindingCode('User@Example.com', client);
  expect(client.sendEmailCode).toHaveBeenCalledWith('user@example.com');

  await expect(bindCurrentPhone('13800138000', '123456', client)).resolves.toBe(
    phoneUser,
  );
  await expect(
    bindCurrentEmail('User@Example.com', '654321', 'password', client),
  ).resolves.toBe(emailUser);
  expect(client.bindEmail).toHaveBeenCalledWith({
    email: 'user@example.com',
    code: '654321',
    password: 'password',
  });
  expect(saveAuthUser).toHaveBeenLastCalledWith(emailUser);
});

test('resets an email password with its verification code', async () => {
  const client = createClient();
  client.resetPasswordByEmail.mockResolvedValue({ code: 200, message: 'ok' });

  await resetCurrentPasswordByEmail(
    'User@Example.com',
    '123456',
    'new-password',
    client,
  );
  expect(client.resetPasswordByEmail).toHaveBeenCalledWith({
    email: 'user@example.com',
    code: '123456',
    new_password: 'new-password',
  });
});

test('logs in with a password and persists authentication data', async () => {
  const client = createClient();
  const user = { id: 6, phone: '13800138000', email: '' };
  client.login.mockResolvedValue({
    code: 0,
    message: '登录成功',
    data: { token: 'password-token', user },
  });

  await expect(
    loginWithPassword('13800138000', 'secret', client),
  ).resolves.toEqual({ token: 'password-token', user });
  expect(client.login).toHaveBeenCalledWith({
    username: '13800138000',
    password: 'secret',
  });
  expect(saveAuthToken).toHaveBeenCalledWith('password-token');
  expect(saveAuthUser).toHaveBeenCalledWith(user);
  expect(client.setToken).toHaveBeenCalledWith('password-token');
});

test('loads client initialization data', async () => {
  const client = createClient();
  const initialization = { ip: '127.0.0.1', banners: [] };
  client.initialize.mockResolvedValue({
    code: 0,
    message: 'ok',
    data: initialization,
  });

  await expect(loadClientInitialization(client)).resolves.toBe(initialization);
  expect(client.initialize).toHaveBeenCalledWith(undefined);
});

test('loads and persists the current user profile', async () => {
  const client = createClient();
  const user = { phone: '', email: 'user@example.com' };
  client.getProfile.mockResolvedValue({
    code: 0,
    message: 'ok',
    data: { user, mac: 'device-id', platform: 'ios' },
  });

  await expect(loadCurrentAuthUser(client)).resolves.toBe(user);
  expect(client.getProfile).toHaveBeenCalledWith(undefined);
  expect(saveAuthUser).toHaveBeenCalledWith(user);
});

test('toggles pausable time and refreshes the user profile', async () => {
  const client = createClient();
  const user = { phone: '13800138000', email: '', pause_4: 1 };
  client.toggleProductPause.mockResolvedValue({ code: 0, message: 'ok' });
  client.getProfile.mockResolvedValue({
    code: 0,
    message: 'ok',
    data: { user, mac: 'device-id', platform: 'ios' },
  });

  await expect(toggleCurrentProductPause('disable', client)).resolves.toBe(
    user,
  );
  expect(client.toggleProductPause).toHaveBeenCalledWith({
    action: 'disable',
  });
  expect(client.getProfile).toHaveBeenCalled();
});

test('changes membership type and refreshes the current user', async () => {
  const client = createClient();
  const user = { phone: '13800138000', email: '', product_id: 4 };
  client.changeProductType.mockResolvedValue({ code: 0, message: 'ok' });
  client.getProfile.mockResolvedValue({
    code: 0,
    message: 'ok',
    data: { user, mac: 'device-id', platform: 'ios' },
  });

  await expect(changeCurrentProductType(4, client)).resolves.toBe(user);
  expect(client.changeProductType).toHaveBeenCalledWith({ target_type: 4 });
  expect(client.getProfile).toHaveBeenCalled();
});

test('recognizes mainland phone numbers and email addresses', () => {
  expect(parseVerificationAccount('+8613800138000')).toEqual({
    type: 'phone',
    countryCode: '86',
    phone: '13800138000',
  });
  expect(parseVerificationAccount(' User@Example.COM ')).toEqual({
    type: 'email',
    email: 'user@example.com',
  });
  expect(() => parseVerificationAccount('invalid')).toThrow(
    '请输入正确的手机号或邮箱',
  );
});

test('routes code sending to phone and email APIs', async () => {
  const phoneClient = createClient();
  phoneClient.sendSmsCode.mockResolvedValue({ code: 0, message: 'ok' });
  await sendVerificationCode(
    { type: 'phone', countryCode: '86', phone: '13800138000' },
    phoneClient,
  );
  expect(phoneClient.sendSmsCode).toHaveBeenCalledWith({
    country_code: '86',
    phone: '13800138000',
  });

  const emailClient = createClient();
  emailClient.sendEmailCode.mockResolvedValue({ code: 200, message: 'ok' });
  await sendVerificationCode(
    { type: 'email', email: 'user@example.com' },
    emailClient,
  );
  expect(emailClient.sendEmailCode).toHaveBeenCalledWith('user@example.com');
});

test('logs in with a code and persists the returned token', async () => {
  const client = createClient();
  client.phoneLogin.mockResolvedValue({
    code: 0,
    message: '登录成功',
    data: {
      token: 'login-token',
      is_new: false,
      mac: '02:DC:A7:13:55:5F',
      platform: 'unknown',
      user: { id: 6, phone: '13800138000', country: 86 },
    },
  });

  await loginWithVerificationCode(
    { type: 'phone', countryCode: '86', phone: '13800138000' },
    '123456',
    client,
  );

  expect(client.phoneLogin).toHaveBeenCalledWith({
    country_code: '86',
    phone: '13800138000',
    code: '123456',
  });
  expect(saveAuthToken).toHaveBeenCalledWith('login-token');
  expect(saveAuthUser).toHaveBeenCalledWith({
    id: 6,
    phone: '13800138000',
    country: 86,
  });
  expect(client.setToken).toHaveBeenCalledWith('login-token');
});

test('uses the default password for email registration and sets a new password', async () => {
  const client = createClient();
  client.emailLogin.mockResolvedValue({
    code: 0,
    message: 'ok',
    data: {
      token: 'registration-token',
      is_new: true,
      user: { email: 'user@example.com', phone: '' },
    },
  });
  client.setPassword.mockResolvedValue({ code: 0, message: 'ok' });

  await loginWithVerificationCode(
    { type: 'email', email: 'user@example.com' },
    '123456',
    client,
    { registration: true },
  );
  expect(client.emailLogin).toHaveBeenCalledWith({
    email: 'user@example.com',
    code: '123456',
    password: '123456',
  });

  await setCurrentUserPassword('new-password', client);
  expect(client.setPassword).toHaveBeenCalledWith('new-password');
});
