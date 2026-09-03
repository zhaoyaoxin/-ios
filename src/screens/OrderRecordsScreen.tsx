import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { OrderItem, OrderListData } from '../api/types';
import { CommonPage } from '../components/CommonPage';
import { ThemeAlertDialog } from '../components/ThemeAlertDialog';
import { useI18n } from '../i18n';
import { useDesignScale } from '../utils/designScale';

const emptyOrdersSource = require('../../assets/orders-empty.png');

type OrderRecordsScreenProps = {
  onBack: () => void;
  onLoadOrders?: (page: number, size: number) => Promise<OrderListData>;
};

/** 订单记录页：进入页面自动获取第一页，并支持下拉刷新。 */
export function OrderRecordsScreen({
  onBack,
  onLoadOrders,
}: OrderRecordsScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(Boolean(onLoadOrders));
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadOrders = useCallback(
    async (refresh = false) => {
      if (!onLoadOrders) {
        setLoading(false);
        return;
      }
      refresh ? setRefreshing(true) : setLoading(true);
      try {
        const data = await onLoadOrders(1, 20);
        setOrders(data.items ?? []);
      } catch (reason) {
        setErrorMessage(
          reason instanceof Error ? reason.message : '订单列表获取失败',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onLoadOrders],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const renderOrder = ({ item }: { item: OrderItem }) => (
    <View
      style={[
        styles.orderCard,
        {
          borderRadius: design.size(10),
          paddingHorizontal: design.width(16),
          paddingVertical: design.height(14),
        },
      ]}
      testID={`order-records-item-${item.trade_no}`}
    >
      <View style={styles.orderHeader}>
        <Text
          numberOfLines={1}
          style={[styles.cardName, { fontSize: design.size(15) }]}
        >
          {t(item.card_name || '会员订单')}
        </Text>
        <Text style={[styles.status, { fontSize: design.size(12) }]}>
          {t(item.status_text || '--')}
        </Text>
      </View>
      <View style={{ marginTop: design.height(12) }}>
        <Text
          numberOfLines={1}
          style={[styles.detail, { fontSize: design.size(12) }]}
        >
          {t(`订单号：${item.trade_no || '--'}`)}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.detail,
            { marginTop: design.height(6), fontSize: design.size(12) },
          ]}
        >
          {t(`第三方订单号：${item.out_trade_no || '--'}`)}
        </Text>
      </View>
      <View style={[styles.orderFooter, { marginTop: design.height(12) }]}>
        <Text style={[styles.product, { fontSize: design.size(12) }]}>
          {t(`产品 ID：${item.product_id ?? '--'}`)}
        </Text>
        <Text style={[styles.money, { fontSize: design.size(16) }]}>
          {`¥${item.money ?? 0}`}
        </Text>
      </View>
    </View>
  );

  return (
    <CommonPage
      onBack={onBack}
      testID="order-records-screen"
      title={t('订单记录')}
    >
      {loading ? (
        <View style={styles.center} testID="order-records-loading">
          <ActivityIndicator color="#FEB610" size="large" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            {
              gap: design.height(12),
              paddingTop: design.height(20),
              paddingBottom: design.height(20),
            },
            orders.length === 0 && styles.emptyListContent,
          ]}
          data={orders}
          keyExtractor={(item, index) => item.trade_no || String(index)}
          ListEmptyComponent={
            <View style={styles.emptyContainer} testID="order-records-empty">
              <Image
                accessibilityLabel="暂无订单"
                resizeMode="contain"
                source={emptyOrdersSource}
                style={{ width: design.size(244), height: design.size(239) }}
                testID="order-records-empty-image"
              />
            </View>
          }
          onRefresh={() => loadOrders(true)}
          refreshing={refreshing}
          renderItem={renderOrder}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          testID="order-records-list"
        />
      )}

      <ThemeAlertDialog
        confirmText={t('重新加载')}
        message={t(errorMessage)}
        onClose={() => {
          setErrorMessage('');
          void loadOrders();
        }}
        title={t('加载失败')}
        visible={Boolean(errorMessage)}
      />
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, width: '100%' },
  listContent: { flexGrow: 1 },
  emptyListContent: { justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center' },
  orderCard: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(28,57,71,0.8)',
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardName: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  status: {
    marginLeft: 12,
    color: '#FEB610',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  detail: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  product: { color: 'rgba(255,255,255,0.65)' },
  money: { color: '#FFFFFF', fontWeight: '700' },
});
