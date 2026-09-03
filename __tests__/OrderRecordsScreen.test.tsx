import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { OrderRecordsScreen } from '../src/screens/OrderRecordsScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('shows the empty-order image when there are no orders', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <OrderRecordsScreen onBack={jest.fn()} />,
    );
  });

  expect(
    renderer!.root.findByProps({ testID: 'order-records-screen-title' }).props
      .children,
  ).toBe('订单记录');
  expect(
    renderer!.root.findByProps({ testID: 'order-records-empty-image' }),
  ).toBeTruthy();

  await ReactTestRenderer.act(() => renderer!.unmount());
});

test('loads and renders orders when the page opens', async () => {
  const onLoadOrders = jest.fn(async () => ({
    items: [
      {
        trade_no: 'ORDER-001',
        out_trade_no: 'THIRD-001',
        product_id: 4,
        card_name: '海外包月会员',
        status: 1,
        status_text: '支付成功',
        money: 99,
      },
    ],
    pagination: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
  }));
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <OrderRecordsScreen onBack={jest.fn()} onLoadOrders={onLoadOrders} />,
    );
    await Promise.resolve();
  });

  expect(onLoadOrders).toHaveBeenCalledWith(1, 20);
  expect(
    renderer!.root.findByProps({ testID: 'order-records-item-ORDER-001' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findAllByProps({ testID: 'order-records-empty-image' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => renderer!.unmount());
});
