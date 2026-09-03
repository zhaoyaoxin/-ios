import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { BindAccountScreen } from '../src/screens/BindAccountScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('requests captcha ticket before sending a phone code and binds phone', async () => {
  jest.useFakeTimers();
  const requestTicket = jest.fn(async () => 'captcha-ticket');
  const sendCode = jest.fn(async () => undefined);
  const submit = jest.fn(async () => undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <BindAccountScreen
        mode="phone"
        onBack={jest.fn()}
        onRequestPhoneTicket={requestTicket}
        onSendPhoneCode={sendCode}
        onSubmitPhone={submit}
      />,
    );
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'bind-account-input' })
      .props.onChangeText('13800138000');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'bind-send-code' })
      .props.onPress();
  });
  expect(requestTicket).toHaveBeenCalledTimes(1);
  expect(sendCode).toHaveBeenCalledWith('13800138000', 'captcha-ticket');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'bind-code-input' })
      .props.onChangeText('123456');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({ testID: 'bind-submit' }).props.onPress();
  });
  expect(submit).toHaveBeenCalledWith('13800138000', '123456');

  await ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('submits email, code and login password when binding email', async () => {
  const submit = jest.fn(async () => undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <BindAccountScreen
        mode="email"
        onBack={jest.fn()}
        onSubmitEmail={submit}
      />,
    );
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'bind-account-input' })
      .props.onChangeText('user@example.com');
    renderer!.root
      .findByProps({ testID: 'bind-code-input' })
      .props.onChangeText('654321');
    renderer!.root
      .findByProps({ testID: 'bind-password-input' })
      .props.onChangeText('password');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root.findByProps({ testID: 'bind-submit' }).props.onPress();
  });
  expect(submit).toHaveBeenCalledWith('user@example.com', '654321', 'password');

  await ReactTestRenderer.act(() => renderer!.unmount());
});
