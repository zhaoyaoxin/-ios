/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import App from '../App';
import { useLocaleStore } from '../src/i18n';
import { getAuthToken } from '../src/services/authTokenStorage';

jest.mock('../src/services/authTokenStorage', () => ({
  clearAuthToken: jest.fn(),
  getAuthToken: jest.fn(() => 'persisted-test-token'),
  saveAuthToken: jest.fn(),
}));

jest.mock('../src/services/authUserStorage', () => ({
  clearAuthUser: jest.fn(),
  getAuthUser: jest.fn(() => ({
    phone: '13800138000',
    email: 'user@example.com',
  })),
  getAuthUserAccount: jest.fn(
    (user?: { phone?: string; email?: string }) =>
      user?.phone || user?.email || '未设置账号',
  ),
}));

jest.mock('../src/services/helpService', () => ({
  loadHelpCategories: jest.fn(async () => []),
}));

jest.mock('../src/services/gameService', () => ({
  loadIosGames: jest.fn(async () => []),
  loadIosCategories: jest.fn(async () => []),
  // 过滤是纯逻辑，保留真实实现，避免 mock 掩盖模式切分行为。
  isMediaModeGame: (game: { is_media_mode?: boolean }) =>
    game.is_media_mode === true,
  filterGamesByMode: (
    games: { is_media_mode?: boolean }[],
    mode: 'game' | 'media',
  ) => games.filter(game => (game.is_media_mode === true) === (mode === 'media')),
  resolveGameName: jest.fn((game: { name: string }) => game.name),
  resolveGameArea: jest.fn((game: { area: string }) => game.area),
}));

jest.mock('../src/services/heartbeatService', () => ({
  HEARTBEAT_INTERVAL_MS: 5 * 60 * 1000,
  startHeartbeat: jest.fn(),
  stopHeartbeat: jest.fn(),
}));

jest.mock('../src/services/verificationAuthService', () => ({
  loadClientInitialization: jest.fn(async () => ({
    ip: '127.0.0.1',
    banners: [],
  })),
  loadCurrentAuthUser: jest.fn(async () => ({
    id: 6,
    phone: '13800138000',
    email: 'user@example.com',
  })),
  loadOrderPage: jest.fn(async () => ({
    items: [],
    pagination: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
  })),
  loginWithPassword: jest.fn(),
  loginWithVerificationCode: jest.fn(),
  sendVerificationCode: jest.fn(),
  setCurrentUserPassword: jest.fn(),
  toggleCurrentProductPause: jest.fn(),
}));

const mockedGetAuthToken = jest.mocked(getAuthToken);

beforeEach(() => {
  mockedGetAuthToken.mockReturnValue('persisted-test-token');
});

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
      MockReact.useImperativeHandle(ref, () => ({}));
      return <MockView testID={props.testID ?? 'mock-lottie'} />;
    }),
  };
});

