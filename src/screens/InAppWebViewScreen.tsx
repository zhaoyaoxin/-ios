import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { CommonPage } from '../components/CommonPage';
import { useI18n } from '../i18n';
import { useDesignScale } from '../utils/designScale';

type InAppWebViewScreenProps = {
  onBack: () => void;
  testID?: string;
  title: string;
  url: string;
};

/** 应用内网页容器：条款、公告等外链都在 App 内打开，不跳系统浏览器。 */
export function InAppWebViewScreen({
  onBack,
  testID = 'in-app-webview-screen',
  title,
  url,
}: InAppWebViewScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // 递增即重新挂载 WebView，用于失败后重试。
  const [reloadToken, setReloadToken] = useState(0);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setReloadToken(value => value + 1);
  };

  return (
    <CommonPage onBack={onBack} testID={testID} title={title}>
      <View style={styles.body}>
        {failed ? (
          <View style={styles.centered} testID={`${testID}-error`}>
            <Text style={[styles.hintText, { fontSize: design.size(13) }]}>
              {t('页面加载失败，请检查网络')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={({ pressed }) => [
                styles.retryButton,
                {
                  marginTop: design.height(16),
                  paddingHorizontal: design.width(24),
                  height: design.height(36),
                  borderRadius: design.size(18),
                },
                pressed && styles.pressed,
              ]}
              testID={`${testID}-retry`}
            >
              <Text style={[styles.retryText, { fontSize: design.size(13) }]}>
                {t('重新加载')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            key={reloadToken}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onLoadEnd={() => setLoading(false)}
            source={{ uri: url }}
            style={styles.webView}
            testID={`${testID}-webview`}
          />
        )}

        {loading && !failed ? (
          <View
            pointerEvents="none"
            style={styles.loadingOverlay}
            testID={`${testID}-loading`}
          >
            <ActivityIndicator color="#FFBF00" />
          </View>
        ) : null}
      </View>
    </CommonPage>
  );
}

export default InAppWebViewScreen;

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  // WebView 自带白底，与页面深色渐变冲突，这里统一透明由页面背景托底。
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFBF00',
  },
  retryText: {
    color: '#17303C',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
