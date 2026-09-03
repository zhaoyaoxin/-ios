import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommonPage } from '../components/CommonPage';
import { CountryCodePicker } from '../components/CountryCodePicker';
import { COUNTRY_CODES, type CountryCode } from '../data/countryCodes';
import { useI18n } from '../i18n';
import type { VerificationAccountInput } from '../services/verificationAuthService';
import { useDesignScale } from '../utils/designScale';

const loginWelcomeAccentSource = require('../../assets/login-welcome-accent.png');
const loginTopDecorationSource = require('../../assets/login-top-decoration.png');

type LoginCredentials = {
  username: string;
  password: string;
};

type VerificationLoginCredentials = {
  account: VerificationAccountInput;
  code: string;
};

type LoginMode = 'password' | 'verification';
type AuthFlow = 'login' | 'register' | 'set-password';
type AccountType = VerificationAccountInput['type'];

type LoginScreenProps = {
  onBack: () => void;
  /** 点击《服务与隐私条款》，在应用内打开条款页。 */
  onPressAgreement?: () => void;
  onCodeLogin?: (
    credentials: VerificationLoginCredentials & { registration: boolean },
  ) => Promise<{ isNew?: boolean } | void> | { isNew?: boolean } | void;
  initialVerificationMode?: boolean;
  onLogin?: (credentials: LoginCredentials) => Promise<void> | void;
  onRegister?: () => void;
  onSendCode?: (account: VerificationAccountInput) => Promise<void> | void;
  onSetPassword?: (password: string) => Promise<void> | void;
  onVerificationLogin?: () => void;
};