test('waits three seconds before mounting the home screen', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findByProps({ testID: 'launch-gate-screen' }),
  ).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'launch-logo' })).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'launch-planet' })).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'launch-slogan' })).toBeTruthy();
  expect(renderer!.root.findAllByProps({ testID: 'app-home' })).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(renderer!.root.findByProps({ testID: 'app-home' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-animation-screen' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-json-animation' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-acceleration-label' }).props
      .children,
  ).toBe('点击加速');
  expect(
    renderer!.root.findByProps({ testID: 'home-acceleration-time' }).props
      .children,
  ).toBe('00:00:00');
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-game-icon',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-mode-title',
    }).props.children,
  ).toBe('游戏模式');
  expect(
    renderer!.root.findAllByProps({
      testID: 'home-animation-action-bar-route',
    }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-region',
    }).props.children,
  ).toBe('中国香港');
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-switch',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-animation-action-bar' }).props
      .onPress,
  ).toEqual(expect.any(Function));
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'home-animation-action-bar' })
      .props.onPress();
  });
  // 首页横幅现在进入游戏选择页，选中的游戏 id 即加速所需的 gid。
  expect(
    renderer!.root.findByProps({ testID: 'game-selection-screen-title' }).props
      .children,
  ).toBe('选择游戏');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'game-selection-screen-back-button' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'home-menu-button' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-support-button' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-announcement-message' }).props
      .children,
  ).toBe('SEPC-V1.0.0.0.20250101版本焕新上线，丝滑交互带来全新体验~');
  expect(
    renderer!.root.findByProps({ testID: 'bottom-navigation' }),
  ).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'nav-membership' })).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'nav-boost' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'nav-boost-label' }).props.children,
  ).toBe('模式选择');
  expect(renderer!.root.findByProps({ testID: 'nav-profile' })).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-root' }).props
      .pointerEvents,
  ).toBe('auto');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-phone' }).props.children,
  ).toBe('138****8000');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-group-0' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-group-1' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-group-2' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      testID: 'side-drawer-item-account-security-title',
    }).props.children,
  ).toBe('账号与安全');
  expect(
    renderer!.root.findByProps({
      testID: 'side-drawer-item-redeem-code-title',
    }).props.children,
  ).toBe('兑换码');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-redeem-code' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'redeem-code-bottom-sheet-root' })
      .props.pointerEvents,
  ).toBe('auto');
  expect(
    renderer!.root.findByProps({
      testID: 'redeem-code-bottom-sheet-close',
    }),
  ).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'redeem-code-submit' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'redeem-code-error' }).props.children,
  ).toBe('请输入兑换码');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'redeem-code-bottom-sheet-scrim' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'redeem-code-bottom-sheet-root' })
      .props.pointerEvents,
  ).toBe('none');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-account-security' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'account-security-screen-title' })
      .props.children,
  ).toBe('账号与安全');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-root' }).props
      .pointerEvents,
  ).toBe('none');
  expect(
    renderer!.root.findAllByProps({ testID: 'bottom-navigation' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-item-password' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'password-settings-screen' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'password-settings-screen-title' })
      .props.children,
  ).toBe('修改密码/设置密码');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'password-settings-screen-back-button' })
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-card-membership-button' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'purchase-screen' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'purchase-screen-title' }).props
      .children,
  ).toBe('购买会员');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'purchase-screen-back-button' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'account-security-screen' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-screen-back-button' })
      .props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
    renderer!.root.findByProps({ testID: 'side-drawer-scrim' }).props.onPress();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'nav-boost' }).props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'home-floating-card-lower' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-floating-card-upper' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'nav-boost-label' }).props.children,
  ).toBe('切换模式');
  // 等展开动画播完再选模式：动画进行中的点击会被 cardsAnimatingRef 守卫忽略。
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(700);
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'home-floating-card-media-option' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'home-floating-card-media-option' })
      .props.accessibilityState.checked,
  ).toBe(true);
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-media-icon',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-mode-title',
    }).props.children,
  ).toBe('回国影音模式');
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-route',
    }).props.children,
  ).toBe('智能选线');
  expect(
    renderer!.root.findAllByProps({
      testID: 'home-animation-action-bar-region',
    }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({
      testID: 'home-animation-action-bar-arrow',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'home-animation-action-bar' }).props
      .onPress,
  ).toBeUndefined();

  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(700);
  });
  // 选中模式后卡片自动收起，不需要再点一次底部按钮。
  expect(
    renderer!.root.findAllByProps({ testID: 'home-floating-card-lower' }),
  ).toHaveLength(0);
  await ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(500);
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'home-floating-card-lower' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ testID: 'nav-boost-label' }).props.children,
  ).toBe('加速');
  expect(
    renderer!.root.findByProps({ testID: 'nav-boost-icon' }).props.source.uri,
  ).toBe('NavMediaBoostIcon');

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'nav-membership' }).props.onPress();
  });

  expect(
    renderer!.root.findByProps({ testID: 'membership-screen' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'membership-screen-title' }).props
      .children,
  ).toBe('会员');
  expect(
    renderer!.root.findByProps({ testID: 'membership-screen-back-button' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'bottom-navigation' }),
  ).toHaveLength(0);
  // 二级页覆盖首页，但 Lottie 不卸载，因此播放进度与加速计时可以持续。
  expect(
    renderer!.root.findByProps({ testID: 'home-json-animation' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'membership-screen-back-button' })
      .props.onPress();
  });

  expect(renderer!.root.findByProps({ testID: 'app-home' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'bottom-navigation' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
  jest.useRealTimers();
});

test('opens the profile screen without the bottom navigation', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'nav-profile' }).props.onPress();
  });

  expect(renderer!.root.findByProps({ testID: 'profile-screen' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'profile-screen-title' }).props
      .children,
  ).toBe('我的');
  expect(
    renderer!.root.findByProps({ testID: 'account-security-card' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'account-security-list' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'bottom-navigation' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
  jest.useRealTimers();
});

test('opens login after startup when no token exists', async () => {
  jest.useFakeTimers();
  mockedGetAuthToken.mockReturnValue(undefined);
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer!.root.findByProps({ testID: 'launch-gate-screen' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(renderer!.root.findByProps({ testID: 'login-screen' })).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'bottom-navigation' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('opens order records and help support pages from the drawer', async () => {
  jest.useFakeTimers();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-orders' })
      .props.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(
    renderer!.root.findByProps({ testID: 'order-records-screen-title' }).props
      .children,
  ).toBe('订单记录');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'order-records-screen-back-button' })
      .props.onPress();
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-support' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'help-support-screen-title' }).props
      .children,
  ).toBe('帮助与客服');

  await ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});

test('opens language settings as a bottom sheet from the drawer', async () => {
  jest.useFakeTimers();
  useLocaleStore.getState().setLocale('zh-Hans');
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'home-menu-button' }).props.onPress();
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-language' })
      .props.onPress();
  });

  expect(
    renderer!.root.findByProps({ testID: 'language-bottom-sheet' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'language-bottom-sheet-title' }).props
      .children,
  ).toBe('选择语言');

  await ReactTestRenderer.act(() => renderer!.unmount());
  jest.useRealTimers();
});
