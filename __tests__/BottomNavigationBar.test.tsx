import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  BoostMode,
  BottomNavigationBar,
} from '../src/components/BottomNavigationBar';

const cases: Array<{
  mode: BoostMode;
  icon: string;
  label: string;
  color: string;
  borderColor: string;
}> = [
  {
    mode: 'game',
    icon: 'NavGameBoostIcon',
    label: '模式选择',
    color: '#FFBF00',
    borderColor: 'rgb(255, 223, 128)',
  },
  {
    mode: 'media',
    icon: 'NavMediaBoostIcon',
    label: '加速',
    color: '#FFBF00',
    borderColor: 'rgb(255, 223, 128)',
  },
  {
    mode: 'switch',
    icon: 'NavSwitchModeIcon',
    label: '切换模式',
    color: '#FFA01C',
    borderColor: 'rgb(255, 208, 142)',
  },
];

describe('bottom navigation boost modes', () => {
  test.each(cases)(
    'renders $mode mode',
    async ({ mode, icon, label, color, borderColor }) => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <BottomNavigationBar boostMode={mode} />,
        );
      });

      expect(
        renderer!.root.findByProps({ testID: 'nav-boost-icon' }).props.source
          .uri,
      ).toBe(icon);
      expect(
        renderer!.root.findByProps({ testID: 'nav-boost-label' }).props
          .children,
      ).toBe(label);
      expect(
        renderer!.root.findByProps({ testID: 'nav-boost-button' }).props
          .style[1].backgroundColor,
      ).toBe(color);
      expect(
        renderer!.root.findByProps({ testID: 'nav-boost-button' }).props
          .style[1].borderColor,
      ).toBe(borderColor);

      await ReactTestRenderer.act(() => renderer!.unmount());
    },
  );
});
