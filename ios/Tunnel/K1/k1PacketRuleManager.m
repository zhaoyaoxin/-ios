//
//  K1PacketRuleController.m
//  Gnwj
//
//  Created by Z0 on 30/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1PacketRuleManager.h"
#import "K1FlowGroup.h"
#import <arpa/inet.h>
#import <stdlib.h>
#import <string.h>


@interface K1PacketRuleManager ()

@end

@implementation K1PacketRuleManager
{
    struct ip_range_info_list *ipdb;
}

- (void)dealloc
{
    free_ip_range_list(ipdb);
    ipdb = NULL;
}

- (instancetype)initWith_SpeedInfo:(K1M_SPEED_START_INFO *)info
{
    self = [super init];
    if ( self ) {
        self.blackRoutes = [NSMutableArray array];
        
        [self loadAreaISPLib];
        [self buildRulesWithSpeedInfo:info];

    }
    return self;
}

- (instancetype)initWithSpeedInfo_json:(NSDictionary *)speedInfo
{
    self = [super init];
    if (self)
    {
    }
    return self;
}

- (void)loadAreaISPLib
{
    NSString *filePath = [[NSBundle mainBundle] pathForResource:@"K1_area_isp" ofType:@"data"];
    NSString *updateFilePath = area_isp_Path;
    if ( [[NSFileManager defaultManager] fileExistsAtPath:updateFilePath] ) {
        LOG_INFO(@"There has a update IP ranges!");
        filePath = updateFilePath;
    }
    
    if ( filePath ) {
        ipdb = ipbase_new_from_file([filePath UTF8String], true);
        if (ipdb) {
            LOG_INFO(@"Loaded %u ip ranges for Area & ISP", ipdb->nmemb);
        } else {
            LOG_ERROR(@"Failed to load Area & ISP db from %@", filePath);
        }
    }
}

