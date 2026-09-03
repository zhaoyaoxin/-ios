import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';

const launchPlanetSource = require('../../assets/launch-planet.png');
const launchSloganSource = require('../../assets/launch-slogan.png');

type LaunchGateScreenProps = {
  error: string | null;
  onRetry: () => void;
};

export function LaunchGateScreen({ error, onRetry }: LaunchGateScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();

  return (
    <View style={styles.root} testID="launch-gate-screen">
      <View pointerEvents="none" style={styles.planetContainer}>
        <Image
          accessibilityLabel="启动页星球"
          resizeMode="contain"
          source={launchPlanetSource}
          style={{
            width: design.size(369),
            height: design.size(268),
          }}
          testID="launch-planet"
        />
        <Image
          accessibilityLabel="跨越山海 光年回国"
          resizeMode="contain"
          source={launchSloganSource}
          style={[
            styles.slogan,
            {
              width: design.size(265),
              height: design.size(131),
            },
          ]}
          testID="launch-slogan"
        />
      </View>

      {error ? (
        <View style={styles.errorArea}>
          <Text
            accessibilityRole="alert"
            style={[styles.errorTitle, { fontSize: design.size(16) }]}
          >
            {t('启动失败')}
          </Text>
          <Text
            numberOfLines={3}
            style={[
              styles.errorMessage,
              {
                fontSize: design.size(12),
                lineHeight: design.size(18),
                marginTop: design.size(7),
              },
            ]}
          >
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              {
                minWidth: design.size(126),
                height: design.size(44),
                borderRadius: design.size(14),
                marginTop: design.size(16),
              },
              pressed && styles.pressed,
            ]}
            testID="startup-retry"
          >
            <Text style={[styles.retryText, { fontSize: design.size(14) }]}>
              {t('重新尝试')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Image
        accessibilityLabel="光年画面加速器"
        resizeMode="contain"
        source={{ uri: 'LaunchLogo' }}
        style={[
          styles.logo,
          {
            width: design.size(143),
            height: design.size(20),
            bottom: design.height(110),
          },
        ]}
        testID="launch-logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1F3037',
  },
  logo: {
    position: 'absolute',
    alignSelf: 'center',
  },
  planetContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slogan: {
    position: 'absolute',
  },
  errorArea: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: '#FF8795',
    fontWeight: '700',
  },
  errorMessage: {
    color: '#D5DEE4',
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  retryText: {
    color: '#1F3037',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});
