import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n';
import { useDesignScale } from '../utils/designScale';
import { ThemeAlertDialog } from './ThemeAlertDialog';

const cardBackgroundSource = require('../../assets/drawer-banner.png');
const vipIconSource = require('../../assets/vip-card-icon.png');

const normalizeSeconds = (value: number) =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

const formatMonthlyRemaining = (value: number) => {
  const seconds = normalizeSeconds(value);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `剩余有效期：${days} 天 ${hours} 时 ${minutes} 分`;
};

const formatPausableRemaining = (value: number) => {
  const seconds = normalizeSeconds(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `剩余有效时间 ${hours} 时 ${minutes} 分 ${seconds % 60} 秒`;
};

type MembershipCardProps = {
  width: number;
  membershipVariant?: 'monthly' | 'pausable';
  onMembershipPress?: () => void;
  onTogglePause?: (action: 'enable' | 'disable') => Promise<void>;
  style?: ViewStyle;
  testID?: string;
};

function MembershipCardComponent({
  width,
  membershipVariant,
  onMembershipPress,
  onTogglePause,
  style,
  testID = 'membership-card',
}: MembershipCardProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const user = useAuthStore(state => state.user);
  const isMember = user?.is_buy === 2;
  const expiredAt =
    user?.product_id === 2
      ? user.product_2_expired_at
      : user?.product_id === 4
      ? user.product_4_expired_at
      : null;
  const remainingHours =
    user?.product_id === 2
      ? user.product_2_hours
      : user?.product_id === 4
      ? user.product_4_hours
      : '0';
  const pauseStatus =
    user?.product_id === 2
      ? user.pause_2
      : user?.product_id === 4
      ? user.pause_4
      : undefined;
  // 默认沿用原来的自动判断；“我的”页面同时有两类权益时会明确指定卡片类型。
  const resolvedMembershipVariant =
    membershipVariant ?? (expiredAt ? 'monthly' : 'pausable');
  const membershipType =
    resolvedMembershipVariant === 'monthly' ? '包月会员' : '可暂停会员';
  const membershipAction = !isMember
    ? '购买'
    : resolvedMembershipVariant === 'monthly'
    ? '续费'
    : pauseStatus === 0
    ? '暂停'
    : '启动';
  const [now, setNow] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pausableBaseline = useMemo(
    () => ({
      capturedAt: Date.now(),
      seconds: normalizeSeconds(Number(remainingHours) * 3600),
      status: pauseStatus,
    }),
    // 暂停/启动状态改变时重建时间基准，避免恢复后把暂停期间也计算为已消耗。
    [pauseStatus, remainingHours],
  );

  useEffect(() => {
    const shouldTick =
      isMember &&
      (resolvedMembershipVariant === 'monthly' || pauseStatus === 0);
    if (!shouldTick) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isMember, pauseStatus, resolvedMembershipVariant]);

  const description = useMemo(() => {
    if (!isMember) {
      return '开通 VIP 会员享超高清网络';
    }
    if (resolvedMembershipVariant === 'monthly' && expiredAt) {
      return formatMonthlyRemaining(
        (Date.parse(expiredAt.replace(' ', 'T')) - now) / 1000,
      );
    }
    // pauseStatus === 0 表示可暂停时长正在启用，只有此时才扣减本地时间；
    // pauseStatus === 1 表示已经暂停，直接展示接口返回的剩余时长。
    const remainingSeconds =
      pauseStatus === 0
        ? pausableBaseline.seconds - (now - pausableBaseline.capturedAt) / 1000
        : pausableBaseline.seconds;
    return formatPausableRemaining(remainingSeconds);
  }, [
    expiredAt,
    isMember,
    now,
    pausableBaseline,
    pauseStatus,
    resolvedMembershipVariant,
  ]);

  const handlePress = async () => {
    if (membershipAction === '购买' || membershipAction === '续费') {
      onMembershipPress?.();
      return;
    }
    if (!onTogglePause || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onTogglePause(pauseStatus === 1 ? 'enable' : 'disable');
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const height = design.height(90);
  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          paddingVertical: design.height(19),
          paddingHorizontal: design.width(30),
        },
        style,
      ]}
      testID={testID}
    >
      <Image
        accessibilityLabel="会员卡片"
        resizeMode="stretch"
        source={cardBackgroundSource}
        style={[styles.background, { width, height }]}
      />
      <View style={styles.header}>
        <Image
          accessibilityLabel="VIP"
          resizeMode="contain"
          source={vipIconSource}
          style={{ width: design.size(24), height: design.size(24) }}
          testID={`${testID}-icon`}
        />
        <Text
          style={[
            styles.vip,
            {
              marginLeft: design.width(10),
              fontSize: design.size(20),
              lineHeight: design.size(24),
            },
          ]}
          testID={`${testID}-vip`}
        >
          VIP
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.type,
            {
              marginLeft: design.width(10),
              fontSize: design.size(12),
              lineHeight: design.size(14),
            },
          ]}
          testID={`${testID}-membership-type`}
        >
          {t(membershipType)}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.description,
          {
            marginTop: design.height(10),
            fontSize: design.size(12),
            lineHeight: design.size(14),
          },
        ]}
        testID={`${testID}-description`}
      >
        {t(description)}
      </Text>
      <Pressable
        accessibilityLabel="会员操作"
        accessibilityRole="button"
        accessibilityState={{ busy: submitting, disabled: submitting }}
        disabled={submitting}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          {
            top: design.height(19),
            right: design.width(30),
            width: design.width(68),
            height: design.height(28),
            borderWidth: design.size(1),
            borderRadius: design.size(29),
          },
          pressed && styles.pressed,
        ]}
        testID={`${testID}-membership-button`}
      >
        <Text
          numberOfLines={1}
          style={[styles.buttonText, { fontSize: design.size(14) }]}
          testID={`${testID}-membership-button-text`}
        >
          {t(membershipAction)}
        </Text>
      </Pressable>
      <ThemeAlertDialog
        message={t(errorMessage)}
        onClose={() => setErrorMessage('')}
        title={t('操作失败')}
        visible={Boolean(errorMessage)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', overflow: 'hidden' },
  background: { position: 'absolute', top: 0, left: 0 },
  header: { flexDirection: 'row', alignItems: 'center' },
  vip: {
    color: 'rgba(140, 76, 2, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '400',
  },
  type: {
    flexShrink: 1,
    color: 'rgba(140, 76, 2, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  description: {
    color: 'rgba(140, 76, 2, 0.8)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    letterSpacing: 0,
  },
  button: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  buttonText: {
    color: 'rgba(140, 76, 2, 1)',
    fontFamily: 'DingTalk JinBuTi',
    fontWeight: '400',
    textAlign: 'center',
    includeFontPadding: false,
  },
  pressed: { opacity: 0.7 },
});

export const MembershipCard = memo(MembershipCardComponent);