/** 账号密码登录页；网络请求通过 onLogin 注入，便于后续统一保存 Token。 */
export function LoginScreen({
  onBack,
  onPressAgreement,
  onCodeLogin,
  initialVerificationMode = false,
  onLogin,
  onRegister,
  onSendCode,
  onSetPassword,
  onVerificationLogin,
}: LoginScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [accountType, setAccountType] = useState<AccountType>('phone');
  const [country, setCountry] = useState<CountryCode>(
    () => COUNTRY_CODES.find(item => item.code === '86') ?? COUNTRY_CODES[0],
  );
  const [loginMode, setLoginMode] = useState<LoginMode>(
    initialVerificationMode ? 'verification' : 'password',
  );
  const [authFlow, setAuthFlow] = useState<AuthFlow>('login');
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // 当前页面隐藏了公共标题栏，因此只需扣除安全区与顶部 20 padding，
  // 让欢迎文案在不同 iPhone 上都从设计稿顶部 137 处开始。
  const welcomeTop = Math.max(
    0,
    design.height(137) - insets.top - design.height(20),
  );
  const logoBottom = Math.max(
    0,
    design.height(110) - insets.bottom - design.height(20),
  );

  useEffect(() => {
    if (codeCountdown <= 0) {
      return;
    }
    const timeout = setTimeout(
      () => setCodeCountdown(value => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [codeCountdown]);

  const buildVerificationAccount = (): VerificationAccountInput =>
    accountType === 'phone'
      ? { type: 'phone', countryCode: country.code, phone: username.trim() }
      : { type: 'email', email: username.trim() };

  const submit = async () => {
    if (authFlow === 'register' && !agreementAccepted) {
      setError('请先阅读并同意《服务与隐私条款》');
      return;
    }
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !credential) {
      setError(
        loginMode === 'password'
          ? `请输入${accountType === 'phone' ? '手机号' : '邮箱'}和密码`
          : `请输入${accountType === 'phone' ? '手机号' : '邮箱'}和验证码`,
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (loginMode === 'password') {
        await onLogin?.({
          username:
            accountType === 'phone'
              ? `${country.display}${normalizedUsername}`
              : normalizedUsername,
          password: credential,
        });
      } else {
        const result = await onCodeLogin?.({
          account: buildVerificationAccount(),
          code: credential,
          registration: authFlow === 'register',
        });
        if (result?.isNew) {
          setAuthFlow('set-password');
          setCredential('');
          setConfirmPassword('');
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '登录失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startRegistration = () => {
    setAuthFlow('register');
    setLoginMode('verification');
    setCredential('');
    setError(null);
    onRegister?.();
  };

  const returnToLogin = () => {
    setAuthFlow('login');
    setLoginMode(initialVerificationMode ? 'verification' : 'password');
    setUsername('');
    setCredential('');
    setCodeCountdown(0);
    setAgreementAccepted(false);
    setError(null);
  };

  const submitNewPassword = async () => {
    if (!credential || !confirmPassword) {
      setError('请输入并确认新密码');
      return;
    }
    if (credential !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSetPassword?.(credential);
      setAuthFlow('login');
      setLoginMode('password');
      setUsername('');
      setCredential('');
      setConfirmPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '密码设置失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (authFlow === 'set-password') {
    return (
      <CommonPage
        backgroundDecoration={
          <Image
            accessibilityElementsHidden
            resizeMode="stretch"
            source={loginTopDecorationSource}
            style={[
              styles.topDecoration,
              { width: design.width(200), height: design.height(160) },
            ]}
          />
        }
        horizontalPadding={47}
        onBack={onBack}
        showHeader={false}
        testID="set-password-screen"
        title={t('设置密码')}
      >
        <View style={[styles.form, { marginTop: welcomeTop }]}>
          <Text style={[styles.welcomeText, { fontSize: design.size(16) }]}>
            {t('设置登录密码')}
          </Text>
          {[
            {
              id: 'new',
              label: '新密码',
              value: credential,
              set: setCredential,
            },
            {
              id: 'confirm',
              label: '确认密码',
              value: confirmPassword,
              set: setConfirmPassword,
            },
          ].map((field, index) => (
            <View
              key={field.id}
              style={{ marginTop: design.height(index ? 16 : 37) }}
            >
              <Text style={[styles.fieldLabel, { fontSize: design.size(14) }]}>
                {field.label}
              </Text>
              <View
                style={[
                  styles.credentialInputShell,
                  {
                    marginTop: design.height(14),
                    height: design.height(48),
                    borderRadius: design.size(7.2),
                    borderWidth: design.size(1),
                  },
                ]}
              >
                <TextInput
                  editable={!submitting}
                  onChangeText={field.set}
                  placeholder={t(`请输入${field.label}`)}
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  secureTextEntry
                  style={[
                    styles.credentialInput,
                    {
                      paddingHorizontal: design.width(12),
                      fontSize: design.size(15),
                    },
                  ]}
                  testID={`set-password-${field.id}-input`}
                  value={field.value}
                />
              </View>
            </View>
          ))}
          {error ? (
            <Text style={[styles.error, { marginTop: design.height(10) }]}>
              {error}
            </Text>
          ) : null}
          <Pressable
            disabled={submitting}
            onPress={submitNewPassword}
            style={[
              styles.loginButton,
              {
                marginTop: design.height(60),
                width: design.deviceWidth - design.width(94),
                height: design.height(48),
                borderRadius: design.size(7.56),
              },
            ]}
            testID="set-password-submit"
          >
            <Text style={[styles.loginText, { fontSize: design.size(16) }]}>
              {t('确认设置')}
            </Text>
          </Pressable>
        </View>
      </CommonPage>
    );
  }

  const switchLoginMode = () => {
    const nextMode: LoginMode =
      loginMode === 'password' ? 'verification' : 'password';
    setLoginMode(nextMode);
    setCredential('');
    setError(null);
    if (nextMode === 'verification') {
      onVerificationLogin?.();
    }
  };

  const switchAccountType = (nextType: AccountType) => {
    if (nextType === accountType) {
      return;
    }
    setAccountType(nextType);
    setUsername('');
    setCredential('');
    setCodeCountdown(0);
    setError(null);
  };

  const sendCode = async () => {
    if (sendingCode || codeCountdown > 0) {
      return;
    }
    if (!username.trim()) {
      setError('请先输入手机号或邮箱');
      return;
    }

    setError(null);
    setSendingCode(true);
    try {
      await onSendCode?.(buildVerificationAccount());
      setCodeCountdown(60);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '验证码发送失败，请稍后重试',
      );
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <CommonPage
      backgroundDecoration={
        <Image
          accessibilityElementsHidden
          resizeMode="stretch"
          source={loginTopDecorationSource}
          style={[
            styles.topDecoration,
            {
              width: design.width(200),
              height: design.height(160),
            },
          ]}
          testID="login-top-decoration"
        />
      }
      horizontalPadding={47}
      onBack={onBack}
      showHeader={false}
      testID="login-screen"
      title={t('登录')}
    >
      <View style={[styles.form, { marginTop: welcomeTop }]}>
        <View style={styles.welcomeContainer} testID="login-welcome">
          <Image
            accessibilityElementsHidden
            resizeMode="stretch"
            source={loginWelcomeAccentSource}
            style={[
              styles.welcomeAccent,
              {
                // 第二行“光”字前有“欢迎使用「”5 个全角字符：5 × 16 = 80。
                // top 31 让 15 高的渐变条与第二行文字底部重叠 7 个设计单位。
                left: design.size(80),
                top: design.size(31),
                width: design.width(90),
                height: design.height(15),
                borderRadius: design.size(30),
              },
            ]}
            testID="login-welcome-accent"
          />
          <Text
            style={[
              styles.welcomeText,
              { fontSize: design.size(16), lineHeight: design.size(19) },
            ]}
          >
            {t('你好，')}
          </Text>
          <Text
            style={[
              styles.welcomeText,
              { fontSize: design.size(16), lineHeight: design.size(19) },
            ]}
          >
            {t('欢迎使用「光年回国加速」')}
          </Text>
        </View>

        <View style={{ marginTop: design.height(37) }}>
          <View
            accessibilityRole="tablist"
            style={[
              styles.accountTypeTabs,
              {
                height: design.height(34),
                borderRadius: design.size(7.2),
                padding: design.size(2),
              },
            ]}
            testID="login-account-type-tabs"
          >
            {(['phone', 'email'] as const).map(type => {
              const selected = accountType === type;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={type}
                  onPress={() => switchAccountType(type)}
                  style={({ pressed }) => [
                    styles.accountTypeTab,
                    { borderRadius: design.size(6) },
                    selected && styles.accountTypeTabSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`login-account-type-${type}`}
                >
                  <Text
                    style={[
                      styles.accountTypeText,
                      { fontSize: design.size(12) },
                      selected && styles.accountTypeTextSelected,
                    ]}
                  >
                    {t(type === 'phone' ? '手机号' : '邮箱')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text
            style={[
              styles.fieldLabel,
              {
                marginTop: design.height(16),
                fontSize: design.size(14),
                lineHeight: design.size(17),
              },
            ]}
            testID="login-account-label"
          >
            {t('账号')}
          </Text>
          <View
            style={[
              styles.accountInputShell,
              {
                marginTop: design.height(14),
                height: design.height(48),
                borderRadius: design.size(7.2),
                borderWidth: design.size(1),
              },
            ]}
          >
            {accountType === 'phone' ? (
              <CountryCodePicker onChange={setCountry} value={country} />
            ) : null}
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              keyboardType={
                accountType === 'phone' ? 'phone-pad' : 'email-address'
              }
              onChangeText={setUsername}
              placeholder={t(
                accountType === 'phone' ? '请输入手机号' : '请输入邮箱',
              )}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              returnKeyType="next"
              style={[
                styles.accountInput,
                {
                  paddingHorizontal: design.width(12),
                  paddingVertical: design.height(7.2),
                  fontSize: design.size(15),
                },
              ]}
              testID="login-username-input"
              textContentType={
                accountType === 'phone' ? 'telephoneNumber' : 'emailAddress'
              }
              value={username}
            />
          </View>
          <Text
            style={[
              styles.fieldLabel,
              {
                marginTop: design.height(16),
                fontSize: design.size(14),
                lineHeight: design.size(17),
              },
            ]}
            testID="login-credential-label"
          >
            {t(loginMode === 'password' ? '密码' : '验证码')}
          </Text>
          <View
            style={[
              styles.credentialInputShell,
              {
                marginTop: design.height(14),
                height: design.height(48),
                borderRadius: design.size(7.2),
                borderWidth: design.size(1),
              },
            ]}
          >
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              keyboardType={
                loginMode === 'verification' ? 'number-pad' : 'default'
              }
              onChangeText={setCredential}
              onSubmitEditing={submit}
              placeholder={t(
                loginMode === 'password' ? '请输入密码' : '请输入验证码',
              )}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              returnKeyType="done"
              secureTextEntry={loginMode === 'password'}
              style={[
                styles.credentialInput,
                {
                  paddingHorizontal: design.width(12),
                  paddingVertical: design.height(7.2),
                  fontSize: design.size(15),
                },
              ]}
              testID={
                loginMode === 'password'
                  ? 'login-password-input'
                  : 'login-verification-input'
              }
              textContentType={
                loginMode === 'password' ? 'password' : 'oneTimeCode'
              }
              value={credential}
            />
            {loginMode === 'verification' ? (
              <Pressable
                accessibilityLabel="获取验证码"
                accessibilityRole="button"
                disabled={sendingCode || codeCountdown > 0}
                hitSlop={design.size(8)}
                onPress={sendCode}
                style={({ pressed }) => [
                  styles.sendCodeButton,
                  { marginRight: design.width(12) },
                  pressed && styles.pressed,
                ]}
                testID="login-send-code"
              >
                <Text
                  style={[
                    styles.sendCodeText,
                    {
                      fontSize: design.size(12),
                      lineHeight: design.size(14),
                    },
                  ]}
                  testID="login-send-code-text"
                >
                  {sendingCode
                    ? '发送中…'
                    : codeCountdown > 0
                    ? `${codeCountdown}s`
                    : t('获取验证码')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.messageArea, { height: design.height(60) }]}>
          {authFlow === 'login' ? (
            <Pressable
              accessibilityLabel={
                loginMode === 'password' ? '验证码登录' : '密码登录'
              }
              accessibilityRole="button"
              hitSlop={design.size(8)}
              onPress={switchLoginMode}
              style={({ pressed }) => [
                styles.verificationLoginButton,
                { top: design.height(10) },
                pressed && styles.pressed,
              ]}
              testID="login-verification-mode"
            >
              <Text
                style={[
                  styles.verificationLoginText,
                  {
                    fontSize: design.size(12),
                    lineHeight: design.size(14),
                    letterSpacing: design.size(2.4),
                  },
                ]}
              >
                {t(loginMode === 'password' ? '验证码登录' : '密码登录')}
              </Text>
            </Pressable>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { fontSize: design.size(12) }]}
              testID="login-error"
            >
              {error}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel={authFlow === 'register' ? '注册' : '登录'}
          accessibilityRole="button"
          disabled={submitting}
          onPress={submit}
          style={({ pressed }) => [
            styles.loginButton,
            {
              // 登录页左右各保留 47 个设计单位，按钮占满中间全部空间。
              width: design.deviceWidth - design.width(47) * 2,
              height: design.height(48),
              borderRadius: design.size(7.56),
              gap: design.size(8.64),
              padding: design.size(12.96),
            },
            pressed && styles.pressed,
            submitting && styles.disabled,
          ]}
          testID="login-submit"
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" style={styles.buttonContent} />
          ) : (
            <Text
              style={[
                styles.loginText,
                {
                  fontSize: design.size(16),
                  lineHeight: design.size(27),
                },
              ]}
            >
              {t(authFlow === 'register' ? '注册' : '登录')}
            </Text>
          )}
        </Pressable>
        {authFlow === 'register' ? (
          <Pressable
            accessibilityLabel="同意服务与隐私条款"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreementAccepted }}
            hitSlop={design.size(6)}
            onPress={() => setAgreementAccepted(value => !value)}
            style={[
              styles.agreementRow,
              {
                width: design.deviceWidth - design.width(47) * 2,
                marginTop: design.height(10),
                gap: design.width(6),
              },
            ]}
            testID="register-agreement"
          >
            <View
              style={[
                styles.agreementCheckbox,
                {
                  width: design.size(14),
                  height: design.size(14),
                  borderRadius: design.size(2),
                  borderWidth: design.size(1),
                },
                agreementAccepted && styles.agreementCheckboxSelected,
              ]}
              testID="register-agreement-checkbox"
            >
              {agreementAccepted ? (
                <Text
                  style={[
                    styles.agreementCheckmark,
                    { fontSize: design.size(11), lineHeight: design.size(12) },
                  ]}
                >
                  ✓
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.agreementText,
                {
                  fontSize: design.size(12),
                  lineHeight: design.size(14),
                },
              ]}
            >
              {t('我已仔细阅读并同意')}
              <Text
                accessibilityRole="link"
                onPress={onPressAgreement}
                style={styles.agreementLink}
                testID="register-agreement-link"
              >
                {t('《服务与隐私条款》')}
              </Text>
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={
            authFlow === 'register'
              ? '已有账号？开始登录'
              : '还没账号？立即注册'
          }
          accessibilityRole="button"
          hitSlop={design.size(8)}
          onPress={authFlow === 'register' ? returnToLogin : startRegistration}
          style={({ pressed }) => [
            styles.registerButton,
            { marginTop: design.height(authFlow === 'register' ? 10 : 10) },
            pressed && styles.pressed,
          ]}
          testID="login-register"
        >
          <Text
            style={[
              styles.registerText,
              {
                fontSize: design.size(12),
                lineHeight: design.size(14),
              },
            ]}
          >
            {t(
              authFlow === 'register'
                ? '已有账号？开始登录'
                : '还没账号？立即注册',
            )}
          </Text>
        </Pressable>
      </View>
      <Image
        accessibilityLabel="光年回国加速器"
        resizeMode="contain"
        source={{ uri: 'LaunchLogo' }}
        style={[
          styles.bottomLogo,
          {
            width: design.size(143),
            height: design.size(20),
            bottom: logoBottom,
          },
        ]}
        testID="login-bottom-logo"
      />
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
  },
  topDecoration: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  bottomLogo: {
    position: 'absolute',
    alignSelf: 'center',
  },
  welcomeContainer: {
    position: 'relative',
  },
  welcomeAccent: {
    position: 'absolute',
    zIndex: 0,
  },
  welcomeText: {
    zIndex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  fieldLabel: {
    color: 'rgba(255, 255, 255, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  accountTypeTabs: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  accountTypeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTypeTabSelected: {
    backgroundColor: 'rgba(255, 149, 56, 0.9)',
  },
  accountTypeText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  accountTypeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  accountInputShell: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  accountInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
  },
  credentialInputShell: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  credentialInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
  },
  sendCodeButton: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  sendCodeText: {
    color: 'rgba(255, 149, 56, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  messageArea: {
    position: 'relative',
    justifyContent: 'center',
  },
  verificationLoginButton: {
    position: 'absolute',
    right: 0,
  },
  verificationLoginText: {
    color: 'rgba(255, 133, 57, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'right',
  },
  error: {
    color: '#FF6D6F',
    fontFamily: 'PingFang SC',
  },
  loginButton: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // RN 0.86 由原生视图直接绘制渐变，不受图片固有尺寸影响。
    experimental_backgroundImage:
      'linear-gradient(135deg, #FF8F3F 0%, #FEB610 100%)',
  },
  buttonContent: {
    zIndex: 1,
  },
  loginText: {
    zIndex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '400',
  },
  registerButton: {
    alignSelf: 'center',
  },
  registerText: {
    color: 'rgba(255, 149, 56, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
    textAlign: 'center',
  },
  agreementRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  agreementCheckbox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  agreementCheckboxSelected: {
    borderColor: 'rgba(255, 149, 56, 1)',
    backgroundColor: 'rgba(255, 149, 56, 1)',
  },
  agreementCheckmark: { color: '#FFFFFF', fontWeight: '700' },
  agreementText: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
    textAlign: 'left',
  },
  agreementLink: { color: 'rgba(255, 149, 56, 1)' },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.6,
  },
});
