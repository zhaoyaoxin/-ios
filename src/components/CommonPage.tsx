import React, { PropsWithChildren, type ReactNode, useMemo } from 'react';
import {
  Image,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useDesignScale } from '../utils/designScale';

export type CommonPageProps = PropsWithChildren<{
  backgroundDecoration?: ReactNode;
  headerTop?: number;
  horizontalPadding?: number;
  onBack: () => void;
  showHeader?: boolean;
  testID: string;
  title: string;
}>;

/**
 * 无底部导航页面共用的基础容器：统一渐变、安全区、20 边距、返回按钮和标题。
 * children 会渲染在标题栏下方，具体业务页面只负责自己的内容。
 */
export function CommonPage({
  backgroundDecoration,
  children,
  headerTop = 50,
  horizontalPadding = 20,
  onBack,
  showHeader = true,
  testID,
  title,
}: CommonPageProps) {
  const design = useDesignScale();
  const insets = useSafeAreaInsets();

  // headerTop 默认 50，按整屏顶部坐标换算 SafeAreaView 内部 padding。
  // 如果设备安全区已经超过目标位置，则从安全区起始，避免被刘海遮挡。
  const resolvedTopPadding = showHeader
    ? Math.max(0, design.height(headerTop) - insets.top)
    : design.height(20);

  const backGesture = useMemo(
    () =>
      PanResponder.create({
        // 只接管从左向右的明显横滑，避免与页面纵向滚动冲突。
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > design.size(8) && Math.abs(gesture.dy) < design.size(18),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > design.size(42) || gesture.vx > 0.5) {
            onBack();
          }
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [design, onBack],
  );

  return (
    <ImageBackground
      accessibilityLabel={`${title}页面`}
      resizeMode="stretch"
      source={{ uri: 'StartupGradient' }}
      style={styles.root}
      testID={testID}
    >
      {backgroundDecoration}

      {showHeader ? (
        <View
          {...backGesture.panHandlers}
          accessibilityLabel="向右滑动返回"
          style={[styles.backGestureTarget, { width: design.width(20) }]}
          testID={`${testID}-back-gesture`}
        />
      ) : null}

      <SafeAreaView
        style={[
          styles.safeArea,
          {
            paddingHorizontal: design.width(horizontalPadding),
            paddingTop: resolvedTopPadding,
            paddingBottom: design.height(20),
          },
        ]}
      >
        {showHeader ? (
          <View style={[styles.header, { height: design.size(44) }]}>
            <Pressable
              accessibilityLabel="返回"
              accessibilityRole="button"
              hitSlop={design.size(8)}
              onPress={onBack}
              style={({ pressed }) => [
                styles.backButton,
                {
                  width: design.size(44),
                  height: design.size(44),
                },
                pressed && styles.pressed,
              ]}
              testID={`${testID}-back-button`}
            >
              <Image
                resizeMode="contain"
                source={{ uri: 'BackIcon' }}
                style={{ width: design.size(24), height: design.size(24) }}
              />
            </Pressable>

            {/* 绝对居中使标题不受左侧返回按钮宽度影响。 */}
            <View pointerEvents="none" style={styles.titleContainer}>
              <Text
                numberOfLines={1}
                style={[styles.title, { fontSize: design.size(16) }]}
                testID={`${testID}-title`}
              >
                {title}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.body} testID={`${testID}-content`}>
          {children}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1F3037',
  },
  safeArea: {
    flex: 1,
    zIndex: 1,
  },
  header: {
    position: 'relative',
    justifyContent: 'center',
  },
  backButton: {
    zIndex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.65,
  },
  backGestureTarget: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
  },
});
