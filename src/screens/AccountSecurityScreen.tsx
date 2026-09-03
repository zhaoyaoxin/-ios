import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CommonPage } from '../components/CommonPage';
import { MembershipCard } from '../components/MembershipCard';
import { useI18n } from '../i18n';
import {
  maskPhoneNumber,
  selectUserAccount,
  useAuthStore,
} from '../store/authStore';
import { useDesignScale } from '../utils/designScale';

const drawerAvatarSource = require('../../assets/drawer-avatar.png');
const membershipInactiveSource = require('../../assets/membership-inactive.png');
const membershipActiveSource = require('../../assets/membership-active.png');

const ACCOUNT_SECURITY_ITEMS = [
  { id: 'phone', title: '手机号' },
  { id: 'email', title: '电子邮箱' },
  { id: 'password', title: '登录密码' },
  { id: 'orders', title: '订单记录' },
  { id: 'faq', title: '常见问题' },
  { id: 'support', title: '联系客服' },
  { id: 'devices', title: '设备管理' },
  { id: 'troubleshooting', title: '故障排查' },
] as const;

type AccountSecurityItemId = (typeof ACCOUNT_SECURITY_ITEMS)[number]['id'];

type AccountSecurityScreenProps = {
  onBack: () => void;
  onDeactivateAccount?: () => void;
  onItemPress?: (id: AccountSecurityItemId) => void;
  onMembershipPress?: () => void;
  onTogglePause?: (action: 'enable' | 'disable') => Promise<void>;
  showAllMembershipCards?: boolean;
  testID?: string;
  title?: string;
};

