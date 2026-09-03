import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { LoginScreen } from '../src/screens/LoginScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('validates fields and submits independent login credentials', async () => {
  jest.useFakeTimers();
  const onLogin = jest.fn().mockResolvedValue(undefined);
  const onCodeLogin = jest.fn().mockResolvedValue(undefined);
  const onRegister = jest.fn();
  const onSendCode = jest.fn();
  const onVerificationLogin = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <LoginScreen
        onBack={jest.fn()}
        onCodeLogin={onCodeLogin}
        onLogin={onLogin}
        onRegister={onRegister}
        onSendCode={onSendCode}
        onVerificationLogin={onVerificationLogin}
      />,
    );
  });

  const welcomeLines = renderer!.root
    .findByProps({ testID: 'login-welcome' })
    .findAllByType(Text);
  expect(welcomeLines.map(line => line.props.children)).toEqual([
    '你好，',
    '欢迎使用「光年回国加速」',
  ]);
  expect(
    renderer!.root.findByProps({ testID: 'login-welcome-accent' }).props.source,
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'login-account-label' }).props
      .children,
  ).toBe('账号');
  expect(
    renderer!.root.findByProps({ testID: 'country-code-trigger' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'login-credential-label' }).props
      .children,
  ).toBe('密码');
  expect(
    renderer!.root.findByProps({ testID: 'login-bottom-logo' }).props.source,
  ).toEqual({ uri: 'LaunchLogo' });
  expect(
    renderer!.root.findByProps({ testID: 'login-top-decoration' }).props.source,
  ).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'login-screen-back-button' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ testID: 'login-screen-title' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'login-register' }).props.onPress();
  });
  expect(onRegister).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findByProps({ testID: 'login-submit' }).props
      .accessibilityLabel,
  ).toBe('注册');
  expect(
    renderer!.root.findByProps({ testID: 'login-register' }).props
      .accessibilityLabel,
  ).toBe('已有账号？开始登录');
  expect(
    renderer!.root.findAllByProps({ testID: 'login-verification-mode' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ testID: 'register-agreement' }).props
      .accessibilityState.checked,
  ).toBe(false);
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'register-agreement' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'register-agreement' }).props
      .accessibilityState.checked,
  ).toBe(true);
  expect(
    renderer!.root.findByProps({ testID: 'login-credential-label' }).props
      .children,
  ).toBe('验证码');
  expect(
    renderer!.root.findByProps({ testID: 'login-verification-input' }).props
      .placeholder,
  ).toBe('请输入验证码');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'login-username-input' })
      .props.onChangeText('13800138000');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'login-send-code' })
      .props.onPress();
  });
  expect(onSendCode).toHaveBeenCalledWith({
    type: 'phone',
    countryCode: '86',
    phone: '13800138000',
  });
  expect(
    renderer!.root.findByProps({ testID: 'login-send-code-text' }).props
      .children,
  ).toBe('60s');
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(
    renderer!.root.findByProps({ testID: 'login-send-code-text' }).props
      .children,
  ).toBe('59s');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'login-submit' }).props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'login-error' }).props.children,
  ).toBe('请输入手机号和验证码');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'login-account-type-email' })
      .props.onPress();
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'country-code-trigger' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ testID: 'login-username-input' }).props
      .placeholder,
  ).toBe('请输入邮箱');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'login-username-input' })
      .props.onChangeText(' user@example.com ');
    renderer!.root
      .findByProps({ testID: 'login-verification-input' })
      .props.onChangeText('123456');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'login-submit' })
      .props.onPress();
  });

  expect(onCodeLogin).toHaveBeenCalledWith({
    account: { type: 'email', email: 'user@example.com' },
    code: '123456',
    registration: true,
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'login-register' }).props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'login-credential-label' }).props
      .children,
  ).toBe('密码');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'login-username-input' })
      .props.onChangeText('user@example.com');
    renderer!.root
      .findByProps({ testID: 'login-password-input' })
      .props.onChangeText('secret');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'login-submit' })
      .props.onPress();
  });
  expect(onLogin).toHaveBeenCalledWith({
    username: 'user@example.com',
    password: 'secret',
  });

  expect(
    renderer!.root.findByProps({ testID: 'login-submit' }).props
      .accessibilityLabel,
  ).toBe('登录');

  await ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('switches a new registration to mandatory password setup', async () => {
  const onCodeLogin = jest.fn().mockResolvedValue({ isNew: true });
  const onSetPassword = jest.fn().mockResolvedValue(undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <LoginScreen
        onBack={jest.fn()}
        onCodeLogin={onCodeLogin}
        onSendCode={jest.fn()}
        onSetPassword={onSetPassword}
      />,
    );
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'login-register' }).props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'register-agreement' })
      .props.onPress();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'login-username-input' })
      .props.onChangeText('13800138000');
    renderer!.root
      .findByProps({ testID: 'login-verification-input' })
      .props.onChangeText('123456');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'login-submit' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'set-password-screen' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'set-password-new-input' })
      .props.onChangeText('new-password');
    renderer!.root
      .findByProps({ testID: 'set-password-confirm-input' })
      .props.onChangeText('new-password');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'set-password-submit' })
      .props.onPress();
  });
  expect(onSetPassword).toHaveBeenCalledWith('new-password');

  await ReactTestRenderer.act(() => renderer!.unmount());
});
