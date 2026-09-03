import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { SideDrawer } from '../src/components/SideDrawer';
import { useAuthStore } from '../src/store/authStore';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('renders built-in header and consumer content', async () => {
  useAuthStore.getState().setUser({
    phone: '13800000000',
    email: 'user@example.com',
  } as never);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  const onClose = jest.fn();
  const onItemPress = jest.fn();
  const onLogout = jest.fn();
  const onMembershipPress = jest.fn();

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SideDrawer
        items={[
          {
            id: 'example',
            title: '标题',
            content: '内容',
            onPress: onItemPress,
          },
        ]}
        open
        onClose={onClose}
        onLogout={onLogout}
        onMembershipPress={onMembershipPress}
      >
        <Text testID="custom-content">自定义内容</Text>
      </SideDrawer>,
    );
  });

  expect(renderer!.root.findByProps({ testID: 'side-drawer' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-avatar' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-phone' }).props.children,
  ).toBe('138****0000');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-close' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-banner' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      testID: 'side-drawer-banner-membership-button',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      testID: 'side-drawer-banner-description',
    }).props.children,
  ).toBe('开通 VIP 会员享超高清网络');
  expect(
    renderer!.root.findByProps({
      testID: 'side-drawer-banner-membership-button-text',
    }).props.children,
  ).toBe('购买');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'side-drawer-banner-membership-button' })
      .props.onPress();
  });
  expect(onMembershipPress).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findByProps({ testID: 'custom-content' })).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-item-example-title' })
      .props.children,
  ).toBe('标题');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-item-example-content' })
      .props.children,
  ).toBe('内容');
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-item-example-arrow' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'side-drawer-logout-text' }).props
      .children,
  ).toBe('退出登录');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'side-drawer-item-example' })
      .props.onPress();
  });
  expect(onItemPress).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'side-drawer-logout' })
      .props.onPress();
  });
  expect(onLogout).toHaveBeenCalled();

  await ReactTestRenderer.act(() => {
    renderer!.root.findByProps({ testID: 'side-drawer-close' }).props.onPress();
  });
  expect(onClose).toHaveBeenCalledTimes(2);

  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
  useAuthStore.getState().clearUser();
});
