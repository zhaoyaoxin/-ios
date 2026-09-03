import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '../i18n';
import { useDesignScale } from '../utils/designScale';

export type BoostMode = 'game' | 'media' | 'switch';

type BottomNavigationBarProps = {
  boostMode?: BoostMode;
  onMembershipPress?: () => void;
  onBoostPress?: () => void;
  onProfilePress?: () => void;
};

export function BottomNavigationBar({
  boostMode = 'game',
  onMembershipPress,
  onBoostPress,
  onProfilePress,
}: BottomNavigationBarProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const navHeight = design.height(60);
  const buttonSize = design.size(60);
  const iconSize = design.size(24);
  const bottomRadius = design.size(20);
  const boostProtrusion = design.height(23);
  const boostBorderWidth = design.size(3);
  const boostAppearance = {
    game: {
      icon: 'NavGameBoostIcon',
      label: t('模式选择'),
      color: '#FFBF00',
      borderColor: 'rgb(255, 223, 128)',
    },
    media: {
      icon: 'NavMediaBoostIcon',
      label: t('加速'),
      color: '#FFBF00',
      borderColor: 'rgb(255, 223, 128)',
    },
    switch: {
      icon: 'NavSwitchModeIcon',
      label: t('切换模式'),
      color: '#FFA01C',
      borderColor: 'rgb(255, 208, 142)',
    },
  }[boostMode];

  const renderItem = (
    label: string,
    icon: string,
    onPress: (() => void) | undefined,
    testID: string,
  ) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        { minWidth: design.size(36) },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Image
        resizeMode="contain"
        source={{ uri: icon }}
        style={{ width: iconSize, height: iconSize }}
      />
      <Text
        style={[
          styles.label,
          {
            marginTop: design.size(1),
            fontSize: design.size(10),
            lineHeight: design.size(12),
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { height: navHeight + boostProtrusion }]}
      testID="bottom-navigation"
    >
      <ImageBackground
        imageStyle={{
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
        }}
        resizeMode="stretch"
        source={{ uri: 'BottomNavGradient' }}
        style={[
          styles.background,
          {
            height: navHeight,
            borderBottomLeftRadius: bottomRadius,
            borderBottomRightRadius: bottomRadius,
          },
        ]}
        testID="bottom-navigation-background"
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.items,
          {
            height: navHeight,
            paddingHorizontal: design.width(50),
            paddingTop: design.height(12),
          },
        ]}
      >
        {renderItem(
          t('会员'),
          'NavMembershipIcon',
          onMembershipPress,
          'nav-membership',
        )}
        {renderItem(t('我的'), 'NavProfileIcon', onProfilePress, 'nav-profile')}
      </View>

      <Pressable
        accessibilityLabel={boostAppearance.label}
        accessibilityRole="button"
        onPress={onBoostPress}
        style={({ pressed }) => [
          styles.boostItem,
          {
            width: buttonSize,
            transform: [{ translateX: -buttonSize / 2 }],
          },
          pressed && styles.boostPressed,
        ]}
        testID="nav-boost"
      >
        <View
          style={[
            styles.boostButton,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              borderColor: boostAppearance.borderColor,
              borderWidth: boostBorderWidth,
              backgroundColor: boostAppearance.color,
              shadowOffset: { width: 0, height: design.size(4) },
              shadowRadius: design.size(10),
            },
          ]}
          testID="nav-boost-button"
        >
          <Image
            resizeMode="contain"
            source={{ uri: boostAppearance.icon }}
            style={{ width: design.size(30), height: design.size(30) }}
            testID="nav-boost-icon"
          />
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.boostLabel,
            {
              marginTop: design.height(1),
              fontSize: design.size(10),
              lineHeight: design.size(12),
            },
          ]}
          testID="nav-boost-label"
        >
          {boostAppearance.label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    zIndex: 1000,
    elevation: 1000,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#17303C',
  },
  items: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  item: {
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'normal',
    fontWeight: '400',
    textAlign: 'center',
    includeFontPadding: false,
  },
  boostItem: {
    position: 'absolute',
    left: '50%',
    top: 0,
    alignItems: 'center',
  },
  boostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#08161D',
    shadowOpacity: 0.35,
    elevation: 1001,
  },
  boostLabel: {
    width: '140%',
    color: '#FFFFFF',
    fontFamily: 'Alibaba PuHuiTi 2.0',
    fontStyle: 'normal',
    fontWeight: '400',
    textAlign: 'center',
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.7,
  },
  boostPressed: {
    opacity: 0.82,
  },
});
