export type UnknownRecord = Record<string, unknown>;

export interface ApiResponse<T = unknown> extends UnknownRecord {
  code: number;
  data: T;
  message: string;
  new_token?: string;
}

export type ClientPlatform = 'ios' | 'windows';

export interface User extends UnknownRecord {
  client_limit: number;
  country: number;
  created_at: string;
  email: string;
  expire_date: string | null;
  id: number;
  is_buy: number;
  is_global: number;
  phone: string;
  /** 当前产品：2 国内，4 海外。 */
  product_id: number;
  /** 国内产品暂停状态：0 未暂停/启用中，1 暂停。 */
  pause_2: number;
  /** 海外产品暂停状态：0 未暂停/启用中，1 暂停。 */
  pause_4: number;
  /** 国内可暂停产品剩余小时。 */
  product_2_hours: string;
  /** 国内包月产品到期时间。 */
  product_2_expired_at: string | null;
  /** 海外可暂停产品剩余小时。 */
  product_4_hours: string;
  /** 海外包月产品到期时间。 */
  product_4_expired_at: string | null;
  traffic: string;
  exclusive_ip?: { is_member: boolean; active_count: number };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse extends UnknownRecord {
  is_new?: boolean;
  token: string;
  token_type?: string;
  user: User;
}

export interface UserProfileResponse extends UnknownRecord {
  user: User;
  mac: string;
  platform: ClientPlatform;
}

export interface HeartbeatResponse {
  last_heartbeat: string;
  mac: string;
  speed_status: string;
  status: string;
  timestamp: number;
  user_id: number;
}

export interface ModifyPasswordRequest extends UnknownRecord {
  old_pwd: string;
  new_pwd: string;
}

export interface Banner {
  image: string;
  url: string;
}

export type Ads = Record<string, { image: string; url: string }>;

export interface ClientInitResponse {
  ip: string;
  is_overseas: boolean;
  country: string;
  province: string;
  heartbeat_interval: number;
  banners: Banner[];
  ads: Ads;
  content_md5: string;
  /**
   * 中国 IP 库（/storage/geoip_cn.json）的服务端 MD5。
   * iOS 会将这个 init 版本标识持久化到 App Group，并在下次 init 时比对。
   */
  geoip_cn_md5?: string;
  default_games: number[];
  search_default_game_ids: number[];
}

export interface ClientUpdateRequest {
  version: string;
}

export interface ClientUpdateData {
  is_update: boolean;
  is_force: boolean;
  current_version: string;
  latest_version: string;
  min_version: string;
  download_url: string;
  changelog: string;
  manual_update: boolean;
  official_site_url: string;
}

export interface ClientUpdateV3Data {
  manual_update: boolean;
  official_site_url: string;
}

export interface S3UploadCredentialRequest {
  filename: string;
  subdir?: string;
}

export interface S3UploadCredentialData extends UnknownRecord {
  upload_url: string;
  folder: string;
  headers: Record<string, string>;
}

export interface ContentItem {
  id: number;
  name: string;
  en_name: string;
  is_main: boolean;
  main_gid: number | null;
  is_hot: boolean;
  is_free: boolean;
  is_new: boolean;
  is_blockchain: boolean;
  is_video: boolean;
  news_title: string | null;
  news_url: string | null;
  alias: string;
  area: string;
  process: string | null;
  type: 'default' | string;
  img: string;
  big_img: string;
  icon: string;
  global_rules: string | null;
  free_start: string | null;
  free_end: string | null;
  created_at: string;
  updated_at: string;
  weight: number;
  translations: Record<string, { name: string; area: string | null }>;
}

export interface StartUpRequest {
  gid: number;
  manual_enterip_id?: number;
  manual_outip_id?: number;
  /** iOS 可选的 IP / 域名白名单，未指定时由服务端默认规则处理。 */
  ip_domain_white?: string[];
  /** iOS 可选的 IP / 域名黑名单，未指定时由服务端默认规则处理。 */
  ip_domain_black?: string[];
}

export interface GameRouteOptionsRequest {
  gid: number;
}

/** /startup 的公共规则数据，当前接口放在 result.data。 */
export interface StartupRuleData {
  DNS: { server: string; domain: string[] }[];
  blacklist: {
    process: string;
    host: string;
    port: string;
    protocol: string;
  }[];
  /** iOS 路由层使用的 IP / 域名白名单。 */
  ip_domain_white?: string[];
  /** iOS 路由层使用的 IP / 域名黑名单。 */
  ip_domain_black?: string[];
}

export interface StartupRawResponse {
  code: number;
  msg: string;
  result: {
    speed_id: number;
    /** 与 config 同级；旧接口可能放在 config.data。 */
    data?: StartupRuleData;
    config: {
      game_rule: StartupGameRule[];
      /** 兼容后端把白/黑名单直接放在 config 顶层的返回格式。 */
      ip_domain_white?: string[];
      ip_domain_black?: string[];
      /** 兼容旧接口，优先使用 result.data 的对应字段。 */
      data?: StartupRuleData;
    };
  };
}

export interface StartupGameRule {
  main_offset: number;
  id: number;
  offset: number;
  'flow-level': number;
  business: number;
  testping: string;
  upstream: number;
  downstream: number;
  entrance: { name: string; ip: string; port: number[]; addr: string }[];
  exit: {
    name: string;
    addr: string;
    nat: string;
    route_source: string;
    route_priority: number;
    is_preferred: boolean;
  }[];
  dest: {
    process: string;
    host: string;
    port: string;
    protocol: string;
    md5: number;
  }[];
  exit_transport: {
    outip_id: number;
    name: string;
    line_type: string;
    inbound: { auto_port: number; manual_port: number };
    s5: null;
    route_source: string;
    route_priority: number;
    is_preferred: boolean;
  }[];
  route_model?: number;
  route_rule?: { enable_dns: number; white_list: string[] };
}

export interface GameRouteOptionsData {
  game_id: number;
  entrance: GameRouteEntrance[];
  export: GameRouteExport[];
  recent_selections?: {
    enterip_id: number;
    outip_id: number;
    selected_out_ip: string;
    entrance_mode: string;
    exit_mode: string;
    started_at: string;
  }[];
}

export interface GameRouteEntrance {
  enterip_id: number;
  ip: string;
  port: number[];
  region: string;
  addr: string;
  delay_ms: number | null;
  congestion_status: string;
  congestion_label: string;
  online_count: number;
  threshold: number | null;
  load_percent: number | null;
  selectable: boolean;
  main_offset?: number;
}

export interface GameRouteExport {
  outip_id: number;
  ip: string;
  port: number[];
  inbound: { auto_port: number; manual_port: number };
  region: string;
  addr: string;
  delay_ms: number | null;
  congestion_status: string;
  congestion_label: string;
  online_count: { auto: number; manual: number; total: number };
  threshold: { auto: number; manual: number; total: number };
  load_percent: number;
  selectable: boolean;
  line_type: string;
  main_offset?: number;
  is_exclusive?: boolean;
  exclusive_ip_type_id?: number;
  exclusive_ip_type_name?: string;
  exclusive_ip_expired_at?: string;
  route_source?: string;
}

export interface SpeedReportRequest {
  speed_id: number;
  speed_test_info?: string | object;
  speed_info?: string | object;
}

export interface OrderListData {
  items: OrderItem[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

export interface OrderItem {
  trade_no: string;
  out_trade_no: string;
  product_id: number;
  card_name: string;
  status: number;
  status_text: string;
  money: number | string;
}

export interface ChangeProductTypeRequest {
  target_type: number;
}

export interface TogglePauseRequest {
  action: 'enable' | 'disable';
}

export interface ProductIdentificationRequest {
  username: string;
  id_card: string;
}

export interface ExclusiveIpSubscriptionsData {
  summary: {
    is_member: boolean;
    active_count: number;
    nearest_expired_at: string;
    nearest_remaining_days: number;
    has_expiring_soon: boolean;
    expiring_soon_days: number;
    renewal_notice: string | null;
  };
  items: {
    subscription_id: number;
    game_id: number;
    game_name: string;
    game_area: string;
    region_name: string;
    exclusive_ip_type_id: number;
    exclusive_ip_type_name: string;
    node_name: string;
    node_addr: string;
    delivery_status: 'issued' | 'pending' | string;
    expired_at: string;
    remaining_days: number;
    status: number;
    status_text: 'active' | 'expired' | string;
    can_renew: boolean;
    needs_renewal: boolean;
    renew_game_id: number;
  }[];
}

export interface ExclusiveIpType {
  id: number;
  name: string;
  remark?: string;
  prices: {
    price_id: number;
    duration_days: number;
    name: string;
    price: string;
  }[];
}

export interface ExclusiveIpPricesData {
  games: { game_id: number; ip_types: ExclusiveIpType[] }[];
  ip_types: ExclusiveIpType[];
  package_types: { name: string; label: string | null; remark: string }[];
  notices: { type: string; message: string }[];
}

export interface PayCheckData {
  trade_no: string;
  status: number;
  status_text: 'paid' | 'unpaid' | string;
  order_type: number;
  delivery_status: 'issued' | 'pending' | string;
  result_message: string;
}

export interface RedeemCardRequest {
  token: string;
  code: string;
  is_domestic: boolean;
  mac: string;
  version: string;
}

export interface RedeemCardResponse<T = unknown> extends UnknownRecord {
  code: number;
  message: string;
  data?: T;
}

/* ── iOS 端专用接口 ─────────────────────────────────────────── */

/**
 * iOS 咨询分类树（常见问题页用）。二级分类挂在 children 上。
 * slug 可作为 /api/v1/articles 的 category_slug 入参。
 */
export interface IosCategory extends UnknownRecord {
  id: number;
  name: string;
  slug: string;
  children?: IosCategory[];
}

/** iOS 游戏。id 即加速接口 StartUpRequest 需要的 gid。 */
export interface IosGame extends UnknownRecord {
  id: number;
  name: string;
  en_name: string;
  alias: string;
  area: string;
  system: string;
  type: string;
  is_main: boolean;
  main_gid: number;
  is_hot: boolean;
  is_free: boolean;
  is_new: boolean;
  is_video: boolean;
  is_blockchain: boolean;
  /**
   * 是否影音类。true 归影音模式，false / 缺失归游戏模式。
   * 后端新增字段，dev 当前样例尚未下发，故为可选。
   */
  is_media_mode?: boolean;
  img: string;
  big_img: string;
  icon: string;
  weight: number;
  platform_id: number | null;
  process: string | null;
  global_rules: string | null;
  news_title: string | null;
  news_url: string | null;
  free_start: string | null;
  free_end: string | null;
  exclusive_ip_region_id: number | null;
  /** 按 locale 覆盖 name / area。 */
  translations?: Record<string, { name?: string; area?: string }>;
}

/**
 * iOS 卡品。card_id 用于创建 Apple IAP 订单。
 *
 * 注意：dev 环境四个分桶目前都是空数组，以下字段名尚未经真实数据验证，
 * 拿到样例后需要核对。继承 UnknownRecord，多余字段不会导致类型报错。
 */
export interface IosCardProduct extends UnknownRecord {
  id?: number;
  card_id?: number;
  name?: string;
  price?: string | number;
  /** App Store Connect 里配置的 Apple Product ID。 */
  apple_product_id?: string;
}

/**
 * 卡品按产品线与计费方式分桶。
 * 后缀 2 = 国内产品，4 = 海外产品（与 User.product_id 的取值一致）。
 */
export interface IosCardProductsData extends UnknownRecord {
  month_2: IosCardProduct[];
  hour_2: IosCardProduct[];
  month_4: IosCardProduct[];
  hour_4: IosCardProduct[];
}

/** 创建 Apple IAP 未支付订单。 */
export interface AppleOrderRequest {
  card_id: number;
  version: string;
}

/** 未支付订单，拿到后交给 StoreKit 发起支付。 */
export interface AppleOrderData extends UnknownRecord {
  trade_no?: string;
  out_trade_no?: string;
  apple_product_id?: string;
}
