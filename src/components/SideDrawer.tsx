import React, { memo, type PropsWithChildren, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';
import { selectUserAccount, useAuthStore } from '../store/authStore';
import { MembershipCard } from './MembershipCard';

const drawerAvatarSource = require('../../assets/drawer-avatar.png');
const drawerCloseSource = require('../../assets/drawer-close.png');

export type SideDrawerItem = {
  id: string;
  title: string;
  content?: string;
  onPress?: () => void;
};

export type SideDrawerProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  width?: number;
  drawerStyle?: ViewStyle;
  testID?: string;
  items?: readonly SideDrawerItem[];
  onLogout?: () => void;
  onMembershipPress?: () => void;
  onTogglePause?: (action: 'enable' | 'disable') => Promise<void>;
}>;

/**
 * 抽屉容器：内置头像、手机号和关闭按钮头部行，其余内容由调用方传入。
 */
function SideDrawerComponent({
  open,
  onClose,
  width: requestedWidth,
  drawerStyle,
  testID = 'side-drawer',
  items = [],
  onLogout,
  onMembershipPress,
  onTogglePause,
  children,
}: SideDrawerProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  // 直接订阅 Zustand 中的账号字段，用户资料刷新后抽屉无需父组件传值即可更新。
  const accountLabel = useAuthStore(selectUserAccount);
  const drawerWidth = requestedWidth ?? design.width(300);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 210,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth - design.size(20), 0],
  });

  return (
    <View
      accessibilityViewIsModal={open}
      pointerEvents={open ? 'auto' : 'none'}
      // 抽屉和遮罩必须覆盖底部导航栏（底部导航层级为 1000）。
      style={[StyleSheet.absoluteFill, styles.root]}
      testID={`${testID}-root`}
    >
      <Animated.View
        style={[
          styles.scrim,
          {
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.7],
            }),
          },
        ]}
      >
        <Pressable
          accessibilityLabel="关闭侧边抽屉"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-scrim`}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            paddingVertical: design.height(44),
            paddingHorizontal: design.width(20),
            shadowOffset: { width: design.size(10), height: 0 },
            shadowRadius: design.size(20),
            elevation: design.size(16),
            transform: [{ translateX }],
          },
          drawerStyle,
        ]}
        testID={testID}
      >
        <View style={styles.header}>
          <Image
            accessibilityLabel="用户头像"
            resizeMode="contain"
            source={drawerAvatarSource}
            style={{
              width: design.size(36),
              height: design.size(36),
            }}
            testID={`${testID}-avatar`}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.phone,
              {
                marginLeft: design.width(20),
                fontSize: design.size(16),
                lineHeight: design.size(22),
              },
            ]}
            testID={`${testID}-phone`}
          >
            {accountLabel}
          </Text>
          <Pressable
            accessibilityLabel="关闭侧边抽屉"
            accessibilityRole="button"
            hitSlop={design.size(8)}
            onPress={onClose}
            style={({ pressed }) => [pressed && styles.pressed]}
            testID={`${testID}-close`}
          >
            <Image
              accessibilityElementsHidden
              resizeMode="contain"
              source={drawerCloseSource}
              style={{
                width: design.size(24),
                height: design.size(24),
              }}
            />
          </Pressable>
        </View>
        <MembershipCard
          onMembershipPress={onMembershipPress}
          onTogglePause={onTogglePause}
          style={{ marginTop: design.height(20) }}
          testID={`${testID}-banner`}
          width={drawerWidth - design.width(40)}
        />
        {items.length > 0 ? (
          <>
            <View
              style={{
                marginTop: design.height(20),
                gap: design.height(30),
              }}
              testID={`${testID}-list`}
            >
              {Array.from(
                { length: Math.ceil(items.length / 3) },
                (_, groupIndex) => (
                  <View
                    key={`group-${groupIndex}`}
                    style={{ gap: design.height(10) }}
                    testID={`${testID}-group-${groupIndex}`}
                  >
                    {items
                      .slice(groupIndex * 3, groupIndex * 3 + 3)
                      .map(item => (
                        <Pressable
                          accessibilityLabel={
                            item.content
                              ? `${item.title}，${item.content}`
                              : item.title
                          }
                          accessibilityRole="button"
                          key={item.id}
                          onPress={() => {
                            // 每个列表项保留自己的业务事件；点击后统一收起抽屉。
                            // 先关闭抽屉，避免业务回调耗时或抛错时界面仍被遮挡。
                            onClose();
                            item.onPress?.();
                          }}
                          style={({ pressed }) => [
                            styles.listItem,
                            {
                              paddingHorizontal: design.width(10),
                              paddingVertical: design.height(8),
                            },
                            pressed && styles.pressed,
                          ]}
                          testID={`${testID}-item-${item.id}`}
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
                            testID={`${testID}-item-${item.id}-title`}
                          >
                            {item.title}
                          </Text>
                          <View
                            style={[styles.itemRight, { gap: design.width(8) }]}
                          >
                            {item.content ? (
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.itemContent,
                                  {
                                    fontSize: design.size(12),
                                    lineHeight: design.size(14),
                                  },
                                ]}
                                testID={`${testID}-item-${item.id}-content`}
                              >
                                {item.content}
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
                              testID={`${testID}-item-${item.id}-arrow`}
                            />
                          </View>
                        </Pressable>
                      ))}
                  </View>
                ),
              )}
            </View>
            <Pressable
              accessibilityLabel="退出登录"
              accessibilityRole="button"
              onPress={onLogout}
              style={({ pressed }) => [
                styles.logoutButton,
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
              testID={`${testID}-logout`}
            >
              <Text
                style={[
                  styles.logoutText,
                  {
                    fontSize: design.size(16),
                    lineHeight: design.size(27),
                  },
                ]}
                testID={`${testID}-logout-text`}
              >
                {t('退出登录')}
              </Text>
            </Pressable>
          </>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

export const SideDrawer = memo(SideDrawerComponent);

const styles = StyleSheet.create({
  root: {
    zIndex: 2000,
    elevation: 2000,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(51, 78, 93, 0.96)',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phone: {
    flex: 1,
    color: '#FFFFFF',
    fontStyle: 'normal',
    fontWeight: '500',
    textAlign: 'left',
  },
  pressed: {
    opacity: 0.7,
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
  itemRight: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemContent: {
    flexShrink: 1,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
    textAlign: 'right',
  },
  logoutButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77, 105, 120, 0.9)',
  },
  logoutText: {
    color: 'rgba(255, 71, 73, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
});
