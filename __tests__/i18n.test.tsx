import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { LanguageBottomSheet } from '../src/components/LanguageBottomSheet';
import { toTraditionalChinese, useLocaleStore } from '../src/i18n';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('converts existing simplified Chinese UI copy to traditional Chinese', () => {
  expect(toTraditionalChinese('账号与安全')).toBe('帳號與安全');
  expect(toTraditionalChinese('订单记录')).toBe('訂單記錄');
  expect(toTraditionalChinese('获取验证码')).toBe('取得驗證碼');
});

test('applies a selected language only after confirming the bottom sheet', async () => {
  useLocaleStore.getState().setLocale('zh-Hans');
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <LanguageBottomSheet onClose={jest.fn()} open />,
    );
  });
  expect(
    renderer!.root.findByProps({ testID: 'language-bottom-sheet-title' }).props
      .children,
  ).toBe('选择语言');

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'language-sheet-option-zh-Hant' })
      .props.onPress();
  });
  expect(useLocaleStore.getState().locale).toBe('zh-Hans');
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'language-bottom-sheet-confirm' })
      .props.onPress();
  });
  expect(useLocaleStore.getState().locale).toBe('zh-Hant');
  expect(
    renderer!.root.findByProps({ testID: 'language-bottom-sheet-title' }).props
      .children,
  ).toBe('選擇語言');

  await ReactTestRenderer.act(() => renderer!.unmount());
  useLocaleStore.getState().setLocale('zh-Hans');
});
