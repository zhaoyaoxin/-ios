import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type AppLocale, useI18n, useLocaleStore } from '../i18n';
import { useDesignScale } from '../utils/designScale';

const closeIconSource = require('../../assets/redeem-sheet-close.png');
const languageOptions: { locale: AppLocale; label: string }[] = [
  { locale: 'zh-Hans', label: '简体中文' },
  { locale: 'zh-Hant', label: '繁體中文' },
];

type LanguageBottomSheetProps = {
  onClose: () => void;
  open: boolean;
};

/** 与兑换码面板共用视觉规范的语言选择底部抽屉。 */
export function LanguageBottomSheet({
  onClose,
  open,
}: LanguageBottomSheetProps) {
  const design = useDesignScale();
  const { locale, t } = useI18n();
  const setLocale = useLocaleStore(state => state.setLocale);
  const [pendingLocale, setPendingLocale] = useState<AppLocale>(locale);
  const sheetHeight = design.height(280);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) {
      // 每次打开都以当前已生效语言为初始选项；关闭不保存临时修改。
      setPendingLocale(locale);
    }
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 180,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [locale, open, progress]);

  const confirm = () => {
    setLocale(pendingLocale);
    onClose();
  };

  return (
    <View
      pointerEvents={open ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.root]}
      testID="language-bottom-sheet-root"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.scrim,
          {
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.45],
            }),
          },
        ]}
      >
        <Pressable
          accessibilityLabel={t('关闭语言设置')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="language-bottom-sheet-scrim"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingVertical: design.height(30),
            borderRadius: design.size(12),
            gap: design.height(20),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sheetHeight, 0],
                }),
              },
            ],
          },
        ]}
        testID="language-bottom-sheet"
      >
        <Image
          accessibilityElementsHidden
          resizeMode="stretch"
          source={{ uri: 'RedeemSheetGradient' }}
          style={[
            styles.background,
            { width: design.deviceWidth, height: sheetHeight },
          ]}
        />
        <Pressable
          accessibilityLabel={t('关闭语言设置')}
          hitSlop={design.size(12)}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            {
              top: design.height(20),
              right: design.width(20),
              width: design.size(16),
              height: design.size(16),
            },
            pressed && styles.pressed,
          ]}
          testID="language-bottom-sheet-close"
        >
          <Image source={closeIconSource} style={styles.closeIcon} />
        </Pressable>

        <Text
          style={[styles.title, { fontSize: design.size(18) }]}
          testID="language-bottom-sheet-title"
        >
          {t('选择语言')}
        </Text>

        <View style={{ width: design.deviceWidth - design.width(40) }}>
          {languageOptions.map(option => {
            const selected = pendingLocale === option.locale;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.locale}
                onPress={() => setPendingLocale(option.locale)}
                style={[styles.languageItem, { height: design.height(42) }]}
                testID={`language-sheet-option-${option.locale}`}
              >
                <Text
                  style={[styles.languageLabel, { fontSize: design.size(14) }]}
                >
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.radio,
                    {
                      width: design.size(18),
                      height: design.size(18),
                      borderRadius: design.size(9),
                    },
                    selected && styles.selectedRadio,
                  ]}
                >
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={confirm}
          style={({ pressed }) => [
            styles.confirmButton,
            {
              width: design.deviceWidth - design.width(40),
              height: design.height(44),
              borderRadius: design.size(8),
            },
            pressed && styles.pressed,
          ]}
          testID="language-bottom-sheet-confirm"
        >
          <Text style={[styles.confirmText, { fontSize: design.size(15) }]}>
            {t('确定')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 5100 },
  scrim: { backgroundColor: '#000000' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 91, 111, 0.96)',
  },
  background: { position: 'absolute', top: 0, left: 0 },
  closeButton: { position: 'absolute', zIndex: 1 },
  closeIcon: { width: '100%', height: '100%' },
  title: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  languageLabel: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  radio: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  selectedRadio: { borderColor: '#FEB50F' },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FEB50F',
  },
  confirmButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FEA51F',
    experimental_backgroundImage:
      'linear-gradient(135deg, #FF8F3F 0%, #FEB610 100%)',
  },
  confirmText: { color: '#FFFFFF', fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
