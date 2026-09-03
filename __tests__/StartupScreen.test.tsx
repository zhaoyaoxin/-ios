import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { HomeAnimationScreen } from '../src/screens/StartupScreen';
import { ThemeAlertDialog } from '../src/components/ThemeAlertDialog';
import { startAcceleration } from '../src/services/accelerationService';

const mockPause = jest.fn();

jest.mock('../src/services/accelerationService', () => ({
  logAcceleration: jest.fn(),
  startAcceleration: jest.fn(),
  stopAcceleration: jest.fn(),
  StartupBusinessError: class extends Error {},
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('lottie-react-native', () => {
  const MockReact = require('react');
  const MockView = require('react-native').View;
  return {
    __esModule: true,
    default: MockReact.forwardRef(function MockLottie(
      props: { testID?: string },
      ref: unknown,
    ) {
      MockReact.useImperativeHandle(ref, () => ({
        play: jest.fn(),
        pause: mockPause,
      }));
      return <MockView testID={props.testID} />;
    }),
  };
});

test('原生启动失败时显示原因、暂停动画且不计时，确认后不自动重试', async () => {
  jest.useFakeTimers();
  const message = 'iOS 模拟器不支持 VPN 加速，请连接 iPhone 真机测试。';
  jest.mocked(startAcceleration).mockRejectedValue(new Error(message));
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HomeAnimationScreen onMenuPress={jest.fn()} selectedGameId={1866} />,
      );
    });
    await act(async () => {
      await renderer.root
        .findByProps({ testID: 'home-animation-button' })
        .props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(renderer.root.findByType(ThemeAlertDialog).props).toMatchObject({
      visible: true,
      message,
    });
    expect(mockPause).toHaveBeenCalled();
    expect(
      renderer.root.findByProps({ testID: 'home-acceleration-time' }).props
        .children,
    ).toBe('00:00:00');
    expect(
      renderer.root.findByProps({ testID: 'home-acceleration-label' }).props
        .children,
    ).toBe('点击加速');

    await act(async () => {
      await renderer.root.findByType(ThemeAlertDialog).props.onConfirm();
    });
    expect(renderer.root.findByType(ThemeAlertDialog).props.visible).toBe(false);
    expect(startAcceleration).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => renderer?.unmount());
    jest.useRealTimers();
  }
});
