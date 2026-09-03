import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const DESIGN_WIDTH = 375;
export const DESIGN_HEIGHT = 812;

export type DesignScale = {
  deviceWidth: number;
  deviceHeight: number;
  widthRatio: number;
  heightRatio: number;
  uniformRatio: number;
  width: (designValue: number) => number;
  height: (designValue: number) => number;
  size: (designValue: number) => number;
};

/**
 * Converts values from the 375 x 812 design canvas into device points.
 * Positions scale on their own axis; visual sizes use the smaller ratio so
 * images, icons, radii and typography keep their original proportions.
 */
export function createDesignScale(
  deviceWidth: number,
  deviceHeight: number,
): DesignScale {
  const widthRatio = deviceWidth / DESIGN_WIDTH;
  const heightRatio = deviceHeight / DESIGN_HEIGHT;
  const uniformRatio = Math.min(widthRatio, heightRatio);

  return {
    deviceWidth,
    deviceHeight,
    widthRatio,
    heightRatio,
    uniformRatio,
    width: designValue => designValue * widthRatio,
    height: designValue => designValue * heightRatio,
    size: designValue => designValue * uniformRatio,
  };
}

export function useDesignScale(): DesignScale {
  const { width, height } = useWindowDimensions();

  return useMemo(() => createDesignScale(width, height), [height, width]);
}