// 域名规范化：小写、去首尾空白、去掉尾部 '.'，保留 *. 前缀
- (NSString *)normalizeDomain:(NSString *)domain
{
    if (!domain) {
        return domain;
    }
    NSString *s = [[domain lowercaseString]
        stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    while (s.length > 0 && [s hasSuffix:@"."]) {
        s = [s substringToIndex:s.length - 1];
    }
    return s;
}

- (BOOL)session_WithPacket:(NSData *)packet
                  session:(struct ip_session_info *)session
                 outgoing:(BOOL)outgoing
{
    if (!packet || !session || packet.length == 0) {
        return NO;
    }
    const uint8_t *bytes = packet.bytes;
    const size_t len = [packet length];
    if (get_ipsession_info(session, bytes, len, outgoing ? DIRECTION_OUT : DIRECTION_IN) < 0) {
        return NO;
    }
    
    union {
        uint32_t d32;
        uint16_t d16[2];
    } value;
    
    value.d32 = find_value_from_range_list(ipdb, session->packet.dst_addr_ip);
    session->area_id = value.d16[0];
    session->isp_id = value.d16[1];
    return YES;
}

- (BOOL)session:(struct ip_session_info *)session
   check_Black:(struct traffic_rule_info *)blackRule
{
    return check_session_match_black_rule(session, blackRule);
}

- (BOOL)session:(struct ip_session_info *)session
   check_White:(struct traffic_rule_info *)whiteRule
{
    return check_session_match_white_rule(session, whiteRule);
}

- (BOOL)session:(struct ip_session_info *)session
   check_DNS:(struct dns_rule_info *)dnsRule
{
    return check_domain_match_dns_rule(session->domain, dnsRule);
}

- (struct traffic_rule_info *)createTrafficRuleWithProcess:(NSString *)process
                                             protocol:(NSString *)protocol
                                               domain:(NSString *)domain
                                                areas:(NSArray *)areas
                                                 ISPs:(NSArray *)ISPs
                                                 port:(NSString *)portString
{
    // 进程：iOS 仅支持 "*"
    NSString *proc = [process stringByTrimmingCharactersInSet:
                      [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if ( ![proc isEqualToString:@"*"] ) {
        return NULL;
    }
    
    struct traffic_rule_info *rule = init_all_matched_traffic_rule_info();
    if (!rule) {
        return NULL;
    }
    
    NSString *proto = [[protocol ?: @"" stringByTrimmingCharactersInSet:
                        [NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
    if ( [proto isEqualToString:@"*"] ) {
        rule->protocol = PROTO_ANY;
    }
    else if ( [proto isEqualToString:@"tcp"] ) {
        rule->protocol = IPPROTO_TCP;
    }
    else if ( [proto isEqualToString:@"udp"] ) {
        rule->protocol = IPPROTO_UDP;
    }
    else if ( [proto isEqualToString:@"icmp"] ) {
        rule->protocol = IPPROTO_ICMP;
    }
    else {
        // 未知协议不能默认为 ANY（否则变成全协议命中）
        DDLogError(@"Invalid protocol in rule, dropped: %@", protocol);
        free(rule);
        return NULL;
    }
    
    // host 必填：空串不能静默变成 domain=* + 全 IP（否则整条变成“全匹配”）
    NSString *host = [[domain ?: @"" stringByTrimmingCharactersInSet:
                       [NSCharacterSet whitespaceAndNewlineCharacterSet]] copy];
    if (host.length == 0) {
        DDLogError(@"Empty host in traffic rule, dropped");
        free(rule);
        return NULL;
    }

    {
        struct ip_mask_range_info iprange;
        memset(&iprange, 0, sizeof(struct ip_mask_range_info));

        const BOOL looksLikeCIDR = ([host rangeOfString:@"/"].location != NSNotFound);
        if ( is_set_ip_mask_range_with_str(&iprange, [host UTF8String]) )
        {
            rule->iprange = iprange;
            // IP/CIDR 规则：保持 domain="*"（init 默认），只按 IP 段匹配
            
            NSString *fromStr = [NSString stringWithFormat:@"%d.%d.%d.%d",
                                 rule->iprange.from[0], rule->iprange.from[1], rule->iprange.from[2], rule->iprange.from[3]];
            NSString *toStr = [NSString stringWithFormat:@"%d.%d.%d.%d",
                               rule->iprange.to[0], rule->iprange.to[1], rule->iprange.to[2], rule->iprange.to[3]];
            DDLogInfo(@"rule->iprange: %@-%@ (mask=%d)", fromStr, toStr, rule->iprange.mask);
        }
        else if (looksLikeCIDR)
        {
            // 无效 CIDR 不可回退成域名（否则 iprange 仍为全匹配，行为不可预期）
            DDLogError(@"Invalid CIDR host rule dropped: %@", host);
            free(rule);
            return NULL;
        }
        else
        {
            NSString *normalized = [self normalizeDomain:host];
            if ([normalized length] == 0) {
                free(rule);
                return NULL;
            }
            // strlcpy 保证 NUL 结尾（strncpy 在超长时不会写 '\0'）
            strlcpy(rule->domain, [normalized UTF8String], DOMANAME_SIZE);
        }
    }

    //当前下发的规则中没有配置areas和ISPs，将该位置设置为 全部
    // 如果 areas 为空或 nil，设置为 "全部"
    if (areas == nil || [areas count] == 0)
    {
        areas = @[@(AREA_ANY_RULE)];
    }

    // 如果 ISPs 为空或 nil，设置为 "全部"
    if (ISPs == nil || [ISPs count] == 0)
    {
        ISPs = @[@(ISP_ANY_RULE)];
    }

    // 填充 area_ids 数组（仅接受 NSNumber，避免 NSNull 等崩溃）
    NSInteger numAreaIds = 0;
    for (id areaObj in areas) {
        if (numAreaIds >= RANGE_IDS_COUNT - 1) {
            break;
        }
        if (![areaObj isKindOfClass:[NSNumber class]]) {
            DDLogWarn(@"Skip non-number area id: %@", areaObj);
            continue;
        }
        rule->ipranges.area_ids[numAreaIds++] = (uint16_t)[areaObj integerValue];
    }
    if (numAreaIds == 0) {
        rule->ipranges.area_ids[numAreaIds++] = AREA_ANY_RULE;
    }
    rule->ipranges.area_ids[numAreaIds] = AREA_ISP_RULE_END_ID;

    // 填充 isp_ids 数组
    NSInteger numISPIds = 0;
    for (id ispObj in ISPs) {
        if (numISPIds >= RANGE_IDS_COUNT - 1) {
            break;
        }
        if (![ispObj isKindOfClass:[NSNumber class]]) {
            DDLogWarn(@"Skip non-number isp id: %@", ispObj);
            continue;
        }
        rule->ipranges.isp_ids[numISPIds++] = (uint16_t)[ispObj integerValue];
    }
    if (numISPIds == 0) {
        rule->ipranges.isp_ids[numISPIds++] = ISP_ANY_RULE;
    }
    rule->ipranges.isp_ids[numISPIds] = AREA_ISP_RULE_END_ID;
    
    // port range
    NSString *portTrimmed = [portString stringByTrimmingCharactersInSet:
                             [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if ( !portTrimmed || [portTrimmed length] == 0 || [portTrimmed isEqualToString:@"*"] ) {
        // keep 0-65535
    }
    else if ( [portTrimmed containsString:@"-"] ) {
        NSArray *ports = [portTrimmed componentsSeparatedByString:@"-"];
        if (ports.count != 2) {
            DDLogError(@"Invalid port range dropped: %@", portString);
            free(rule);
            return NULL;
        }
        NSString *fromStr = [ports[0] stringByTrimmingCharactersInSet:
                             [NSCharacterSet whitespaceAndNewlineCharacterSet]];
        NSString *toStr = [ports[1] stringByTrimmingCharactersInSet:
                           [NSCharacterSet whitespaceAndNewlineCharacterSet]];
        // 拒绝 "80abc" 这类 integerValue 静默截断
        NSCharacterSet *nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
        if (fromStr.length == 0 || toStr.length == 0 ||
            [fromStr rangeOfCharacterFromSet:nonDigits].location != NSNotFound ||
            [toStr rangeOfCharacterFromSet:nonDigits].location != NSNotFound) {
            DDLogError(@"Invalid port range digits dropped: %@", portString);
            free(rule);
            return NULL;
        }
        NSInteger from = [fromStr integerValue];
        NSInteger to = [toStr integerValue];
        // 非法区间不能静默变成全端口
        if (from < 0 || to < 0 || from > 65535 || to > 65535 || from > to) {
            DDLogError(@"Invalid port range bounds dropped: %@", portString);
            free(rule);
            return NULL;
        }
        rule->portrange.from = (uint16_t)from;
        rule->portrange.to = (uint16_t)to;
    }
    else {
        NSCharacterSet *nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
        if ([portTrimmed rangeOfCharacterFromSet:nonDigits].location != NSNotFound) {
            DDLogError(@"Invalid port dropped: %@", portString);
            free(rule);
            return NULL;
        }
        NSInteger port = [portTrimmed integerValue];
        if (port <= 0 || port > 65535) {
            DDLogError(@"Invalid port dropped: %@", portString);
            free(rule);
            return NULL;
        }
        rule->portrange.from = (uint16_t)port;
        rule->portrange.to = (uint16_t)port;
    }
    
    
    return rule;
}

- (void)buildRulesWithSpeedInfo:(K1M_SPEED_START_INFO *)info
{
    if (!info) {
        DDLogError(@"buildRulesWithSpeedInfo: info is nil");
        return;
    }
    K1M_SPEED_START_INFO *speedInfo = info;

    // P0：全局规则链表跨隧道重启会累积，重建前必须清空
    del_dns_rule_list();
    del_black_rule_list();
    del_white_rule_list();
    del_http_rule_list();
    
    // DNS
    for ( K1M_DNS_RULE *eachRule in [speedInfo.dns_rule_info reverseObjectEnumerator] ) {
        if (![eachRule.server isKindOfClass:[NSString class]] || eachRule.server.length == 0) {
            DDLogError(@"DNS rule skipped: invalid server");
            continue;
        }
        for ( NSString *eachDomain in [eachRule.domain reverseObjectEnumerator] ) {
            if (![eachDomain isKindOfClass:[NSString class]]) {
                continue;
            }
            NSString *normDomain = [self normalizeDomain:eachDomain];
            if (normDomain.length == 0) {
                continue;
            }
            
            struct dns_rule_info *rule = init_dns_rule_info([normDomain UTF8String], [eachRule.server UTF8String]);
            if (!rule) {
                DDLogError(@"DNS rule skipped: domain=%@ server=%@", eachDomain, eachRule.server);
                continue;
            }
            rule->flow.id = [eachRule.traffic_id integerValue];
            add_dns_rule_list(rule);

#if DEBUG_PRINT_RULE_ADD
            char buff[256];
            NSString *ruleStr = [NSString stringWithCString:get_dns_rule_string(rule, buff, 256)
                                                   encoding:NSASCIIStringEncoding];
            LOG_Info(@"+D %@", ruleStr);
#endif
        }
    }
    
    // 黑名单
    for ( K1M_TRAFFIC_RULE *eachRule in [speedInfo.blacklist reverseObjectEnumerator] ) {
        if (![eachRule.protocol isKindOfClass:[NSString class]]) {
            continue;
        }
        NSArray *protocols = [eachRule.protocol componentsSeparatedByString:@","];

        for ( NSString *eachProtocol in protocols ) {
            struct traffic_rule_info *rule = [self createTrafficRuleWithProcess:eachRule.process
                                                                  protocol:eachProtocol
                                                                    domain:eachRule.host
                                                                     areas:eachRule.destination_area_id
                                                                      ISPs:eachRule.destination_isp_id
                                                                      port:eachRule.port];
            
            if ( rule != NULL ) {
                add_black_rule_list(rule);
#if DEBUG_PRINT_RULE_ADD
                char buff[256];
                NSString *ruleStr = [NSString stringWithCString:get_traffic_rule_string(rule, buff, 256)
                                                       encoding:NSASCIIStringEncoding];
                LOG_Info(@"+B %@", ruleStr);
#endif
            }

        }
    }
    
    // 白名单
    for ( K1M_TRAFFIC_GROUP *eachGroup in [speedInfo.vni_array reverseObjectEnumerator] ) {
        for ( K1M_TRAFFIC_RULE *eachRule in eachGroup.dest ) {
            if (![eachRule.protocol isKindOfClass:[NSString class]]) {
                continue;
            }
            NSArray *protocols = [eachRule.protocol componentsSeparatedByString:@","];
            
            for ( NSString *eachProtocol in protocols ) {
                struct traffic_rule_info *rule = [self createTrafficRuleWithProcess:eachRule.process
                                                                      protocol:eachProtocol
                                                                        domain:eachRule.host
                                                                         areas:eachRule.destination_area_id
                                                                          ISPs:eachRule.destination_isp_id
                                                                          port:eachRule.port];
                
                if ( rule != NULL ) {
                    rule->flow.id = [eachRule.traffic_id integerValue];
                    add_white_rule_list(rule);
#if DEBUG_PRINT_RULE_ADD
                    char buff[256];
                    NSString *ruleStr = [NSString stringWithCString:get_traffic_rule_string(rule, buff, 256)
                                                           encoding:NSASCIIStringEncoding];
                    LOG_Info(@"+W %@", ruleStr);
#endif
                }
            }
        }
    }
}

@end
