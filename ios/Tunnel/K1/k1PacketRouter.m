//
//  K1PacketRouter.m
//  Gnwj
//
//  Created by Z0 on 01/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1PacketRouter.h"
#import "K1FlowGroupManager.h"
#import "K1PacketRuleManager.h"
#import "N2IPPacket.h"
#import "K1DNSServer.h"
#import "K1SocketFactory.h"
#import "Headers.h"
#include <netinet/ip.h>
#include <NetworkExtension/NetworkExtension.h>
#import <stdatomic.h>
#include <arpa/inet.h>  // 修复 inet_addr 问题

// 本地假DNS服务器地址（utun 侧劫持用，非 127.0.0.1）
#define kLocalDNSServer @"198.18.0.1"

// 中国默认DNS
#define DNS_86 @"114.114.114.114"
// 国外默认DNS
#define DNS_8888 @"8.8.8.8"

@interface K1PacketRouter ()<K1FlowGroupDelegate, K1DNSServerDelegate>

@property (nonatomic, strong) K1FlowGroupManager *flowManager;
@property (nonatomic, strong) K1PacketRuleManager *ruleManager;
@property (nonatomic, strong) K1DNSServer *dnsServer;
@property (nonatomic, strong) K1FlowGroup *randomActiveFlowGroup;
@property (nonatomic, assign) BOOL fromChina;
@property (nonatomic, strong) NSString *localDNS;
/// AccelRouteModeAbroad / AccelRouteModeChina
@property (nonatomic, copy) NSString *accelRouteMode;
@property (nonatomic, strong, readwrite) NSDictionary *mainSpeedPathInfo;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSDictionary *> *pathInfoByFlowGroupId;
@property (nonatomic, assign) int64_t cachedFlowId;
@property (nonatomic, assign) NSUInteger pendingResolveCount;
@property (nonatomic, assign) NSUInteger finishedResolveCount;

@end

@implementation K1PacketRouter {
    // 修复：使用 atomic_uint64_t 作为实例变量类型
    _Atomic(uint64_t) _RX_bytes;
    _Atomic(uint64_t) _TX_bytes;
    _Atomic(uint64_t) _RX_packets;
    _Atomic(uint64_t) _TX_packets;
}

// 修复：添加自定义getter，将atomic值转换为普通uint64_t
- (uint64_t)RX_bytes {
    return atomic_load(&_RX_bytes);
}

- (uint64_t)TX_bytes {
    return atomic_load(&_TX_bytes);
}

- (uint64_t)RX_packets {
    return atomic_load(&_RX_packets);
}

- (uint64_t)TX_packets {
    return atomic_load(&_TX_packets);
}