/** 账号与安全页面：账号概要与侧边抽屉共用同一套头像和会员卡片资源。 */
export function AccountSecurityScreen({
  onBack,
  onDeactivateAccount,
  onItemPress,
  onMembershipPress,
  onTogglePause,
  showAllMembershipCards = false,
  testID = 'account-security-screen',
  title = '账号与安全',
}: AccountSecurityScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  // 与侧边抽屉订阅同一份 Zustand 用户数据，手机号会在选择器中统一脱敏。
  const accountLabel = useAuthStore(selectUserAccount);
  const user = useAuthStore(state => state.user);
  const userId = user?.id;
  const isMember = user?.is_buy === 2;
  const cardWidth = design.deviceWidth - design.width(40);
  const currentExpiredAt =
    user?.product_id === 2
      ? user.product_2_expired_at
      : user?.product_id === 4
      ? user.product_4_expired_at
      : null;
  const currentRemainingHours =
    user?.product_id === 2
      ? user.product_2_hours
      : user?.product_id === 4
      ? user.product_4_hours
      : '0';
  const hasMonthlyAndPausable =
    isMember && Boolean(currentExpiredAt) && Number(currentRemainingHours) > 0;
  const shouldShowBothCards = showAllMembershipCards && hasMonthlyAndPausable;
  const phone = user?.phone?.trim();
  const email = user?.email?.trim();
  const itemValues: Partial<Record<AccountSecurityItemId, string>> = {
    phone: phone ? maskPhoneNumber(phone) : t('未绑定'),
    email: email || t('未绑定'),
  };

  return (
    <CommonPage onBack={onBack} testID={testID} title={t(title)}>
      <ScrollView
        contentContainerStyle={{
          width: '100%',
          flexGrow: 1,
          alignItems: 'stretch',
          paddingBottom: design.height(20),
        }}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="account-security-scroll"
      >
        <View style={{ width: '100%', marginTop: design.height(16) }}>
          <View style={styles.accountRow} testID="account-security-user">
            <Image
              accessibilityLabel="用户头像"
              resizeMode="contain"
              source={drawerAvatarSource}
              style={{ width: design.size(50), height: design.size(50) }}
              testID="account-security-avatar"
            />
            <View
              style={[
                styles.accountDetails,
                {
                  marginLeft: design.width(20),
                },
              ]}
            >
              <View style={styles.accountLine}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.account,
                    {
                      fontSize: design.size(16),
                      lineHeight: design.size(22),
                    },
                  ]}
                  testID="account-security-account"
                >
                  {accountLabel}
                </Text>
                <Image
                  accessibilityLabel={isMember ? '已开通会员' : '未开通会员'}
                  resizeMode="contain"
                  source={
                    isMember ? membershipActiveSource : membershipInactiveSource
                  }
                  style={{
                    width: design.size(24),
                    height: design.size(24),
                    marginLeft: design.width(10),
                  }}
                  testID="account-security-membership-badge"
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.uid,
                  {
                    marginTop: design.height(8),
                    fontSize: design.size(14),
                    lineHeight: design.size(17),
                  },
                ]}
                testID="account-security-uid"
              >
                {`UID: ${userId ?? '--'}`}
              </Text>
            </View>
          </View>

          <MembershipCard
            membershipVariant={shouldShowBothCards ? 'monthly' : undefined}
            onMembershipPress={onMembershipPress}
            onTogglePause={onTogglePause}
            style={{ marginTop: design.height(20) }}
            testID="account-security-card"
            width={cardWidth}
          />
          {shouldShowBothCards ? (
            <MembershipCard
              membershipVariant="pausable"
              onMembershipPress={onMembershipPress}
              onTogglePause={onTogglePause}
              style={{ marginTop: design.height(10) }}
              testID="account-security-pausable-card"
              width={cardWidth}
            />
          ) : null}

          <View
            style={{ marginTop: design.height(30) }}
            testID="account-security-list"
          >
            {Array.from(
              { length: Math.ceil(ACCOUNT_SECURITY_ITEMS.length / 3) },
              (_, groupIndex) => (
                <React.Fragment key={`group-${groupIndex}`}>
                  <View
                    style={{ gap: design.height(10) }}
                    testID={`account-security-group-${groupIndex}`}
                  >
                    {ACCOUNT_SECURITY_ITEMS.slice(
                      groupIndex * 3,
                      groupIndex * 3 + 3,
                    ).map(item => (
                      <Pressable
                        accessibilityLabel={item.title}
                        accessibilityRole="button"
                        key={item.id}
                        onPress={() => onItemPress?.(item.id)}
                        style={({ pressed }) => [
                          styles.listItem,
                          {
                            paddingHorizontal: design.width(10),
                            paddingVertical: design.height(8),
                          },
                          pressed && styles.pressed,
                        ]}
                        testID={`account-security-item-${item.id}`}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.itemTitle,
                            {
                              fontSize: design.size(14),
                              lineHeight: design.size(17),
                            },
                          ]}
                          testID={`account-security-item-${item.id}-title`}
                        >
                          {t(item.title)}
                        </Text>
                        <View style={styles.itemTrailing}>
                          {itemValues[item.id] ? (
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.itemContent,
                                {
                                  marginRight: design.width(8),
                                  fontSize: design.size(12),
                                  lineHeight: design.size(14),
                                },
                              ]}
                              testID={`account-security-item-${item.id}-content`}
                            >
                              {itemValues[item.id]}
                            </Text>
                          ) : null}
                          <Image
                            accessibilityElementsHidden
                            resizeMode="contain"
                            source={{ uri: 'DrawerListArrow' }}
                            style={{
                              width: design.size(18),
                              height: design.size(18),
                            }}
                            testID={`account-security-item-${item.id}-arrow`}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                  {groupIndex <
                  Math.ceil(ACCOUNT_SECURITY_ITEMS.length / 3) - 1 ? (
                    <View
                      style={[
                        styles.groupDivider,
                        {
                          height: design.size(0.5),
                          marginVertical: design.height(14.75),
                        },
                      ]}
                      testID={`account-security-divider-${groupIndex}`}
                    />
                  ) : null}
                </React.Fragment>
              ),
            )}
          </View>

          <Pressable
            accessibilityLabel="注销账号"
            accessibilityRole="button"
            onPress={onDeactivateAccount}
            style={({ pressed }) => [
              styles.deactivateButton,
              {
                marginTop: design.height(30),
                width: design.width(260),
                height: design.height(48),
                borderRadius: design.size(7.56),
                padding: design.size(12.96),
                gap: design.size(8.64),
              },
              pressed && styles.pressed,
            ]}
            testID="account-security-deactivate"
          >
            <Text
              style={[
                styles.deactivateText,
                {
                  fontSize: design.size(16),
                  lineHeight: design.size(27),
                },
              ]}
              testID="account-security-deactivate-text"
            >
              {t('注销账号')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  account: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  accountDetails: {
    flex: 1,
  },
  accountLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uid: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  listItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    flexShrink: 1,
    color: 'rgba(255, 255, 255, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  itemTrailing: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 12,
  },
  itemContent: {
    flexShrink: 1,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
    textAlign: 'right',
  },
  groupDivider: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  pressed: {
    opacity: 0.7,
  },
  deactivateButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77, 105, 120, 0.9)',
  },
  deactivateText: {
    color: 'rgba(255, 71, 73, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
});
