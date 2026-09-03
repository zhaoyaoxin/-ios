import {
  createDesignScale,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
} from '../src/utils/designScale';

test('keeps design values unchanged on the 375 x 812 canvas', () => {
  const scale = createDesignScale(DESIGN_WIDTH, DESIGN_HEIGHT);

  expect(scale.width(143)).toBe(143);
  expect(scale.height(110)).toBe(110);
  expect(scale.size(20)).toBe(20);
});

test('uses the smaller device ratio for proportional visual sizes', () => {
  const scale = createDesignScale(750, 812);

  expect(scale.widthRatio).toBe(2);
  expect(scale.heightRatio).toBe(1);
  expect(scale.size(143)).toBe(143);
  expect(scale.height(110)).toBe(110);
});