+ (NSString *)normalizedAccelRouteMode:(id)raw
{
    if ([raw isKindOfClass:[NSNumber class]]) {
        NSInteger v = [(NSNumber *)raw integerValue];
        if (v == 2) return AccelRouteModeChina;
        return AccelRouteModeAbroad;
    }
    if (![raw isKindOfClass:[NSString class]]) {
        return AccelRouteModeAbroad;
    }
    NSString *s = [[(NSString *)raw stringByTrimmingCharactersInSet:
                    [NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
    if (s.length == 0) {
        return AccelRouteModeAbroad;
    }
    if ([s isEqualToString:AccelRouteModeChina] ||
        [s isEqualToString:@"to_china"] ||
        [s isEqualToString:@"china_only"] ||
        [s isEqualToString:@"2"]) {
        return AccelRouteModeChina;
    }
    // abroad / 1 / 其它未知值 → 国内加速国外
    return AccelRouteModeAbroad;
}

+ (NSString *)accelRouteModeFromOptions:(NSDictionary *)options ruleDict:(NSDictionary *)ruleDict
{
    // 规则 JSON 优先，避免 providerConfiguration 中陈旧 Accel_Route_Mode 覆盖本次规则
    id raw = nil;
    if ([ruleDict isKindOfClass:[NSDictionary class]]) {
        raw = ruleDict[Accel_Route_Mode_JSON_Key];
        if (!raw || raw == [NSNull null]) {
            raw = ruleDict[Accel_Route_Mode_Key];
        }
    }
    if ((!raw || raw == [NSNull null]) && [options isKindOfClass:[NSDictionary class]]) {
        raw = options[Accel_Route_Mode_Key];
    }
    if (raw == [NSNull null]) {
        raw = nil;
    }
    return [self normalizedAccelRouteMode:raw];
}

+ (NSString *)ruleJSONStringFromOptions:(NSDictionary *)options
{
    id raw = options[Rule_Key];
    if ([raw isKindOfClass:[NSString class]]) {
        return (NSString *)raw;
    }
    if ([raw isKindOfClass:[NSDictionary class]] || [raw isKindOfClass:[NSArray class]]) {
        NSError *err = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:raw options:0 error:&err];
        if (data && !err) {
            return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        }
    }
    return nil;
}

- (instancetype)initWithOptions:(NSDictionary *)options
                         tunnel:(id)tunnel
{
    self = [super init];
    if (!self) return nil;
    
    if (![options isKindOfClass:[NSDictionary class]]) {
        LOG_ERROR(@"Missing options dictionary");
        return nil;
    }
    
    // 确保 factory 有 tunnelProvider
    K1SocketFactory *factory = [K1SocketFactory currentFactory_K1];
    if (!factory.tunnelProvider) {
            DDLogWarn(@"K1SocketFactory tunnelProvider not set. Setting now...");
            factory.tunnelProvider = tunnel;
    } else if (factory.tunnelProvider != tunnel) {
            DDLogWarn(@"K1SocketFactory has different tunnelProvider. Replacing...");
            factory.tunnelProvider = tunnel;
    }

    NSError *error = nil;
    
    //规则部分
    NSString *ruleJsonStr = [[self class] ruleJSONStringFromOptions:options];
    if (!ruleJsonStr)
    {
        LOG_ERROR(@"Missing required JSON in options");
        return nil;
    }
    else
    {
        NSLog(@"GN_Tunnel:ruleJsonStr: %@", ruleJsonStr);
    }

    // 2. 转为 NSDictionary
    error = nil;
    NSData *ruleData = [ruleJsonStr dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *ruleDict = [NSJSONSerialization JSONObjectWithData:ruleData options:0 error:&error];
    if (![ruleDict isKindOfClass:[NSDictionary class]])
    {
        LOG_ERROR(@"Invalid Rule JSON: %@", error.localizedDescription ?: @"not a dictionary");
        return nil;
    }

    self.accelRouteMode = [[self class] accelRouteModeFromOptions:options ruleDict:ruleDict];
    // abroad = 国内加速国外；china = 国外加速国内
    self.fromChina = ![self.accelRouteMode isEqualToString:AccelRouteModeChina];
    self.localDNS = self.fromChina ? DNS_86 : DNS_8888;
    DDLogInfo(@"[ROUTE MODE] accel_route_mode=%@ fromChina=%d", self.accelRouteMode, self.fromChina);
    
    //线路部分
    id pathData = options[Path_Key];
    if (!pathData || pathData == [NSNull null])
    {
        LOG_ERROR(@"Missing required pathData JSON in options");
        return nil;
    }
    // 日志输出 (区分新旧格式)
    if ([pathData isKindOfClass:[NSString class]])
    {
            NSLog(@"GN_Tunnel:pathJsonStr (OLD FORMAT): %@", pathData);
            // 检查字符串内容是否是JSON数组
            NSString *trimmed = [pathData stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            if ([trimmed hasPrefix:@"["] && [trimmed hasSuffix:@"]"])
            {
                // 尝试解析为数组
                NSData *jsonData = [pathData dataUsingEncoding:NSUTF8StringEncoding];
                id parsed = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
                if ([parsed isKindOfClass:[NSArray class]])
                {
                    pathData = parsed; // 替换为真实数组
                    DDLogInfo(@"Converted JSON string to NSArray");
                }
            }
    } else if ([pathData isKindOfClass:[NSArray class]])
    {
            NSLog(@"GN_Tunnel:pathArray (NEW FORMAT) with %lu items", (unsigned long)[pathData count]);
    }
    else
    {
            LOG_ERROR(@"Invalid Path_Key type: %@", NSStringFromClass([pathData class]));
            return nil;
    }
    
    
    NSDictionary *globalPathDict = nil;    // 旧格式: 全局配置
    NSDictionary *pathConfigMap = nil;     // 新格式: lid->config 映射
    
    if ([pathData isKindOfClass:[NSString class]])
    {
            // 旧格式: 单一JSON字符串
            error = nil;
            NSData *jsonData = [pathData dataUsingEncoding:NSUTF8StringEncoding];
            id parsedPath = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
            if (![parsedPath isKindOfClass:[NSDictionary class]])
            {
                LOG_ERROR(@"Invalid Path JSON (old format): %@", error.localizedDescription ?: @"not a dictionary");
                return nil;
            }
            globalPathDict = (NSDictionary *)parsedPath;
    }
    else
    {
        // 新格式: 路径配置数组
        NSMutableDictionary *map = [NSMutableDictionary dictionary];
        for (id rawConfig in pathData)
        {
            if (![rawConfig isKindOfClass:[NSDictionary class]]) {
                DDLogWarn(@"Skipping path config: not a dictionary");
                continue;
            }
            NSDictionary *config = (NSDictionary *)rawConfig;
            // 必须包含 lid 和必要路径字段
            id lidRaw = config[@"lid"];
            if (!lidRaw || lidRaw == [NSNull null])
            {
                DDLogWarn(@"Skipping path config: missing 'lid'");
                continue;
            }
            
            NSString *lid = [lidRaw isKindOfClass:[NSString class]]
                ? (NSString *)lidRaw
                : [NSString stringWithFormat:@"%@", lidRaw];
            if (lid.length == 0) {
                DDLogWarn(@"Skipping path config: empty 'lid'");
                continue;
            }
            
            // 检查必要路径字段
            if (![config[@"entrance"] isKindOfClass:[NSArray class]] ||
                ![config[@"export"] isKindOfClass:[NSArray class]])
            {
                DDLogWarn(@"Skipping path config for lid %@: missing entrance/export", lid);
                continue;
            }
            
            map[lid] = config;
        }
        if (map.count == 0)
        {
            LOG_ERROR(@"No valid path configurations found in array");
            return nil; // 直接失败而非继续
        }
        pathConfigMap = [map copy];
    }
    
    // 3. 手动创建 speedInfo 对象
    K1M_SPEED_START_INFO *speedInfo = [[K1M_SPEED_START_INFO alloc] init];
    
    // 4. 设置 flow_id
    NSInteger fid = [ruleDict[@"fid"] integerValue];
    speedInfo.flow_id = @(fid);
    
    // 5. DNS Rules - 修复：保留通配符
    NSMutableArray<K1M_DNS_RULE *> *dnsRules = [@[] mutableCopy];
    NSArray *dnsArray = ruleDict[@"dns"];
    if ([dnsArray isKindOfClass:[NSArray class]]) {
        for (id rawItem in dnsArray) {
            if (![rawItem isKindOfClass:[NSDictionary class]]) continue;
            NSDictionary *item = (NSDictionary *)rawItem;
            if (![item[@"server"] isKindOfClass:[NSString class]] ||
                ![item[@"domain"] isKindOfClass:[NSArray class]]) continue;

            NSString *server = [(NSString *)item[@"server"]
                stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (server.length == 0) continue;

            K1M_DNS_RULE *dnsRule = [[K1M_DNS_RULE alloc] init];
            dnsRule.server = server;
            dnsRule.traffic_id = @0;

            NSMutableArray<NSString *> *domains = [@[] mutableCopy];
            for (id rawDomain in item[@"domain"]) {
                if (![rawDomain isKindOfClass:[NSString class]]) continue;
                NSString *cleaned = [(NSString *)rawDomain
                    stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
                if (cleaned.length > 0) {
                    [domains addObject:cleaned];
                }
            }
            // 无有效域名则整条 DNS 规则丢弃
            if (domains.count == 0) continue;

            dnsRule.domain = domains;
            [dnsRules addObject:dnsRule];
        }
    }
    speedInfo.dns_rule_info = [dnsRules copy];
    
    // 6. Blacklist（兼容 port/protocol 为 number 或 array）
    NSMutableArray<K1M_TRAFFIC_RULE *> *blacklist = [@[] mutableCopy];
    NSArray *blackArray = ruleDict[@"black_list"];
    if ([blackArray isKindOfClass:[NSArray class]]) {
        for (id rawItem in blackArray) {
            if (![rawItem isKindOfClass:[NSDictionary class]]) continue;
            NSDictionary *item = (NSDictionary *)rawItem;

            NSString *process = nil;
            NSString *host = nil;
            if ([item[@"process"] isKindOfClass:[NSString class]]) {
                process = [(NSString *)item[@"process"]
                    stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            }
            if ([item[@"host"] isKindOfClass:[NSString class]]) {
                host = [(NSString *)item[@"host"]
                    stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            }
            if (!process || process.length == 0 || !host || host.length == 0) continue;

            // port / protocol：string | number | array → 统一成字符串（array 用逗号拼接协议）
            NSString *portStr = nil;
            id portVal = item[@"port"];
            if ([portVal isKindOfClass:[NSString class]]) {
                portStr = portVal;
            } else if ([portVal isKindOfClass:[NSNumber class]]) {
                portStr = [portVal stringValue];
            } else if ([portVal isKindOfClass:[NSArray class]]) {
                NSArray *ports = [self normalizeToStringArray:portVal];
                if (ports.count == 0) continue;
                // 黑名单单条 port 字段是 string；多端口拆成多条
                for (NSString *onePort in ports) {
                    NSString *protoStr = nil;
                    id protoVal = item[@"protocol"];
                    if ([protoVal isKindOfClass:[NSString class]]) {
                        protoStr = protoVal;
                    } else if ([protoVal isKindOfClass:[NSNumber class]]) {
                        protoStr = [protoVal stringValue];
                    } else if ([protoVal isKindOfClass:[NSArray class]]) {
                        protoStr = [[self normalizeToStringArray:protoVal] componentsJoinedByString:@","];
                    }
                    if (!protoStr || protoStr.length == 0) continue;

                    K1M_TRAFFIC_RULE *rule = [[K1M_TRAFFIC_RULE alloc] init];
                    rule.process = process;
                    rule.host = host;
                    rule.port = onePort;
                    rule.protocol = protoStr;
                    rule.destination_area_id = @[@(AREA_ANY_RULE)];
                    rule.destination_isp_id = @[@(ISP_ANY_RULE)];
                    rule.traffic_id = @(-1);
                    [blacklist addObject:rule];
                }
                continue;
            }
            if (!portStr) continue;

            NSString *protoStr = nil;
            id protoVal = item[@"protocol"];
            if ([protoVal isKindOfClass:[NSString class]]) {
                protoStr = protoVal;
            } else if ([protoVal isKindOfClass:[NSNumber class]]) {
                protoStr = [protoVal stringValue];
            } else if ([protoVal isKindOfClass:[NSArray class]]) {
                protoStr = [[self normalizeToStringArray:protoVal] componentsJoinedByString:@","];
            }
            if (!protoStr || protoStr.length == 0) continue;

            K1M_TRAFFIC_RULE *rule = [[K1M_TRAFFIC_RULE alloc] init];
            rule.process = process;
            rule.host = host;
            rule.port = portStr;
            rule.protocol = protoStr;
            rule.destination_area_id = @[@(AREA_ANY_RULE)];
            rule.destination_isp_id = @[@(ISP_ANY_RULE)];
            rule.traffic_id = @(-1);
            [blacklist addObject:rule];
        }
    }
    speedInfo.blacklist = [blacklist copy];
    
    // 7. vni_array
    NSMutableArray<K1M_TRAFFIC_GROUP *> *vniArray = [@[] mutableCopy];
    NSArray *rulesGroups = ruleDict[@"rules"];
    if (![rulesGroups isKindOfClass:[NSArray class]]) {
        LOG_ERROR(@"rules field missing or not an array");
        rulesGroups = @[];
    }

    for (NSUInteger i = 0; i < rulesGroups.count; i++) {
        id rawGroup = rulesGroups[i];
        if (![rawGroup isKindOfClass:[NSDictionary class]]) {
            DDLogWarn(@"Skip non-dict rule group at index %lu", (unsigned long)i);
            continue;
        }
        NSDictionary *groupRule = (NSDictionary *)rawGroup;
        K1M_TRAFFIC_GROUP *tg = [[K1M_TRAFFIC_GROUP alloc] init];

        // 规则id 取值"rgid"
        //offset 取值"offset"   不存在或者默认为0 修复为不存在时更新为id同值
        //traffic_level 取值"flow-level"不存在或者默认为0 修复为不存在时更新为id同值
        tg.id = @([groupRule[@"rgid"] integerValue]);
        
        if(groupRule[@"offset"])
        {
            tg.offset = @([groupRule[@"offset"] integerValue]);
        }
        else
        {
            tg.offset = tg.id;
        }
        
        if(groupRule[@"flow-level"])
        {
            tg.traffic_level = @([groupRule[@"flow-level"] integerValue]);
        }
        else
        {
            tg.traffic_level = tg.id;
        }
        
        DDLogInfo(@"[rule INFO] id=%@ offset=%@, traffic_level=%@",tg.id,tg.offset,tg.traffic_level);

        // 获取对应的线路配置
        NSDictionary *currentPathConfig = nil;
        NSString *rgidStr = [NSString stringWithFormat:@"%@", groupRule[@"rgid"]];
        
        //新规则中，规则都对应了线路id
        if(groupRule[@"line_id"])
        {
            rgidStr = [NSString stringWithFormat:@"%@", groupRule[@"line_id"]];
        }
                
        if (globalPathDict)
        {
            // 旧格式: 所有规则使用同一配置
            currentPathConfig = globalPathDict;
        }
        else if (pathConfigMap)
        {
            // 新格式: 按 rgid 匹配 lid
            currentPathConfig = pathConfigMap[rgidStr];
            if (!currentPathConfig)
            {
                DDLogWarn(@"No path config found for rgid: %@", rgidStr);
                continue; // 跳过无匹配的规则组
            }
       }
       else
       {
            LOG_ERROR(@"Path config not available");
            return nil;
       }
        
        if (!currentPathConfig)
        {
            DDLogWarn(@"Missing path config for rgid: %@, skip group", rgidStr);
            continue;
        }
                
       // 获取当前规则组的路径配置
       NSArray *pathEntrances = currentPathConfig[@"entrance"];
       NSArray *pathExports = currentPathConfig[@"export"];

        // entrance
        NSMutableArray<K1M_ENTRANCE *> *entrances = [@[] mutableCopy];
        if (![pathEntrances isKindOfClass:[NSArray class]]) {
            pathEntrances = @[];
        }
        for (NSDictionary *ent in pathEntrances) {
            if (![ent isKindOfClass:[NSDictionary class]]) continue;
            if (![ent[@"ip"] isKindOfClass:[NSString class]] ||
                ![ent[@"port"] isKindOfClass:[NSArray class]]) continue;

            K1M_ENTRANCE *entrance = [[K1M_ENTRANCE alloc] init];
            entrance.ip = ent[@"ip"];
            
            // port 数组转 NSNumber[]
            NSMutableArray<NSNumber *> *ports = [@[] mutableCopy];
            for (id p in ent[@"port"]) {
                if ([p isKindOfClass:[NSNumber class]]) {
                    [ports addObject:p];
                } else if ([p isKindOfClass:[NSString class]]) {
                    [ports addObject:@([p integerValue])];
                }
            }
            if (ports.count == 0) continue;
            entrance.port = ports;
            [entrances addObject:entrance];
        }
        tg.entrance = entrances;

        // exits
        NSMutableArray<K1M_EXIT *> *exits = [@[] mutableCopy];
        if (![pathExports isKindOfClass:[NSArray class]]) {
            pathExports = @[];
        }
        for (NSDictionary *exp in pathExports) {
            if (![exp isKindOfClass:[NSDictionary class]]) continue;
            if (![exp[@"k1name"] isKindOfClass:[NSString class]] ||
                ![exp[@"ip"] isKindOfClass:[NSString class]]) continue;

            K1M_EXIT *exit = [[K1M_EXIT alloc] init];
            exit.addr = exp[@"k1name"];
            exit.nat = exp[@"ip"];
            [exits addObject:exit];
            
            NSData *idData = exit.Id;
            NSData *ipK1Data = exit.Ip_K1;
            uint32_t idU32 = exit.Id_u32;
            uint32_t ipK1U32 = exit.Ip_K1_u32;

            // 将 NSData 转为 hex string 显示
            NSString *idHex = [self hexStringFromData:idData];
            NSString *ipK1Hex = [self hexStringFromData:ipK1Data];

            DDLogInfo(@"[EXIT INFO] addr=%@, nat=%@, "
                          @"Id=%@, Ip_K1=%@, "
                          @"Id_u32=%u, Ip_K1_u32=%u",
                          exit.addr,
                          exit.nat,
                          idHex,
                          ipK1Hex,
                          idU32,
                          ipK1U32);
        }
        tg.exits = exits;

        // 无有效入口/出口则该规则组无法选路，跳过
        if (entrances.count == 0 || exits.count == 0) {
            DDLogWarn(@"Skip rule group rgid=%@: empty entrance/export", groupRule[@"rgid"]);
            continue;
        }

        // dest: 规则列表
        NSMutableArray<K1M_TRAFFIC_RULE *> *destRules = [@[] mutableCopy];
        NSArray *listArray = groupRule[@"list"];
        if (![listArray isKindOfClass:[NSArray class]]) {
            listArray = @[];
        }
        for (id rawDest in listArray) {
            if (![rawDest isKindOfClass:[NSDictionary class]]) continue;
            NSDictionary *dest = (NSDictionary *)rawDest;
            if (![dest[@"process"] isKindOfClass:[NSString class]] ||
                (![dest[@"dest_ip_domain"] isKindOfClass:[NSArray class]] &&
                 ![dest[@"dest_ip_domain"] isKindOfClass:[NSString class]]) ||
                (![dest[@"port"] isKindOfClass:[NSArray class]] &&
                 ![dest[@"port"] isKindOfClass:[NSString class]] &&
                 ![dest[@"port"] isKindOfClass:[NSNumber class]]) ||
                (![dest[@"protocol"] isKindOfClass:[NSArray class]] &&
                 ![dest[@"protocol"] isKindOfClass:[NSString class]])) continue;

            NSArray *ports = [self normalizeToStringArray:dest[@"port"]];
            NSArray *protocols = [self normalizeToStringArray:dest[@"protocol"]];
            NSArray *hosts = [self normalizeToStringArray:dest[@"dest_ip_domain"]];
            NSString *process = dest[@"process"];

            // 确保至少有一个值
            if (ports.count == 0 || protocols.count == 0 || hosts.count == 0) {
                LOG_WARN(@"Invalid rule: missing ports, protocols or hosts");
                continue;
            }

            for (NSString *port in ports) {
                for (NSString *proto in protocols) {
                    for (NSString *host in hosts) {
                        K1M_TRAFFIC_RULE *r = [[K1M_TRAFFIC_RULE alloc] init];
                        r.process = process;
                        r.host = host;
                        r.port = port;
                        r.protocol = proto;
                        r.destination_area_id = @[@(AREA_ANY_RULE)];
                        r.destination_isp_id = @[@(ISP_ANY_RULE)];
                        r.traffic_id = tg.traffic_level;//tg.id;              //id traffic_level "rgid"
                        [destRules addObject:r];
                    }
                }
            }
        }
        if (destRules.count == 0) {
            DDLogWarn(@"Skip rule group rgid=%@: empty dest rules", groupRule[@"rgid"]);
            continue;
        }
        tg.dest = destRules;
        [vniArray addObject:tg];
    }
    speedInfo.vni_array = vniArray;

    // 8. 初始化 manager
    self.flowManager = [[K1FlowGroupManager alloc] initWithSpeedInfo_AllFlowGroup:speedInfo];
    self.ruleManager = [[K1PacketRuleManager alloc] initWith_SpeedInfo:speedInfo];

    if (!self.flowManager || !self.ruleManager) {
        LOG_ERROR(@"Failed to initialize flowManager or ruleManager");
        return nil;
    }

    self.cachedFlowId = [speedInfo.flow_id longLongValue];
    self.pathInfoByFlowGroupId = [NSMutableDictionary dictionary];
    self.mainSpeedPathInfo = nil;
    
    // 初始化原子计数器
    atomic_init(&_RX_bytes, 0);
    atomic_init(&_TX_bytes, 0);
    atomic_init(&_RX_packets, 0);
    atomic_init(&_TX_packets, 0);
    
    LOG_INFO(@"K1PacketRouter initialized with %lu traffic groups", (unsigned long)vniArray.count);
    return self;
}

- (NSString *)hexStringFromData:(NSData *)data {
    if (!data || data.length == 0) {
        return @"(null)";
    }
    const unsigned char *bytes = (const unsigned char *)[data bytes];
    NSMutableString *hexString = [NSMutableString string];
    [hexString appendString:@"{"];
    for (NSUInteger i = 0; i < data.length; i++) {
        if (i > 0) [hexString appendString:@","];
        [hexString appendFormat:@"%02X", bytes[i]];
    }
    [hexString appendString:@"}"];
    return [hexString copy];
}

- (NSArray<NSString *> *)normalizeToStringArray:(id)value {
    if (!value) return @[];
    
    NSCharacterSet *ws = [NSCharacterSet whitespaceAndNewlineCharacterSet];
    NSMutableArray *result = [@[] mutableCopy];
    
    if ([value isKindOfClass:[NSArray class]]) {
        for (id item in value) {
            NSString *s = nil;
            if ([item isKindOfClass:[NSString class]]) {
                s = item;
            } else if ([item isKindOfClass:[NSNumber class]]) {
                s = [item stringValue];
            }
            if (!s) continue;
            s = [s stringByTrimmingCharactersInSet:ws];
            if (s.length == 0) continue;
            [result addObject:s];
        }
        return [result copy];
    }
    
    if ([value isKindOfClass:[NSString class]]) {
        NSString *s = [(NSString *)value stringByTrimmingCharactersInSet:ws];
        return s.length > 0 ? @[s] : @[];
    }
    
    if ([value isKindOfClass:[NSNumber class]]) {
        return @[[value stringValue]];
    }
    
    return @[];
}
/*
NS_INLINE BOOL N2UtilIsStringValid(NSString *str) {
    return str != nil && (id)str != [NSNull null] && ![str isEqualToString:@""];
}

extern BOOL N2UtilIsStringValidIPAddress(NSString *IPAddress)
{
    if (!N2UtilIsStringValid(IPAddress)) return NO;
    struct in_addr pin;
    int success = inet_aton([IPAddress UTF8String], &pin);
    if (success == 1) return TRUE;
    return NO;
}

- (NEIPv4Route *)routeWithIPString:(NSString *)ip
{
    static NSDictionary *s_maskDict = nil;
    static dispatch_once_t onceToken;
    
    dispatch_once(&onceToken, ^{
        s_maskDict = @{
                       @"32": @"255.255.255.255",
                       @"31": @"255.255.255.254",
                       @"30": @"255.255.255.252",
                       @"29": @"255.255.255.248",
                       @"28": @"255.255.255.240",
                       @"27": @"255.255.255.224",
                       @"26": @"255.255.255.192",
                       @"25": @"255.255.255.128",
                       @"24": @"255.255.255.0",
                       @"23": @"255.255.254.0",
                       @"22": @"255.255.252.0",
                       @"21": @"255.255.248.0",
                       @"20": @"255.255.240.0",
                       @"19": @"255.255.224.0",
                       @"18": @"255.255.192.0",
                       @"17": @"255.255.128.0",
                       @"16": @"255.255.0.0",
                       @"15": @"255.254.0.0",
                       @"14": @"255.252.0.0",
                       @"13": @"255.248.0.0",
                       @"12": @"255.240.0.0",
                       @"11": @"255.224.0.0",
                       @"10": @"255.192.0.0",
                       @"9":  @"255.128.0.0",
                       @"8":  @"255.0.0.0",
                       @"7":  @"254.0.0.0",
                       @"6":  @"252.0.0.0",
                       @"5":  @"248.0.0.0",
                       @"4":  @"240.0.0.0",
                       @"3":  @"224.0.0.0",
                       @"2":  @"192.0.0.0",
                       @"1":  @"128.0.0.0",
                       @"0":  @"0.0.0.0" };
    });
    
    NSArray *eachIPRoute = [ip componentsSeparatedByString:@"/"];
    NSString *routeIP = eachIPRoute.firstObject;
    
    if ( N2UtilIsStringValidIPAddress(routeIP) ) {
        NSString *routeMask = s_maskDict[@"32"];
        if ( [eachIPRoute count] == 2 ) {
            routeMask = s_maskDict[eachIPRoute.lastObject] ?: @"32";
        }
        
        NEIPv4Route *route = [[NEIPv4Route alloc] initWithDestinationAddress:routeIP
                                                                  subnetMask:routeMask];
        return route;
    }
    
    return nil;
}

- (NSArray *)ChinaIPRoutes
{
    // 加载 IP 规则
    NSString *ipStr = [NSString stringWithContentsOfFile:China_IPFilePath
                                      encoding:NSUTF8StringEncoding
                                         error:nil];
    
    if ( ![ipStr length] ) {
        NSString *localIPFilePath = [[NSBundle mainBundle] pathForResource:@"china_ip" ofType:@"txt"];
        ipStr = [NSString stringWithContentsOfFile:localIPFilePath encoding:NSUTF8StringEncoding error:nil];
    }
    
    NSArray *allIPs = [ipStr componentsSeparatedByString:@"\n"];
    NSMutableArray *routes = [NSMutableArray array];
    for ( NSString *eachIPStr in allIPs ) {
        NEIPv4Route *route = [self routeWithIPString:eachIPStr];
        if ( route ) {
            [routes addObject:route];
        }
    }
    
    return routes;
}
*/
- (NSArray *)privateIPRoutes
{
    // RFC1918 + CGNAT + link-local；勿加入 172.32.0.0/11（那是公网段，不是私网）
    return @[
             [[NEIPv4Route alloc] initWithDestinationAddress:@"10.0.0.0" subnetMask:@"255.0.0.0"],
             [[NEIPv4Route alloc] initWithDestinationAddress:@"100.64.0.0" subnetMask:@"255.192.0.0"],
             [[NEIPv4Route alloc] initWithDestinationAddress:@"169.254.0.0" subnetMask:@"255.255.0.0"],
             [[NEIPv4Route alloc] initWithDestinationAddress:@"172.16.0.0" subnetMask:@"255.240.0.0"],
             [[NEIPv4Route alloc] initWithDestinationAddress:@"192.168.0.0" subnetMask:@"255.255.0.0"]
             ];
}

- (NSArray *)blackRoutes
{
    return @[];
}

- (NSArray *)whiteRoutes
{
    return @[[[NEIPv4Route alloc] initWithDestinationAddress:@"172.16.0.0" subnetMask:@"255.240.0.0"]];
}

- (NSString *)chinaIPListContent
{
    NSMutableArray<NSString *> *candidates = [NSMutableArray array];
    NSURL *groupURL = [[NSFileManager defaultManager]
                       containerURLForSecurityApplicationGroupIdentifier:kAppGroupIdentifier];
    if (groupURL.path.length > 0) {
        [candidates addObject:[groupURL.path stringByAppendingPathComponent:@"china_ip.txt"]];
    }
    NSString *bundleList = [[NSBundle mainBundle] pathForResource:@"chinaiplist" ofType:@"txt"];
    if (bundleList.length > 0) [candidates addObject:bundleList];
    NSString *bundleListDir = [[NSBundle mainBundle] pathForResource:@"chinaiplist" ofType:@"txt" inDirectory:@"chinaip"];
    if (bundleListDir.length > 0) [candidates addObject:bundleListDir];
    NSString *bundleChinaIP = [[NSBundle mainBundle] pathForResource:@"china_ip" ofType:@"txt"];
    if (bundleChinaIP.length > 0) [candidates addObject:bundleChinaIP];
    
    NSFileManager *fm = [NSFileManager defaultManager];
    for (NSString *path in candidates) {
        if (![fm fileExistsAtPath:path]) continue;
        NSError *error = nil;
        NSString *content = [NSString stringWithContentsOfFile:path
                                                      encoding:NSUTF8StringEncoding
                                                         error:&error];
        // 成功读到非空内容即以返回值为准（忽略 error 残留）
        if (content.length > 0) {
            DDLogInfo(@"[ROUTE MODE] China IP list loaded from %@ (%zu chars)",
                      path, (unsigned long)content.length);
            return content;
        }
        if (error) {
            DDLogWarn(@"[ROUTE MODE] Failed reading China IP list %@: %@", path, error.localizedDescription);
        }
    }
    DDLogError(@"[ROUTE MODE] China IP list not found in app group or bundle");
    return nil;
}

- (BOOL)isValidIPv4AddressString:(NSString *)address
{
    if (address.length == 0) return NO;
    struct in_addr addr;
    return inet_aton(address.UTF8String, &addr) == 1;
}

- (NSArray<NEIPv4Route *> *)ChinaIPRoutes {
    NSString *content = [self chinaIPListContent];
    if (content.length == 0) {
        return @[];
    }
    
    NSError *regexError = nil;
    NSRegularExpression *cidrRegex = [NSRegularExpression regularExpressionWithPattern:@"^\\d{1,3}(?:\\.\\d{1,3}){3}/\\d{1,2}$"
                                                                              options:0
                                                                                error:&regexError];
    if (!cidrRegex) {
        DDLogError(@"Failed to compile CIDR regex: %@", regexError.localizedDescription);
        return @[];
    }
    
    NSMutableArray<NEIPv4Route *> *routes = [NSMutableArray array];
    __block NSUInteger invalidCount = 0;
    __block NSUInteger totalCount = 0;
    
    [content enumerateLinesUsingBlock:^(NSString * _Nonnull line, BOOL * _Nonnull stop) {
        totalCount++;
        
        NSString *cidr = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (cidr.length == 0) return;
        if ([cidr hasPrefix:@"#"] || [cidr hasPrefix:@"//"]) return;
        
        if ([cidrRegex numberOfMatchesInString:cidr
                                      options:0
                                        range:NSMakeRange(0, cidr.length)] == 0) {
            invalidCount++;
            return;
        }
        
        NSArray<NSString *> *cidrParts = [cidr componentsSeparatedByString:@"/"];
        if (cidrParts.count != 2) {
            invalidCount++;
            return;
        }
        
        NSString *address = cidrParts[0];
        NSInteger prefixLength = [cidrParts[1] integerValue];
        // /0 会变成 default，污染 split 路由；拒绝
        if (prefixLength <= 0 || prefixLength > 32) {
            invalidCount++;
            return;
        }
        if (![self isValidIPv4AddressString:address]) {
            invalidCount++;
            return;
        }
        
        NSString *subnetMask = [self subnetMaskFromPrefixLength:(NSUInteger)prefixLength];
        NEIPv4Route *route = [[NEIPv4Route alloc] initWithDestinationAddress:address
                                                                  subnetMask:subnetMask];
        if (route) {
            [routes addObject:route];
        } else {
            invalidCount++;
        }
    }];
    
    DDLogInfo(@"Loaded %zu China IP routes (skipped invalid=%zu, lines=%zu)",
              (unsigned long)routes.count,
              (unsigned long)invalidCount,
              (unsigned long)totalCount);
    
    return [routes copy];
}

// 辅助方法：CIDR前缀长度 → 子网掩码
- (NSString *)subnetMaskFromPrefixLength:(NSUInteger)prefixLength {
    if (prefixLength == 0) return @"0.0.0.0";
    if (prefixLength > 32) prefixLength = 32;
    
    uint32_t mask = (prefixLength == 0) ? 0 : (0xFFFFFFFFu << (32 - prefixLength));
    struct in_addr addr;
    addr.s_addr = htonl(mask);
    char buf[INET_ADDRSTRLEN] = {0};
    if (!inet_ntop(AF_INET, &addr, buf, sizeof(buf))) {
        return @"255.255.255.255";
    }
    return [NSString stringWithUTF8String:buf];
}

- (NEPacketTunnelNetworkSettings *)createTunnelNetworkSettings
{
    NEPacketTunnelNetworkSettings *settings = [[NEPacketTunnelNetworkSettings alloc] initWithTunnelRemoteAddress:@"127.0.0.1"];
    NEIPv4Settings *IPv4Settings = [[NEIPv4Settings alloc] initWithAddresses:@[@"192.0.2.1"] subnetMasks:@[@"255.255.255.0"]];
    
    NSMutableArray *includedRoutes = [NSMutableArray array];
    NSMutableArray *excludedRoutes = [NSMutableArray array];
    NSArray *chinaRoutes = [self ChinaIPRoutes];
    
    NSString *mode = self.accelRouteMode.length ? self.accelRouteMode : AccelRouteModeAbroad;
    BOOL chinaOnly = [mode isEqualToString:AccelRouteModeChina];
    if (chinaOnly) {
        // 国外加速国内：仅国内 CIDR 进隧道；其余公网自然走本地
        // 必须纳入假 DNS，否则 matchDomains 劫持的查询进不了 Extension
        [includedRoutes addObject:[[NEIPv4Route alloc] initWithDestinationAddress:kLocalDNSServer
                                                                       subnetMask:@"255.255.255.255"]];
        if (chinaRoutes.count > 0) {
            [includedRoutes addObjectsFromArray:chinaRoutes];
        } else {
            // 不可回退全隧道：否则国外流量被劫持后非白名单丢弃，与「国外本地」相反
            DDLogError(@"[ROUTE MODE] china mode but China IP list empty; only DNS route included");
        }
    } else {
        // 国内加速国外：全隧道 + 排除国内 CIDR
        [includedRoutes addObject:[NEIPv4Route defaultRoute]];
        if (chinaRoutes.count > 0) {
            [excludedRoutes addObjectsFromArray:chinaRoutes];
        } else {
            DDLogWarn(@"[ROUTE MODE] abroad mode but China IP list empty; domestic traffic may enter tunnel");
        }
    }
    
    // 私网 / 黑名单路由始终排除
    [excludedRoutes addObjectsFromArray:[self privateIPRoutes]];
    [excludedRoutes addObjectsFromArray:[self blackRoutes]];

    if (includedRoutes.count == 0) {
        DDLogError(@"[ROUTE MODE] includedRoutes empty; VPN will not capture traffic");
    }

    DDLogInfo(@"[ROUTE MODE] apply mode=%@ include=%zu exclude=%zu chinaCIDRs=%zu",
              mode,
              (unsigned long)includedRoutes.count,
              (unsigned long)excludedRoutes.count,
              (unsigned long)chinaRoutes.count);

    settings.DNSSettings = [[NEDNSSettings alloc] initWithServers:@[kLocalDNSServer]];
    settings.DNSSettings.matchDomains = @[@""];
    settings.DNSSettings.matchDomainsNoSearch = NO;
    
    IPv4Settings.includedRoutes = includedRoutes;
    IPv4Settings.excludedRoutes = excludedRoutes;
    
    settings.IPv4Settings = IPv4Settings;
    settings.MTU = @(TCP_MTU);
    
    return settings;
}

- (BOOL)routePacket_K1:(NSData *)packet
{
    struct dns_rule_info dns_rule_info;
    struct traffic_rule_info white_rule;
    struct traffic_rule_info black_rule;
    struct ip_session_info session;
    __unused char buff[255] = {0};
    
    // 初始化 session 信息
    if (![self.ruleManager session_WithPacket:packet session:&session outgoing:YES]) {
        DDLogWarn(@"[ROUTE OUT] Invalid IP packet, skip accelerate");
        return NO;
    }
    N2IPPacket *n2packet = [N2IPPacket packet_WithData:packet outgoing:YES];
    
    
    // === 基本数据包信息日志 ===
    const char *protocolName = "UNKNOWN";
    switch (session.packet.protocol) {
        case IPPROTO_TCP: protocolName = "TCP"; break;
        case IPPROTO_UDP: protocolName = "UDP"; break;
        case IPPROTO_ICMP: protocolName = "ICMP"; break;
        default: protocolName = "OTHER"; break;
    }
    
    // 格式化IP地址
    struct in_addr srcAddr, dstAddr;
    srcAddr.s_addr = n2packet.source_IP;
    dstAddr.s_addr = n2packet.destination_IP;
     
    // 准备日志字符串
    NSString *srcIPStr = [NSString stringWithUTF8String:inet_ntoa(srcAddr)];
    NSString *dstIPStr = [NSString stringWithUTF8String:inet_ntoa(dstAddr)];
    NSString *domainStr = [NSString stringWithUTF8String:session.domain];//n2packet.queryDomain_DNS ?: @"(not DNS)";
    
    // 记录基础数据包信息
    DDLogInfo(@"[ROUTE OUT] Processing packet: %@:%d -> %@:%d, Protocol: %s, Domain: %@, Length: %zu bytes",
             srcIPStr, n2packet.sourcePort_IP,
             dstIPStr, n2packet.destinationPort_IP,
             protocolName,
             domainStr,
             packet.length);
    
    if (session.packet.protocol == IPPROTO_ICMP) {
        LOG_INFO(@"icmp detected: %@", n2packet.destinationHost_IP);
    }
    
#if DEBUG_PRINT_INTERCEPT_IPPACKET
    NSString *pkgInfo = [NSString stringWithFormat:@"%@, area: %d, isp: %d", n2packet, session.area_id, session.isp_id];
#endif

    if (session.is_dns)
    {
        if ([self.ruleManager session:&session check_DNS:&dns_rule_info])
        {
            DDLogInfo(@"[ROUTE OUT] DNS Domain: %@ TO %@", domainStr,
                      [NSString stringWithUTF8String:inet_ntoa(*(struct in_addr *)&dns_rule_info.server_addr_net)] ?: @"?");
#if DEBUG_PRINT_INTERCEPT_IPPACKET
            LOG_Info(@"%@ \nDNS matched: %s", pkgInfo, get_dns_rule_string(&dns_rule_info, buff, 255));
#endif
            // 修复：重定向到127.0.0.1，而非第三方服务器
            NSMutableData *mutablePacket = [packet mutableCopy];
            uint8_t *bytes = mutablePacket.mutableBytes;
            process_dns_query(dns_rule_info.server_addr_net, bytes, [packet length]);
            NSData *newPacket = [NSData dataWithBytes:bytes length:[packet length]];
            packet = newPacket;
            
            // 重新设置 区分数据包该如何处理
            if (![self.ruleManager session_WithPacket:packet session:&session outgoing:YES]) {
                DDLogWarn(@"[ROUTE OUT] DNS redirected packet invalid");
                return NO;
            }
        }
        else
        {
            DDLogInfo(@"[ROUTE OUT] DNS Domain: %@ TO 114.114.114.114",domainStr);
            // 未匹配DNS规则，交由本地DNS服务器处理
            return [self.dnsServer processDNSQueryPacket_DNS:n2packet];
        }
    }
        
    if ([self.ruleManager session:&session check_Black:&black_rule]) {
#if DEBUG_PRINT_INTERCEPT_IPPACKET
        LOG_Info(@"%@ \nBLACK matched: %s", pkgInfo, get_traffic_rule_string(&black_rule, buff, 255));
#endif
        return NO; // 返回NO表示允许流量通过（不经过VPN处理）
    }
    else if ([self.ruleManager session:&session check_White:&white_rule]) {
#if DEBUG_PRINT_INTERCEPT_IPPACKET
        K1FlowGroup *flowGroup = [self.flowManager groupForId:white_rule.flow.id];
        LOG_Info(@"%@ \nWHITE matched: %@ %s", pkgInfo, flowGroup.groupName, get_traffic_rule_string(&white_rule, buff, 255));
#endif
        
        if (n2packet.is_TCP || n2packet.is_UDP) {
            // 这里可以添加流量统计
            // NSMutableDictionary *trafficInfo = [NSMutableDictionary dictionary];
            // ReportTraffic(trafficInfo);
        }
        
        return [self processPacket:packet withFlowId:(NSUInteger)white_rule.flow.id];
    }
    
#if DEBUG_PRINT_INTERCEPT_IPPACKET
    LOG_Info(@"%@ \nNO matched, Bypass", pkgInfo);
#endif
    

    // 返回NO表示允许流量通过（不经过VPN处理）
    return NO;
}

/*
- (BOOL)routePacket_K1:(NSData *)packet
{
    struct dns_rule_info dns_rule_info;
    struct traffic_rule_info white_rule;
    struct traffic_rule_info black_rule;
    struct ip_session_info session;
    __unused char buff[255] = {0};
    
    [self.ruleManager session_WithPacket:packet session:&session outgoing:YES];
    N2IPPacket *n2packet = [N2IPPacket packet_WithData:packet outgoing:YES];
    
    if (session.packet.protocol == IPPROTO_ICMP) {
        LOG_Info(@"icmp detected: %@", n2packet.destinationHost_IP);
    }
    
#if DEBUG_PRINT_INTERCEPT_IPPACKET
    NSString *pkgInfo = [NSString stringWithFormat:@"%@, area: %d, isp: %d", n2packet, session.area_id, session.isp_id];
#endif

    if (session.is_dns) {
        if ([self.ruleManager session:&session check_DNS:&dns_rule_info]) {
#if DEBUG_PRINT_INTERCEPT_IPPACKET
            LOG_Info(@"%@ \nDNS matched: %s", pkgInfo, get_dns_rule_string(&dns_rule_info, buff, 255));
#endif
            // 修复：重定向到127.0.0.1，而非第三方服务器
            NSMutableData *mutablePacket = [packet mutableCopy];
            uint8_t *bytes = mutablePacket.mutableBytes;
            process_dns_query(dns_rule_info.server_addr_net, bytes, [packet length]);
            NSData *newPacket = [NSData dataWithBytes:bytes length:[packet length]];
            packet = newPacket;
            
            // 重新设置 区分数据包该如何处理
            [self.ruleManager session_WithPacket:packet session:&session outgoing:YES];
        }
        else {
            // 未匹配DNS规则，交由本地DNS服务器处理
            return [self.dnsServer processDNSQueryPacket_DNS:n2packet];
        }
    }
        
    if ([self.ruleManager session:&session check_Black:&black_rule]) {
#if DEBUG_PRINT_INTERCEPT_IPPACKET
        LOG_Info(@"%@ \nBLACK matched: %s", pkgInfo, get_traffic_rule_string(&black_rule, buff, 255));
#endif
        return NO; // 丢弃黑名单流量
    }
    else if ([self.ruleManager session:&session check_White:&white_rule]) {
#if DEBUG_PRINT_INTERCEPT_IPPACKET
        K1FlowGroup *flowGroup = [self.flowManager groupForId:white_rule.flow.id];
        LOG_Info(@"%@ \nWHITE matched: %@ %s", pkgInfo, flowGroup.groupName, get_traffic_rule_string(&white_rule, buff, 255));
#endif
        
        if (n2packet.is_TCP || n2packet.is_UDP) {
            // 这里可以添加流量统计
            // NSMutableDictionary *trafficInfo = [NSMutableDictionary dictionary];
            // ReportTraffic(trafficInfo);
        }
        
        return [self processPacket:packet withFlowId:(NSUInteger)white_rule.flow.id];
    }
    
#if DEBUG_PRINT_INTERCEPT_IPPACKET
    LOG_Info(@"%@ \nNO matched, Bypass", pkgInfo);
#endif
    

    // 返回NO表示允许流量通过（不经过VPN处理）
    return NO;
}
*/

- (BOOL)processPacket:(NSData *)packet withFlowId:(NSUInteger)flowId
{
    K1FlowGroup *flowGroup = [self.flowManager groupForId:flowId];
    
    if (flowGroup) {
        if (self.randomActiveFlowGroup == nil) {
            self.randomActiveFlowGroup = flowGroup;
        }
        
        // 修复：使用atomic_fetch_add正确更新计数器
        atomic_fetch_add(&_TX_packets, 1);
        atomic_fetch_add(&_TX_bytes, [packet length]);
        return [flowGroup inputPacket_OneFlowGroup:packet];
    }
    
    LOG_ERROR(@"No Flow group %ld", (unsigned long)flowId);
    return NO;
}

- (NSUInteger)flowGroupCount
{
    return self.flowManager.flowGroups_All.count;
}

- (NSArray *)flowGroups
{
    return self.flowManager.flowGroups_All ?: @[];
}

- (void)notifyAllPathsResolvedIfNeeded
{
    if (self.pendingResolveCount == 0) {
        return;
    }
    if (self.finishedResolveCount < self.pendingResolveCount) {
        return;
    }
    void (^cb)(BOOL) = self.onAllPathsResolved;
    self.onAllPathsResolved = nil;
    if (!cb) {
        return;
    }
    BOOL anyReady = NO;
    for (K1FlowGroup *group in self.flowManager.flowGroups_All) {
        if (group.status_OneFlowGroup == K1FlowGroupStatusReady ||
            group.status_OneFlowGroup == K1FlowGroupStatusActive) {
            anyReady = YES;
            break;
        }
    }
    cb(anyReady);
}

- (void)start_K1
{
    if (self.flowManager) {
        // 先挂 delegate，再启动选路，避免同步失败回调丢失
        for (K1FlowGroup *eachGroup in self.flowManager.flowGroups_All) {
            eachGroup.delegate_OneFlowGroup = self;
        }
        self.finishedResolveCount = 0;
        self.pendingResolveCount = self.flowManager.flowGroups_All.count;
        [self.flowManager start_AllFlowGroup];
        if (self.pendingResolveCount == 0) {
            void (^cb)(BOOL) = self.onAllPathsResolved;
            self.onAllPathsResolved = nil;
            if (cb) {
                cb(NO);
            }
        }
    } else {
        void (^cb)(BOOL) = self.onAllPathsResolved;
        self.onAllPathsResolved = nil;
        if (cb) {
            cb(NO);
        }
    }
    
    // 启动本地DNS服务器（监听127.0.0.1:53）
    self.dnsServer = [[K1DNSServer alloc] initWithDNSServer_DNS:self.localDNS];
    self.dnsServer.delegate_DNS = self;
    [self.dnsServer start_DNS];
}

- (void)stop_K1
{
    self.onAllPathsResolved = nil;
    self.pendingResolveCount = 0;
    self.finishedResolveCount = 0;
    if (self.flowManager) {
        [self.flowManager stop_AllFlowGroup];
    }
    
    if (self.dnsServer) {
        [self.dnsServer stop_DNS];
        [self.dnsServer.socket_DNS disconnect];
        self.dnsServer = nil;
    }
}

- (void)processIncomingPacket:(NSData *)packet
{
    N2IPPacket *n2packet = [N2IPPacket packet_WithData:packet outgoing:NO];
    [n2packet updateChecksum_IP];
    packet = n2packet.rawData_IP;
    
    
    // 修复：使用atomic_fetch_add正确更新计数器
    atomic_fetch_add(&_RX_packets, 1);
    atomic_fetch_add(&_RX_bytes, [packet length]);

#if DEBUG_PRINT_INTERCEPT_IPPACKET
    LOG_Info(@"%@", n2packet);
#endif
    
    struct ip_session_info session;
    if (![self.ruleManager session_WithPacket:packet session:&session outgoing:NO]) {
        DDLogWarn(@"[ROUTE IN] Invalid IP packet, drop session parse");
        return;
    }
    
    // === 基本数据包信息日志 ===
    const char *protocolName = "UNKNOWN";
    switch (session.packet.protocol) {
        case IPPROTO_TCP: protocolName = "TCP"; break;
        case IPPROTO_UDP: protocolName = "UDP"; break;
        case IPPROTO_ICMP: protocolName = "ICMP"; break;
        default: protocolName = "OTHER"; break;
    }
    
    // 格式化IP地址
    struct in_addr srcAddr, dstAddr;
    srcAddr.s_addr = n2packet.source_IP;
    dstAddr.s_addr = n2packet.destination_IP;
    
    // 准备日志字符串
    NSString *srcIPStr = [NSString stringWithUTF8String:inet_ntoa(srcAddr)];
    NSString *dstIPStr = [NSString stringWithUTF8String:inet_ntoa(dstAddr)];
    NSString *domainStr = [NSString stringWithUTF8String:session.domain];//n2packet.queryDomain_DNS ?: @"(not DNS)";
    
    
    
    
    if (session.is_dns)
    {
        NSMutableData *mutablePacket = [packet mutableCopy];
        uint8_t *bytes = mutablePacket.mutableBytes;
        process_dns_answer(bytes, [packet length], YES);
        packet = [NSData dataWithBytes:bytes length:[packet length]];
        
        // 记录基础数据包信息
        DDLogInfo(@"[ROUTE DNS IN] Processing packet: %@:%d -> %@:%d, Protocol: %s, Domain: %@, Length: %zu bytes",
                 srcIPStr, n2packet.sourcePort_IP,
                 dstIPStr, n2packet.destinationPort_IP,
                 protocolName,
                 domainStr,
                 packet.length);
    }
    else
    {
        // 记录基础数据包信息
        DDLogInfo(@"[ROUTE IP IN] Processing packet: %@:%d -> %@:%d, Protocol: %s, Domain: %@, Length: %zu bytes",
                 srcIPStr, n2packet.sourcePort_IP,
                 dstIPStr, n2packet.destinationPort_IP,
                 protocolName,
                 domainStr,
                 packet.length);
    }
    
    // 确保 delegate 已设置且实现方法，Dns数据写回协议栈
    if (self.delegate && [self.delegate respondsToSelector:@selector(incomingIPPacket:fromRouter:)]) {
        [self.delegate incomingIPPacket:packet fromRouter:self];
    } else {
        DDLogError(@"K1PacketRouter delegate is not set or does not implement incomingIPPacket:fromRouter:");
    }
}

#pragma mark - K1FlowGroupDelegate

- (void)flowPacket:(NSData *)packet fromFlowGroup:(K1FlowGroup *)flowGroup
{
    [self processIncomingPacket:packet];
}

#pragma mark - K1DNSServerDelegate

- (void)didReceiveDatas:(NSArray *)datas fromDNS:(K1DNSServer *)dns
{
    for (NSData *eachData in datas) {
        [self processIncomingPacket:eachData];
    }
}

- (NSDictionary *)pathInfoItemFromResult:(K1ResolveResultItem *)result
                              flowGroup:(K1FlowGroup *)flowGroup
                                  index:(NSInteger)index
{
    if (!result || !flowGroup) {
        return nil;
    }

    K1M_ENTRANCE *ent = result.entrance_OneFlowGroup;
    K1M_EXIT *ext = result.exit_OneFlowGroup;
    if (!ent || !ext) {
        LOG_ERROR(@"pathInfoItemFromResult missing entrance/exit");
        return nil;
    }

    NSInteger enterPort = result.port_OneFlowGroup;
    if (enterPort <= 0 && [ent.port isKindOfClass:[NSArray class]] && ent.port.count > 0) {
        enterPort = [ent.port.firstObject integerValue];
    }

    // delayC/lostC：当前 iOS 无 C 段探测，与参考端未测段约定一致（delayC=0, lostC=1）
    return @{
        @"Path_Info": @"\n",
        @"delayA": @((double)result.A_Delay),
        @"delayB": @((double)result.B_Delay),
        @"delayC": @(0.0),
        @"enterIp": ent.ip ?: @"",
        @"enterPort": @(enterPort),
        @"flowGroupId": @(flowGroup.groupId_OneFlowGroup),
        @"flowLevel": @(result.flowLevel_OneFlowGroup),
        @"id": @(index),
        @"lostA": @((double)result.A_Lost),
        @"lostB": @((double)result.B_Lost),
        @"lostC": @(1.0),
        @"main_offset": @(flowGroup.flowLevel_OneFlowGroup),
        @"outAddr": ext.addr ?: @"",
        @"outIp": ext.nat ?: @""
    };
}

/// 将各 FlowGroup 的选路结果聚合成一份 Main_Speed_Path_Info（参考端单对象格式）
- (NSDictionary *)buildAggregatedMainSpeedPathInfo
{
    NSArray<NSDictionary *> *groupInfos = [self.pathInfoByFlowGroupId allValues];
    if (groupInfos.count == 0) {
        return nil;
    }

    // 单 Group：直接返回原始对象，字段与参考日志一致
    if (groupInfos.count == 1) {
        return groupInfos.firstObject;
    }

    BOOL anyOk = NO;
    NSMutableArray *mergedInfo = [NSMutableArray array];
    NSInteger nextId = 1;
    NSInteger primaryGroupId = 0;
    NSInteger primaryLevel = 0;

    // 稳定顺序：按 flowgroupid 排序
    NSArray *sortedKeys = [[self.pathInfoByFlowGroupId allKeys]
                           sortedArrayUsingSelector:@selector(compare:)];
    for (NSNumber *key in sortedKeys) {
        NSDictionary *one = self.pathInfoByFlowGroupId[key];
        if (![one isKindOfClass:[NSDictionary class]]) {
            continue;
        }
        if ([one[@"f_result"] isEqualToString:@"ok"]) {
            anyOk = YES;
        }
        if (primaryGroupId == 0) {
            primaryGroupId = [one[@"flowgroupid"] integerValue];
            primaryLevel = [one[@"flowgrouplevel"] integerValue];
        }
        NSArray *items = one[@"info"];
        if (![items isKindOfClass:[NSArray class]]) {
            continue;
        }
        // 每个 group 只带其最优（info 首条），避免 IPC 膨胀
        NSDictionary *bestItem = items.firstObject;
        if (![bestItem isKindOfClass:[NSDictionary class]]) {
            continue;
        }
        NSMutableDictionary *copied = [bestItem mutableCopy];
        copied[@"id"] = @(nextId++);
        [mergedInfo addObject:copied];
    }

    return @{
        @"f_result": anyOk ? @"ok" : @"fail",
        @"f_targetip": @"0.0.0.0",
        @"flowgroupid": @(primaryGroupId),
        @"flowgrouplevel": @(primaryLevel),
        @"flowid": @(self.cachedFlowId),
        @"info": mergedInfo
    };
}

- (void)updateMainSpeedPathInfoWithBest:(K1ResolveResultItem *)best
                             allResults:(NSArray *)results
                              flowGroup:(K1FlowGroup *)flowGroup
                                 result:(NSString *)fResult
{
    if (!flowGroup) {
        return;
    }

    NSMutableArray *infoList = [NSMutableArray array];
    if (best) {
        NSDictionary *bestItem = [self pathInfoItemFromResult:best flowGroup:flowGroup index:1];
        if (bestItem) {
            [infoList addObject:bestItem];
        }
    }

    NSInteger idx = infoList.count > 0 ? 2 : 1;
    for (K1ResolveResultItem *item in results ?: @[]) {
        if (best && item == best) {
            continue;
        }
        // 仅附带少量候选，避免 IPC 过大：每 group 最多 5 条
        if (infoList.count >= 5) {
            break;
        }
        NSDictionary *itemDict = [self pathInfoItemFromResult:item flowGroup:flowGroup index:idx];
        if (!itemDict) {
            continue;
        }
        [infoList addObject:itemDict];
        idx++;
    }

    NSDictionary *pathInfo = @{
        @"f_result": fResult ?: @"fail",
        @"f_targetip": @"0.0.0.0",
        @"flowgroupid": @(flowGroup.groupId_OneFlowGroup),
        @"flowgrouplevel": @(flowGroup.flowLevel_OneFlowGroup),
        @"flowid": @(flowGroup.flowId_OneFlowGroup > 0
                        ? flowGroup.flowId_OneFlowGroup
                        : self.cachedFlowId),
        @"info": infoList
    };

    NSDictionary *aggregated = nil;
    @synchronized (self) {
        if (!self.pathInfoByFlowGroupId) {
            self.pathInfoByFlowGroupId = [NSMutableDictionary dictionary];
        }
        NSDictionary *prev = self.pathInfoByFlowGroupId[@(flowGroup.groupId_OneFlowGroup)];
        // 内容未变则跳过，避免 success/finish 或重复失败回调刷日志
        if ([prev isEqualToDictionary:pathInfo]) {
            return;
        }
        self.pathInfoByFlowGroupId[@(flowGroup.groupId_OneFlowGroup)] = pathInfo;
        aggregated = [self buildAggregatedMainSpeedPathInfo];
        self.mainSpeedPathInfo = aggregated;
    }

    if (!aggregated) {
        return;
    }

    NSError *err = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:aggregated options:0 error:&err];
    if (jsonData && !err) {
        NSString *json = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        LOG_INFO(@"GN_GetSpeedInfo Main_Speed_Path_Info:%@", json);
    } else {
        LOG_ERROR(@"Failed to serialize Main_Speed_Path_Info: %@", err);
    }
}

- (void)successResolving:(K1ResolveResultItem *)result fromFlowGroup:(K1FlowGroup *)flowGroup
{
    LOG_INFO(@"finish resolving: %@, traffic_level: %ld", result, (long)flowGroup.flowLevel_OneFlowGroup);
    // 不在此处写 Main_Speed_Path_Info：随后必有 finishResolvingWithAllResults，避免重复上报
}

- (void)flowGroupFaildResolving:(K1FlowGroup *)flowGroup
{
    LOG_ERROR(@"Failed Resolving : %@", flowGroup);
    // Main_Speed_Path_Info 由随后的 finishResolvingWithAllResults 统一落盘（含候选结果）
}

- (void)finishResolvingWithAllResults:(NSArray *)results fromFlowGroup:(K1FlowGroup *)flowGroup
{
    // 仅在 FlowGroup 真正进入 Ready 时上报 ok（全 BadDelay / 无 socket 不算成功）
    BOOL resolvedOk = (flowGroup.status_OneFlowGroup == K1FlowGroupStatusReady ||
                       flowGroup.status_OneFlowGroup == K1FlowGroupStatusActive);
    K1ResolveResultItem *best = nil;
    if (resolvedOk && [results isKindOfClass:[NSArray class]] && results.count > 0) {
        best = results.firstObject;
        // 与 FlowGroup 实际选用路径对齐
        if (flowGroup.resolveEntrance_OneFlowGroup && flowGroup.resolveExit_OneFlowGroup) {
            for (K1ResolveResultItem *item in results) {
                if (item.entrance_OneFlowGroup == flowGroup.resolveEntrance_OneFlowGroup &&
                    item.exit_OneFlowGroup == flowGroup.resolveExit_OneFlowGroup) {
                    best = item;
                    break;
                }
            }
        }
    }
    NSString *fResult = resolvedOk ? @"ok" : @"fail";
    [self updateMainSpeedPathInfoWithBest:best
                               allResults:results
                                flowGroup:flowGroup
                                   result:fResult];
    self.finishedResolveCount += 1;
    [self notifyAllPathsResolvedIfNeeded];
}

- (void)doHeartBeat_K1
{
    // 运行期保活由各 Active FlowGroup 自己的 timer 负责；此处作兜底触发
    for (K1FlowGroup *group in self.flowManager.flowGroups_All) {
        if (group.status_OneFlowGroup == K1FlowGroupStatusActive) {
            [group startHeartBeat];
        }
    }
}

@end

