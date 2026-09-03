import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';

const closeIconSource = require('../../assets/redeem-sheet-close.png');

type RedeemCodeBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => Promise<void>;
};

/** 口令兑换底部抽屉；内容区域预留给后续输入框和兑换操作。 */
export function RedeemCodeBottomSheet({
  open,
  onClose,
  onSubmit,
}: RedeemCodeBottomSheetProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const sheetHeight = design.height(280);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 180,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const submit = async () => {
    if (loading) {
      return;
    }
    const code = passcode.trim();
    if (!code) {
      setErrorMessage('请输入兑换码');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await onSubmit(code);
      setPasscode('');
      Alert.alert(t('兑换成功'));
      onClose();
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : '兑换失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      pointerEvents={open ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.root]}
      testID="redeem-code-bottom-sheet-root"
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
          accessibilityLabel="关闭口令兑换"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="redeem-code-bottom-sheet-scrim"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            paddingVertical: design.height(20),
            borderRadius: design.size(12),
            gap: design.height(30),
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
        testID="redeem-code-bottom-sheet"
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
          accessibilityLabel="关闭口令兑换"
          accessibilityRole="button"
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
          testID="redeem-code-bottom-sheet-close"
        >
          <Image
            accessibilityElementsHidden
            resizeMode="contain"
            source={closeIconSource}
            style={styles.closeIcon}
          />
        </Pressable>
        <Text style={[styles.title, { fontSize: design.size(18) }]}>
          {t('口令兑换')}
        </Text>
        <View style={{ width: design.width(285) }}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            onChangeText={setPasscode}
            onSubmitEditing={submit}
            placeholder={t('请输入兑换码')}
            placeholderTextColor="rgba(255,255,255,0.5)"
            returnKeyType="done"
            style={[
              styles.input,
              {
                height: design.height(48),
                borderRadius: design.size(7.2),
                paddingVertical: design.height(7.2),
                paddingHorizontal: design.width(12),
                fontSize: design.size(14),
              },
            ]}
            testID="redeem-code-input"
            value={passcode}
          />
          {errorMessage ? (
            <Text
              style={[styles.error, { marginTop: design.height(8) }]}
              testID="redeem-code-error"
            >
              {errorMessage}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={submit}
          style={({ pressed }) => [
            styles.submitButton,
            {
              width: design.deviceWidth - design.width(40),
              height: design.height(44),
              borderRadius: design.size(8),
            },
            (pressed || loading) && styles.pressed,
          ]}
          testID="redeem-code-submit"
        >
          <Text style={[styles.submitText, { fontSize: design.size(15) }]}>
            {t(loading ? '兑换中…' : '立即兑换')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 5000 },
  scrim: { backgroundColor: '#000000' },
  background: { position: 'absolute', top: 0, left: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    // 原生渐变资源尚未重新编译时使用首个渐变色兜底，避免面板透明。
    backgroundColor: 'rgba(59, 91, 111, 0.96)',
  },
  title: { color: '#FFFFFF', fontWeight: '700' },
  closeButton: { position: 'absolute', zIndex: 1 },
  closeIcon: { width: '100%', height: '100%' },
  input: {
    width: '100%',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  error: { color: '#FF4749', fontSize: 12 },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    experimental_backgroundImage:
      'linear-gradient(135deg, #FF8F3F 0%, #FEB610 100%)',
    // 不支持原生渐变时使用终点色兜底。
    backgroundColor: '#FEB610',
  },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
