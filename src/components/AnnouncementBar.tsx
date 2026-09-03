import React from 'react';
import { Image, ImageBackground, StyleSheet, Text } from 'react-native';

import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';

type AnnouncementBarProps = {
  message?: string;
};

export function AnnouncementBar({
  message = 'SEPC-V1.0.0.0.20250101版本焕新上线，丝滑交互带来全新体验~',
}: AnnouncementBarProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const localizedMessage = t(message);
  const radius = design.size(6);

  return (
    <ImageBackground
      accessibilityLabel={t(`公告：${message}`)}
      accessibilityLiveRegion="polite"
      imageStyle={{ borderRadius: radius }}
      resizeMode="stretch"
      source={{ uri: 'AnnouncementGradient' }}
      style={[
        styles.root,
        {
          height: design.height(36),
          gap: design.width(12),
          paddingHorizontal: design.width(16),
          borderRadius: radius,
        },
      ]}
      testID="home-announcement"
    >
      {/* 公告图标放在 iOS Asset Catalog，减少 JS 图片解析并复用原生缓存。 */}
      <Image
        accessibilityElementsHidden
        resizeMode="contain"
        source={{ uri: 'AnnouncementIcon' }}
        style={{
          width: design.size(20),
          height: design.size(20),
        }}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.message,
          {
            fontSize: design.size(12),
            lineHeight: design.size(17),
          },
        ]}
        testID="home-announcement-message"
      >
        {localizedMessage}
      </Text>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    // 首页背景是平滑渐变，半透明矢量层能呈现磨砂观感，
    // 同时避免实时 blur(20px) 在动画页面上产生持续 GPU 开销。
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  message: {
    flexShrink: 1,
    color: '#FFFFFF',
    // 项目引入 Alibaba PuHuiTi 2.0 后，可在这里补充对应的 fontFamily。
    fontWeight: '500',
  },
});
