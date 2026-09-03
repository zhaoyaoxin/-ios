import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { PasswordSettingsScreen } from '../src/screens/PasswordSettingsScreen';
import { useAuthStore } from '../src/store/authStore';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('prioritizes phone verification and submits the new password', async () => {
  useAuthStore.getState().setUser({
    phone: '13800138000',
    email: 'user@example.com',
  } as never);
  const requestTicket = jest.fn(async () => 'captcha-ticket');
  const sendPhoneCode = jest.fn(async () => undefined);
  const submitPhone = jest.fn(async () => undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PasswordSettingsScreen
        onBack={jest.fn()}
        onRequestPhoneTicket={requestTicket}
        onSendPhoneCode={sendPhoneCode}
        onSubmitPhone={submitPhone}
      />,
    );
  });

  expect(
    renderer!.root.findByProps({ testID: 'password-account' }).props.children,
  ).toBe('138****8000');
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'password-send-code' })
      .props.onPress();
  });
  expect(sendPhoneCode).toHaveBeenCalledWith('13800138000', 'captcha-ticket');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'password-code-input' })
      .props.onChangeText('123456');
    renderer!.root
      .findByProps({ testID: 'password-new-input' })
      .props.onChangeText('new-password');
    renderer!.root
      .findByProps({ testID: 'password-confirm-input' })
      .props.onChangeText('new-password');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'password-submit' })
      .props.onPress();
  });
  expect(submitPhone).toHaveBeenCalledWith('new-password');

  await ReactTestRenderer.act(() => renderer!.unmount());
  useAuthStore.getState().clearUser();
});

test('uses email code when no phone is bound', async () => {
  useAuthStore.getState().setUser({
    phone: '',
    email: 'user@example.com',
  } as never);
  const submitEmail = jest.fn(async () => undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PasswordSettingsScreen onBack={jest.fn()} onSubmitEmail={submitEmail} />,
    );
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'password-code-input' })
      .props.onChangeText('654321');
    renderer!.root
      .findByProps({ testID: 'password-new-input' })
      .props.onChangeText('new-password');
    renderer!.root
      .findByProps({ testID: 'password-confirm-input' })
      .props.onChangeText('new-password');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'password-submit' })
      .props.onPress();
  });
  expect(submitEmail).toHaveBeenCalledWith(
    'user@example.com',
    '654321',
    'new-password',
  );

  await ReactTestRenderer.act(() => renderer!.unmount());
  useAuthStore.getState().clearUser();
});

test('shows a prompt when no recovery account is bound', async () => {
  useAuthStore.getState().setUser({ phone: '', email: '' } as never);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PasswordSettingsScreen onBack={jest.fn()} />,
    );
  });
  expect(
    renderer!.root.findByProps({ testID: 'theme-alert-dialog-message' }).props
      .children,
  ).toBe('当前账号未绑定手机号或邮箱');

  await ReactTestRenderer.act(() => renderer!.unmount());
  useAuthStore.getState().clearUser();
});
