import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CommonPage } from '../components/CommonPage';
import { MEMBERSHIP_PLANS, type MembershipPlan } from '../data/membershipPlans';
import { useI18n } from '../i18n';
import { useDesignScale } from '../utils/designScale';

type MembershipPurchaseScreenProps = {
  onBack: () => void;
  /** 套餐列表数据源。不传则用本地占位数据。 */
  onLoadPlans?: () => Promise<MembershipPlan[]>;
  /** 点击「立即支付」。返回 Promise 时按钮会保持 pending，避免重复下单。 */
  onPurchase?: (plan: MembershipPlan) => void | Promise<void>;
  testID?: string;
  title: string;
};

/** 会员购买页：展示套餐列表，选中后下单。 */
export function MembershipPurchaseScreen({
  onBack,
  onLoadPlans,
  onPurchase,
  testID = 'membership-screen',
  title,
}: MembershipPurchaseScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const [plans, setPlans] = useState<MembershipPlan[]>(
    onLoadPlans ? [] : MEMBERSHIP_PLANS,
  );
  const [loading, setLoading] = useState(Boolean(onLoadPlans));
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(MEMBERSHIP_PLANS[0]?.id ?? '');
  const [agreed, setAgreed] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!onLoadPlans) {
      return;
    }
    setLoading(true);
    try {
      const data = await onLoadPlans();
      setPlans(data);
      setSelectedId(current =>
        data.some(plan => plan.id === current) ? current : data[0]?.id ?? '',
      );
      setErrorMessage('');
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : '套餐列表获取失败',
      );
    } finally {
      setLoading(false);
    }
  }, [onLoadPlans]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selectedPlan = useMemo(
    () => plans.find(plan => plan.id === selectedId),
    [plans, selectedId],
  );

  const payDisabled = !agreed || !selectedPlan || purchasing;

  const handlePurchase = useCallback(async () => {
    if (!selectedPlan || !onPurchase) {
      return;
    }
    setPurchasing(true);
    try {
      await onPurchase(selectedPlan);
    } finally {
      setPurchasing(false);
    }
  }, [onPurchase, selectedPlan]);

  const renderPlan = (plan: MembershipPlan) => {
    const selected = plan.id === selectedId;
    return (
      <Pressable
        accessibilityLabel={`${t(plan.name)} ¥${plan.price}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        key={plan.id}
        onPress={() => setSelectedId(plan.id)}
        style={({ pressed }) => [
          styles.planCard,
          {
            marginBottom: design.height(14),
            borderRadius: design.size(12),
            borderWidth: design.size(1),
            paddingHorizontal: design.width(16),
            paddingVertical: design.height(16),
          },
          selected && styles.planCardSelected,
          pressed && styles.pressed,
        ]}
        testID={`${testID}-plan-${plan.id}`}
      >
        <View style={styles.planTopRow}>
          <Text
            numberOfLines={1}
            style={[styles.planName, { fontSize: design.size(16) }]}
          >
            {t(plan.name)}
          </Text>
          <Text style={[styles.planPrice, { fontSize: design.size(20) }]}>
            {`¥${plan.price}`}
          </Text>
        </View>
        <Text
          style={[
            styles.planSubtitle,
            { marginTop: design.height(8), fontSize: design.size(12) },
          ]}
        >
          {t(`${plan.durationDays}天会员权益`)}
        </Text>
      </Pressable>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centered} testID={`${testID}-loading`}>
          <ActivityIndicator color="#FFBF00" />
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.centered} testID={`${testID}-error`}>
          <Text style={[styles.errorText, { fontSize: design.size(13) }]}>
            {t(errorMessage)}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={{ paddingTop: design.height(16) }}
        showsVerticalScrollIndicator={false}
      >
        {plans.map(renderPlan)}
      </ScrollView>
    );
  };

  return (
    <CommonPage onBack={onBack} testID={testID} title={title}>
      {renderBody()}

      {loading || errorMessage ? null : (
        <View style={{ paddingTop: design.height(8) }}>
          <Pressable
            accessibilityLabel={t('立即支付')}
            accessibilityRole="button"
            accessibilityState={{ disabled: payDisabled }}
            disabled={payDisabled}
            onPress={handlePurchase}
            style={({ pressed }) => [
              styles.payButton,
              {
                height: design.height(48),
                borderRadius: design.size(24),
              },
              payDisabled && styles.payButtonDisabled,
              pressed && styles.pressed,
            ]}
            testID={`${testID}-pay-button`}
          >
            <Text style={[styles.payText, { fontSize: design.size(16) }]}>
              {purchasing
                ? t('支付中...')
                : selectedPlan
                ? `${t('立即支付')}  ¥${selectedPlan.price}`
                : t('立即支付')}
            </Text>
          </Pressable>

          <View
            style={[styles.agreementRow, { marginTop: design.height(12) }]}
          >
            <Pressable
              accessibilityLabel={t('我已阅读并接受会员协议')}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              hitSlop={design.size(8)}
              onPress={() => setAgreed(value => !value)}
              style={[
                styles.checkbox,
                {
                  width: design.size(16),
                  height: design.size(16),
                  borderRadius: design.size(4),
                  borderWidth: design.size(1.5),
                },
                agreed && styles.checkboxChecked,
              ]}
              testID={`${testID}-agreement-checkbox`}
            >
              {agreed ? (
                <View
                  style={[
                    styles.checkboxTick,
                    {
                      width: design.size(4),
                      height: design.size(8),
                      borderRightWidth: design.size(2),
                      borderBottomWidth: design.size(2),
                    },
                  ]}
                />
              ) : null}
            </Pressable>
            <Text
              style={[
                styles.agreementText,
                { marginLeft: design.width(6), fontSize: design.size(12) },
              ]}
            >
              {t('我已阅读并接受')}
              <Text style={styles.agreementLink}>{t('《会员协议》')}</Text>
            </Text>
          </View>
        </View>
      )}
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'transparent',
  },
  planCardSelected: {
    backgroundColor: 'rgba(255, 191, 0, 0.12)',
    borderColor: '#FFBF00',
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planName: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  planPrice: {
    color: '#FFBF00',
    fontWeight: '600',
  },
  planSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  payButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFBF00',
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payText: {
    color: '#17303C',
    fontWeight: '600',
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#FFBF00',
  },
  checkboxChecked: {
    backgroundColor: '#FFBF00',
  },
  checkboxTick: {
    borderColor: '#17303C',
    transform: [{ rotate: '45deg' }],
  },
  agreementText: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  agreementLink: {
    color: '#FFBF00',
  },
  pressed: {
    opacity: 0.7,
  },
});
