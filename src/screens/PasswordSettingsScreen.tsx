import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CommonPage } from '../components/CommonPage';
import { ThemeAlertDialog } from '../components/ThemeAlertDialog';
import { useI18n } from '../i18n';
import { maskPhoneNumber, useAuthStore } from '../store/authStore';
import { useDesignScale } from '../utils/designScale';

type PasswordSettingsScreenProps = {
  onBack: () => void;
  onRequestPhoneTicket?: () => Promise<string>;
  onSendEmailCode?: (email: string) => Promise<void>;
  onSendPhoneCode?: (phone: string, ticket: string) => Promise<void>;
  onSubmitEmail?: (
    email: string,
    code: string,
    password: string,
  ) => Promise<void>;
  onSubmitPhone?: (password: string) => Promise<void>;
};

/** 根据用户绑定信息自动选择手机号或邮箱验证方式的密码设置页。 */
export function PasswordSettingsScreen({
  onBack,
  onRequestPhoneTicket,
  onSendEmailCode,
  onSendPhoneCode,
  onSubmitEmail,
  onSubmitPhone,
}: PasswordSettingsScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const user = useAuthStore(state => state.user);
  const phone = user?.phone?.trim() || '';
  const email = user?.email?.trim() || '';
  // 按产品逻辑优先使用手机号，没有手机号时再使用邮箱。
  const accountType = phone ? 'phone' : email ? 'email' : null;
  const accountLabel = phone ? maskPhoneNumber(phone) : email;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    accountType ? '' : '当前账号未绑定手机号或邮箱',
  );

  useEffect(() => {
    if (countdown <= 0) {
      return undefined;
    }
    const timer = setTimeout(
      () => setCountdown(value => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendCode = async () => {
    if (!accountType || sending || countdown > 0) {
      return;
    }
    setSending(true);
    try {
      if (accountType === 'phone') {
        const ticket = await onRequestPhoneTicket?.();
        if (!ticket) {
          throw new Error('安全验证未完成，请重试');
        }
        await onSendPhoneCode?.(phone, ticket);
      } else {
        await onSendEmailCode?.(email);
      }
      setCountdown(60);
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : '验证码发送失败',
      );
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (!accountType || submitting) {
      return;
    }
    if (!code.trim()) {
      setErrorMessage('请输入验证码');
      return;
    }
    if (!password) {
      setErrorMessage('请输入新密码');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      if (accountType === 'phone') {
        // 当前手机号 set-password 接口不接收 code；验证码仍在提交前做非空校验。
        await onSubmitPhone?.(password);
      } else {
        await onSubmitEmail?.(email, code.trim(), password);
      }
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : '密码修改失败',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputSize = {
    height: design.height(48),
    borderRadius: design.size(7.2),
    paddingHorizontal: design.width(12),
    fontSize: design.size(14),
  };

  return (
    <CommonPage
      onBack={onBack}
      testID="password-settings-screen"
      title={t('修改密码/设置密码')}
    >
      {accountType ? (
        <View style={{ marginTop: design.height(30) }}>
          <Text style={[styles.label, { fontSize: design.size(14) }]}>
            {t('账号')}
          </Text>
          <View
            style={[
              styles.readonlyAccount,
              inputSize,
              { marginTop: design.height(14) },
            ]}
          >
            <Text style={styles.accountText} testID="password-account">
              {accountLabel}
            </Text>
          </View>

          <Text
            style={[
              styles.label,
              { marginTop: design.height(24), fontSize: design.size(14) },
            ]}
          >
            {t('验证码')}
          </Text>
          <View
            style={[
              styles.codeRow,
              inputSize,
              { marginTop: design.height(14) },
            ]}
          >
            <TextInput
              keyboardType="number-pad"
              onChangeText={setCode}
              placeholder={t('请输入验证码')}
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.codeInput}
              testID="password-code-input"
              value={code}
            />
            <Pressable
              disabled={sending || countdown > 0}
              onPress={sendCode}
              testID="password-send-code"
            >
              <Text style={styles.sendCodeText}>
                {sending
                  ? '发送中…'
                  : countdown > 0
                  ? `${countdown}s`
                  : t('获取验证码')}
              </Text>
            </Pressable>
          </View>

          <Text
            style={[
              styles.label,
              { marginTop: design.height(24), fontSize: design.size(14) },
            ]}
          >
            {t('新密码')}
          </Text>
          <TextInput
            onChangeText={setPassword}
            placeholder={t('请输入新密码')}
            placeholderTextColor="rgba(255,255,255,0.45)"
            secureTextEntry
            style={[styles.input, inputSize, { marginTop: design.height(14) }]}
            testID="password-new-input"
            value={password}
          />

          <Text
            style={[
              styles.label,
              { marginTop: design.height(24), fontSize: design.size(14) },
            ]}
          >
            {t('确认密码')}
          </Text>
          <TextInput
            onChangeText={setConfirmPassword}
            placeholder={t('请再次输入新密码')}
            placeholderTextColor="rgba(255,255,255,0.45)"
            secureTextEntry
            style={[styles.input, inputSize, { marginTop: design.height(14) }]}
            testID="password-confirm-input"
            value={confirmPassword}
          />

          <Pressable
            disabled={submitting}
            onPress={submit}
            style={({ pressed }) => [
              styles.submit,
              {
                height: design.height(48),
                marginTop: design.height(50),
                borderRadius: design.size(7.56),
              },
              (pressed || submitting) && styles.pressed,
            ]}
            testID="password-submit"
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.submitText, { fontSize: design.size(16) }]}>
                {t('保存新密码')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <ThemeAlertDialog
        message={t(errorMessage)}
        onClose={() => {
          setErrorMessage('');
          if (!accountType) {
            onBack();
          }
        }}
        visible={Boolean(errorMessage)}
      />
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  readonlyAccount: {
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  accountText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  input: {
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  codeInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  sendCodeText: {
    color: 'rgba(255, 149, 56, 1)',
    fontFamily: 'PingFang SC',
    fontSize: 12,
    fontWeight: '500',
  },
  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FEA51F',
    experimental_backgroundImage:
      'linear-gradient(135deg, #FF8F3F 0%, #FEB610 100%)',
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  pressed: { opacity: 0.72 },
});
