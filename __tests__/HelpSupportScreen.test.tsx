import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { HelpSupportScreen } from '../src/screens/HelpSupportScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('renders support description and both actions', async () => {
  const onContactSupport = jest.fn();
  const onJoinGroup = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <HelpSupportScreen
        onBack={jest.fn()}
        onContactSupport={onContactSupport}
        onJoinGroup={onJoinGroup}
        onLoadCategories={async () => []}
      />,
    );
  });

  expect(
    renderer!.root.findByProps({ testID: 'help-support-description' }).props
      .children,
  ).toBe('客服工作时间段为08:30-23:00,您可以选择联系客服人员或提交问题反馈');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'help-support-contact' })
      .props.onPress();
    renderer!.root
      .findByProps({ testID: 'help-support-qq-group' })
      .props.onPress();
  });
  expect(onContactSupport).toHaveBeenCalledTimes(1);
  expect(onJoinGroup).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findByProps({ testID: 'help-support-feedback-module' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({ testID: 'help-support-feedback-title' }).props
      .children,
  ).toBe('猜你想问');
  await ReactTestRenderer.act(() => renderer!.unmount());
});

const CATEGORIES = [
  {
    id: 5,
    name: 'IOS咨询',
    slug: 'ios',
    children: [
      { id: 6, name: '二级分类1号', slug: 't_1' },
      { id: 7, name: '二级分类二号', slug: 't_2' },
    ],
  },
  { id: 8, name: '充值咨询', slug: 'pay', children: [] },
];

test('分类与问题列表来自 /ios/categories，默认选中第一个一级分类', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <HelpSupportScreen
        onBack={jest.fn()}
        onLoadCategories={async () => CATEGORIES}
      />,
    );
  });
  const root = renderer.root;

  // 一级分类做 tab，默认选中第一个
  expect(
    root.findByProps({ testID: 'help-support-category-ios' }).props
      .accessibilityState.selected,
  ).toBe(true);
  expect(
    root.findByProps({ testID: 'help-support-category-ios-indicator' }),
  ).toBeTruthy();

  // 二级分类做问题列表
  expect(
    root.findByProps({ testID: 'help-support-question-0-title' }).props
      .children,
  ).toBe('二级分类1号');
  expect(
    root.findByProps({ testID: 'help-support-question-1-title' }).props
      .children,
  ).toBe('二级分类二号');

  // 切到没有子分类的一级分类，列表显示空态
  await ReactTestRenderer.act(() => {
    root.findByProps({ testID: 'help-support-category-pay' }).props.onPress();
  });
  expect(
    root.findByProps({ testID: 'help-support-questions-empty' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('分类加载失败时给出重试入口', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  let attempts = 0;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <HelpSupportScreen
        onBack={jest.fn()}
        onLoadCategories={async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('网络不可用');
          }
          return CATEGORIES;
        }}
      />,
    );
  });
  const root = renderer.root;

  const retry = root.findByProps({ testID: 'help-support-questions-retry' });
  expect(retry).toBeTruthy();

  await ReactTestRenderer.act(() => {
    retry.props.onPress();
  });
  expect(
    root.findByProps({ testID: 'help-support-question-0-title' }).props
      .children,
  ).toBe('二级分类1号');

  await ReactTestRenderer.act(() => renderer.unmount());
});
