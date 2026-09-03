import type { StartupRawResponse } from '../api/types';

type StartupResult = StartupRawResponse['result'];

/**
 * 分流方向。
 * abroad = 国内加速国外；china = 国外加速国内（回国加速走这个）。
 */
export type AccelRouteMode = 'abroad' | 'china';

/** 本产品是回国加速，默认按「国外加速国内」下发。 */
export const DEFAULT_ACCEL_ROUTE_MODE: AccelRouteMode = 'china';

/**
 * 把 /startup 的 result 翻译成原生 VPNControllerBridge.start 需要的两个 JSON。
 * 线路来自 result.config，公共规则优先来自 result.data，兼容旧 config.data。
 *
 * 两侧字段名并不一致，对应关系：
 *   game_rule[].id       → 线路 lid，同时作为规则组 rgid / line_id
 *   game_rule[].exit[]   → 线路 export[]（addr → k1name，nat → ip）
 *   game_rule[].dest[]   → 规则 list[]（host → dest_ip_domain）
 *   result.data.DNS      → dns
 *   result.data.blacklist→ black_list
 *   本地 geoip_cn.json   → white_list（字符串数组，与 black_list 同级）
 */
export function buildNativeStartPayload(
  result: StartupResult,
  accelRouteMode: AccelRouteMode = DEFAULT_ACCEL_ROUTE_MODE,
  geoIpWhiteList: readonly string[] = [],
): { pathJson: string; ruleJson: string } {
  const { config, data } = result;
  const gameRules = config?.game_rule ?? [];

  const paths = gameRules.map(rule => ({
    lid: rule.id,
    entrance: (rule.entrance ?? []).map(entrance => ({
      ip: entrance.ip,
      port: entrance.port,
    })),
    export: (rule.exit ?? []).map(exit => ({
      k1name: exit.addr,
      ip: exit.nat,
    })),
  }));

  const rules = gameRules.map(rule => ({
    rgid: rule.id,
    // 规则组与线路一一对应，显式回填 line_id 避免原生侧回退到 rgid 匹配。
    line_id: rule.id,
    offset: rule.offset,
    'flow-level': rule['flow-level'],
    list: (rule.dest ?? []).map(dest => ({
      process: dest.process,
      dest_ip_domain: [dest.host],
      port: dest.port,
      protocol: dest.protocol,
    })),
  }));

  return {
    pathJson: JSON.stringify(paths),
    ruleJson: JSON.stringify({
      rules,
      // 空数组是有效返回值，只有字段缺失时才回退旧位置或默认值。
      dns: data?.DNS ?? config?.data?.DNS ?? [],
      black_list: data?.blacklist ?? config?.data?.blacklist ?? [],
      white_list: geoIpWhiteList,
      // 新版 startup 下发的 IP / 域名规则；保留在原生规则 JSON 中，
      // 以便 iOS 隧道层按版本逐步启用，不影响旧服务端返回。
      ip_domain_white:
        data?.ip_domain_white ??
        config?.data?.ip_domain_white ??
        config?.ip_domain_white ??
        [],
      ip_domain_black:
        data?.ip_domain_black ??
        config?.data?.ip_domain_black ??
        config?.ip_domain_black ??
        [],
      accel_route_mode: accelRouteMode,
    }),
  };
}
