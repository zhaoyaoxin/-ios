import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { AccountSecurityScreen } from '../src/screens/AccountSecurityScreen';
import { useAuthStore } from '../src/store/authStore';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('renders account summary with shared drawer assets', async () => {
  useAuthStore.getState().setUser({
    id: 6,
    is_buy: 2,
    product_id: 4,
    product_4_expired_at: '2026-09-02 15:39:31',
    phone: '13800000000',
    email: 'user@example.com',
  } as never);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  const onDeactivateAccount = jest.fn();
  const onItemPress = jest.fn();
  const onMembershipPress = jest.fn();
  const onTogglePause = jest.fn(async () => undefined);

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AccountSecurityScreen
        onBack={jest.fn()}
        onDeactivateAccount={onDeactivateAccount}
        onItemPress={onItemPress}
        onMembershipPress={onMembershipPress}
        onTogglePause={onTogglePause}
      />,
    );
  });

  expect(
    renderer!.root.findByProps({ testID: 'account-security-screen-title' })
      .props.children,
  ).toBe('账号与安全');
  expect(
    renderer!.root.findByProps({ testID: 'account-security-avatar' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'account-security-account' }).props
      .children,
  ).toBe('138****0000');
  expect(
    renderer!.root.findByProps({ testID: 'account-security-uid' }).props
      .children,
  ).toBe('UID: 6');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-membership-badge',
    }).props.accessibilityLabel,
  ).toBe('已开通会员');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-description',
    }).props.children,
  ).toMatch(/^剩余有效期：/);
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-button-text',
    }).props.children,
  ).toBe('续费');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-card-membership-button' })
      .props.onPress();
  });
  expect(onMembershipPress).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(() => {
    useAuthStore.setState(state => ({
      user: state.user ? { ...state.user, is_buy: 1 } : null,
    }));
  });
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-membership-badge',
    }).props.accessibilityLabel,
  ).toBe('未开通会员');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-description',
    }).props.children,
  ).toBe('开通 VIP 会员享超高清网络');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-button-text',
    }).props.children,
  ).toBe('购买');
  await ReactTestRenderer.act(() => {
    useAuthStore.setState(state => ({
      user: state.user
        ? {
            ...state.user,
            is_buy: 2,
            pause_4: 0,
            product_4_expired_at: null,
            product_4_hours: '1.5',
          }
        : null,
    }));
  });
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-description',
    }).props.children,
  ).toMatch(/^剩余有效时间 1 时 (29|30) 分 \d+ 秒$/);
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-button-text',
    }).props.children,
  ).toBe('暂停');
  onTogglePause.mockRejectedValueOnce(
    new Error('海外版会员未到期，不允许启动'),
  );
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'account-security-card-membership-button' })
      .props.onPress();
  });
  expect(onTogglePause).toHaveBeenLastCalledWith('disable');
  expect(
    renderer!.root.findByProps({ testID: 'theme-alert-dialog-title' }).props
      .children,
  ).toBe('操作失败');
  expect(
    renderer!.root.findByProps({ testID: 'theme-alert-dialog-message' }).props
      .children,
  ).toBe('海外版会员未到期，不允许启动');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'theme-alert-dialog-confirm' })
      .props.onPress();
  });
  await ReactTestRenderer.act(() => {
    useAuthStore.setState(state => ({
      user: state.user ? { ...state.user, pause_4: 1 } : null,
    }));
  });
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-button-text',
    }).props.children,
  ).toBe('启动');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-description',
    }).props.children,
  ).toBe('剩余有效时间 1 时 30 分 0 秒');
  expect(
    renderer!.root.findByProps({ testID: 'account-security-card' }),
  ).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'account-security-card-membership-button' })
      .props.onPress();
  });
  expect(onTogglePause).toHaveBeenLastCalledWith('enable');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-type',
    }).props.children,
  ).toBe('可暂停会员');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-item-phone-title',
    }).props.children,
  ).toBe('手机号');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-item-phone-content',
    }).props.children,
  ).toBe('138****0000');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-item-email-content',
    }).props.children,
  ).toBe('user@example.com');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-item-troubleshooting-title',
    }).props.children,
  ).toBe('故障排查');
  expect(
    renderer!.root.findByProps({ testID: 'account-security-divider-0' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'account-security-divider-1' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'account-security-divider-2' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-item-devices' })
      .props.onPress();
  });
  expect(onItemPress).toHaveBeenCalledWith('devices');

  expect(
    renderer!.root.findByProps({
      testID: 'account-security-deactivate-text',
    }).props.children,
  ).toBe('注销账号');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-security-deactivate' })
      .props.onPress();
  });
  expect(onDeactivateAccount).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => renderer!.unmount());
  useAuthStore.getState().clearUser();
});

test('renders monthly and pausable cards together when requested', async () => {
  useAuthStore.getState().setUser({
    id: 6,
    is_buy: 2,
    product_id: 4,
    pause_4: 1,
    product_4_expired_at: '2027-09-02 15:39:31',
    product_4_hours: '48',
    phone: '13800000000',
  } as never);
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AccountSecurityScreen
        onBack={jest.fn()}
        showAllMembershipCards
        title="我的"
      />,
    );
  });

  expect(
    renderer!.root.findByProps({
      testID: 'account-security-card-membership-type',
    }).props.children,
  ).toBe('包月会员');
  expect(
    renderer!.root.findByProps({
      testID: 'account-security-pausable-card-membership-type',
    }).props.children,
  ).toBe('可暂停会员');

  await ReactTestRenderer.act(() => renderer!.unmount());
  useAuthStore.getState().clearUser();
});
