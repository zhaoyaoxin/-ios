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
import { useDesignScale } from '../utils/designScale';

type BindAccountScreenProps = {
  mode: 'phone' | 'email';
  onBack: () => void;
  onRequestPhoneTicket?: () => Promise<string>;
  onSendEmailCode?: (email: string) => Promise<void>;
  onSendPhoneCode?: (phone: string, ticket: string) => Promise<void>;
  onSubmitEmail?: (
    email: string,
    code: string,
    password: string,
  ) => Promise<void>;
  onSubmitPhone?: (phone: string, code: string) => Promise<void>;
};

/** 手机号和邮箱绑定共用页面；两种模式仅输入字段与接口不同。 */
export function BindAccountScreen({
  mode,
  onBack,
  onRequestPhoneTicket,
  onSendEmailCode,
  onSendPhoneCode,
  onSubmitEmail,
  onSubmitPhone,
}: BindAccountScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const isPhone = mode === 'phone';
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    if (sending || countdown > 0) {
      return;
    }
    const normalizedAccount = account.trim();
    if (isPhone && !/^1\d{10}$/.test(normalizedAccount)) {
      setErrorMessage('请输入正确的中国大陆手机号');
      return;
    }
    if (!isPhone && !normalizedAccount.includes('@')) {
      setErrorMessage('请输入正确的邮箱');
      return;
    }
    setSending(true);
    try {
      if (isPhone) {
        const ticket = await onRequestPhoneTicket?.();
        if (!ticket) {
          throw new Error('安全验证未完成，请重试');
        }
        await onSendPhoneCode?.(normalizedAccount, ticket);
      } else {
        await onSendEmailCode?.(normalizedAccount);
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
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      if (isPhone) {
        await onSubmitPhone?.(account.trim(), code.trim());
      } else {
        await onSubmitEmail?.(account.trim(), code.trim(), password);
      }
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : '绑定失败');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    height: design.height(48),
    borderRadius: design.size(7.2),
    paddingHorizontal: design.width(12),
    fontSize: design.size(14),
  };

  return (
    <CommonPage
      onBack={onBack}
      testID={`bind-${mode}-screen`}
      title={t(isPhone ? '绑定手机号' : '绑定邮箱')}
    >
      <View style={{ marginTop: design.height(30) }}>
        <Text style={[styles.label, { fontSize: design.size(14) }]}>
          {t(isPhone ? '手机号' : '电子邮箱')}
        </Text>
        <View style={[styles.accountRow, { marginTop: design.height(14) }]}>
          {isPhone ? (
            <View style={[styles.countryCode, inputStyle]}>
              <Text style={styles.countryCodeText}>+86</Text>
            </View>
          ) : null}
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={isPhone ? 'number-pad' : 'email-address'}
            onChangeText={setAccount}
            placeholder={t(isPhone ? '请输入手机号' : '请输入电子邮箱')}
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={[
              styles.input,
              inputStyle,
              isPhone && { marginLeft: design.width(10) },
            ]}
            testID="bind-account-input"
            value={account}
          />
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
            styles.codeInputWrap,
            inputStyle,
            { marginTop: design.height(14) },
          ]}
        >
          <TextInput
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder={t('请输入验证码')}
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.codeInput}
            testID="bind-code-input"
            value={code}
          />
          <Pressable
            disabled={sending || countdown > 0}
            onPress={sendCode}
            testID="bind-send-code"
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

        {!isPhone ? (
          <>
            <Text
              style={[
                styles.label,
                { marginTop: design.height(24), fontSize: design.size(14) },
              ]}
            >
              {t('登录密码')}
            </Text>
            <TextInput
              onChangeText={setPassword}
              placeholder={t('请输入登录密码以验证身份')}
              placeholderTextColor="rgba(255,255,255,0.45)"
              secureTextEntry
              style={[
                styles.input,
                inputStyle,
                { marginTop: design.height(14) },
              ]}
              testID="bind-password-input"
              value={password}
            />
          </>
        ) : null}

        <Pressable
          disabled={submitting}
          onPress={submit}
          style={({ pressed }) => [
            styles.submit,
            {
              height: design.height(48),
              marginTop: design.height(60),
              borderRadius: design.size(7.56),
            },
            (pressed || submitting) && styles.pressed,
          ]}
          testID="bind-submit"
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.submitText, { fontSize: design.size(16) }]}>
              {t('确认绑定')}
            </Text>
          )}
        </Pressable>
      </View>
      <ThemeAlertDialog
        message={t(errorMessage)}
        onClose={() => setErrorMessage('')}
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
  accountRow: { flexDirection: 'row', alignItems: 'center' },
  countryCode: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  countryCodeText: { color: '#FFFFFF', fontSize: 14 },
  input: {
    flex: 1,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  codeInputWrap: {
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
