/** 会员套餐。价格单位为元，字符串保留服务端下发的原始精度。 */
export type MembershipPlan = {
  /** 套餐标识，下单时回传服务端 */
  id: string;
  /** 套餐名，如「包月会员」 */
  name: string;
  /** 有效期天数，用于生成权益描述 */
  durationDays: number;
  /** 展示价格，不含货币符号 */
  price: string;
};

/**
 * 占位套餐数据。
 *
 * 服务端目前没有套餐列表接口，先本地写死把页面跑通。
 * 接口就绪后只需给 MembershipPurchaseScreen 传 onLoadPlans，
 * 页面本身不用改。
 */
export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  { id: 'monthly', name: '包月会员', durationDays: 30, price: '26' },
  { id: 'quarterly', name: '包季会员', durationDays: 90, price: '69' },
  { id: 'half-year', name: '半年会员', durationDays: 180, price: '129' },
  { id: 'yearly', name: '包年会员', durationDays: 365, price: '237' },
];
