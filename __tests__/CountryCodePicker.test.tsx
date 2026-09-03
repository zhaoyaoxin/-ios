import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { CountryCodePicker } from '../src/components/CountryCodePicker';
import { COUNTRY_CODES } from '../src/data/countryCodes';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('opens the virtualized country list and selects a calling code', async () => {
  const onChange = jest.fn();
  const china = COUNTRY_CODES.find(item => item.code === '86')!;
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <CountryCodePicker onChange={onChange} value={china} />,
    );
  });

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'country-code-trigger' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ testID: 'country-code-modal' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'country-code-search' })
      .props.onChangeText('中国香港');
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'country-code-item-1' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'country-code-item-852' })
      .props.onPress();
  });
  expect(onChange).toHaveBeenCalledWith(
    COUNTRY_CODES.find(item => item.code === '852'),
  );

  await ReactTestRenderer.act(() => renderer!.unmount());
});
