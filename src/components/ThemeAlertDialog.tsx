import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';

type ThemeAlertDialogProps = {
  cancelText?: string;
  confirmText?: string;
  message: string;
  onClose: () => void;
  /** 不传时确认按钮与原有行为一致：直接关闭弹窗。 */
  onConfirm?: () => void;
  title?: string;
  visible: boolean;
};

/**
 * 应用通用信息弹窗：统一深蓝主题、橙色强调按钮和半透明遮罩。
 * 业务组件只负责传入标题、提示内容和关闭事件。
 */
export function ThemeAlertDialog({
  cancelText,
  confirmText = '我知道了',
  message,
  onClose,
  onConfirm,
  title = '提示',
  visible,
}: ThemeAlertDialogProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const hasCancelAction = Boolean(cancelText);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.root} testID="theme-alert-dialog">
        <Pressable
          accessibilityLabel="关闭提示"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.scrim]}
          testID="theme-alert-dialog-backdrop"
        />
        <View
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={[
            styles.dialog,
            {
              width: design.width(315),
              borderRadius: design.size(16),
              borderWidth: design.size(0.8),
              paddingHorizontal: design.width(24),
              paddingTop: design.height(24),
              paddingBottom: design.height(20),
            },
          ]}
          testID="theme-alert-dialog-panel"
        >
          <View
            style={[
              styles.accent,
              {
                width: design.width(36),
                height: design.height(3),
                borderRadius: design.size(2),
              },
            ]}
          />
          <Text
            style={[
              styles.title,
              {
                marginTop: design.height(14),
                fontSize: design.size(17),
                lineHeight: design.size(22),
              },
            ]}
            testID="theme-alert-dialog-title"
          >
            {t(title)}
          </Text>
          <Text
            style={[
              styles.message,
              {
                marginTop: design.height(12),
                fontSize: design.size(14),
                lineHeight: design.size(21),
              },
            ]}
            testID="theme-alert-dialog-message"
          >
            {t(message)}
          </Text>
          <View
            style={[
              styles.actions,
              { marginTop: design.height(24), gap: design.width(12) },
            ]}
          >
            {hasCancelAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.cancelButton,
                  {
                    height: design.height(44),
                    borderRadius: design.size(8),
                  },
                  pressed && styles.pressed,
                ]}
                testID="theme-alert-dialog-cancel"
              >
                <Text
                  style={[
                    styles.cancelText,
                    {
                      fontSize: design.size(15),
                      lineHeight: design.size(20),
                    },
                  ]}
                >
                  {t(cancelText ?? '')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm ?? onClose}
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  flex: hasCancelAction ? 1 : undefined,
                  height: design.height(44),
                  borderRadius: design.size(8),
                },
                pressed && styles.pressed,
              ]}
              testID="theme-alert-dialog-confirm"
            >
              <Text
                style={[
                  styles.confirmText,
                  {
                    fontSize: design.size(15),
                    lineHeight: design.size(20),
                  },
                ]}
              >
                {t(confirmText)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scrim: { backgroundColor: 'rgba(7, 17, 22, 0.72)' },
  dialog: {
    alignItems: 'stretch',
    borderColor: 'rgba(254, 181, 15, 0.7)',
    backgroundColor: 'rgba(28, 57, 71, 0.98)',
    shadowColor: '#E99300',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 12,
  },
  accent: { alignSelf: 'center', backgroundColor: '#FEB610' },
  title: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
    textAlign: 'center',
  },
  actions: { flexDirection: 'row' },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  cancelText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'PingFang SC',
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FEA51F',
    experimental_backgroundImage:
      'linear-gradient(135deg, #FF8F3F 0%, #FEB610 100%)',
  },
  confirmText: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: { opacity: 0.78 },
});
