//
//  rules.c
//  
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "rules.h"
#include "utils.h"
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <arpa/inet.h>
#include <stdio.h>
#include <stdlib.h>

static LIST_HEAD(, dns_rule_info) dnsrules;
static LIST_HEAD(, traffic_rule_info) blackrules;
static LIST_HEAD(, traffic_rule_info) whiterules;
static LIST_HEAD(, traffic_rule_info) httprules;

static int ip_convert_helper(const char *str, uint8_t *ipn)
{
    if (!str || !ipn)
        return -1;
    if (strlen(str) > 15)
        return -1;
    if (is_likely_a_domain_name(str))
        return -1;
    
    char buf[32];
    strlcpy(buf, str, sizeof buf);
    char *save = NULL;
    
    for (int i = 0; i < 4; i++) {
        // 首次传 buf，后续传 NULL（避免 strtok_r(NULL) 首调未定义行为）
        const char *s = strtok_r(i == 0 ? buf : NULL, ".", &save);
        if (!s)
            return -1;
        if (*s == '*')
            return i;
        
        char *end = NULL;
        // 强制十进制，避免 "08"/"010" 被按八进制解析
        long v = strtol(s, &end, 10);
        if (end == s || *end != '\0' || v < 0 || v > 255)
            return -1;
        ipn[i] = (uint8_t)v;
    }
    
    return 4;
}

static bool is_set_ip_mask_range_with_cidr(struct ip_mask_range_info *range, const char *ips)
{
    char buf[64] = {0};
    strlcpy(buf, ips, sizeof(buf));

    // trim leading/trailing whitespace
    char *start = buf;
    while (*start && isspace((unsigned char)*start)) {
        start++;
    }
    if (*start == '\0') {
        return false;
    }
    char *endws = start + strlen(start);
    while (endws > start && isspace((unsigned char)*(endws - 1))) {
        *--endws = '\0';
    }

    char *slash = strchr(start, '/');
    if (!slash || slash == start || *(slash + 1) == '\0') {
        return false;
    }
    *slash = '\0';

    // trim spaces around '/'
    char *ip_end = slash;
    while (ip_end > start && isspace((unsigned char)*(ip_end - 1))) {
        *--ip_end = '\0';
    }
    char *prefix_str = slash + 1;
    while (*prefix_str && isspace((unsigned char)*prefix_str)) {
        prefix_str++;
    }

    char *end = NULL;
    long prefix = strtol(prefix_str, &end, 10);
    if (end == prefix_str || (end && *end != '\0') || prefix < 0 || prefix > 32) {
        return false;
    }
    if (*start == '\0') {
        return false;
    }

    uint8_t ip[4] = {0};
    if (ip_convert_helper(start, ip) != 4) {
        return false;
    }

    // 校验每个 octet 在 0..255（strtol 截断成 uint8 会静默错误）
    {
        char tmp[32];
        strlcpy(tmp, start, sizeof(tmp));
        char *save = NULL;
        for (int i = 0; i < 4; i++) {
            const char *s = strtok_r(i == 0 ? tmp : NULL, ".", &save);
            if (!s) {
                return false;
            }
            char *oct_end = NULL;
            long v = strtol(s, &oct_end, 10);
            if (oct_end == s || *oct_end != '\0' || v < 0 || v > 255) {
                return false;
            }
        }
    }

    uint32_t addr = ((uint32_t)ip[0] << 24) | ((uint32_t)ip[1] << 16) |
                    ((uint32_t)ip[2] << 8) | (uint32_t)ip[3];
    uint32_t netmask = (prefix == 0) ? 0u : (0xFFFFFFFFu << (32 - (int)prefix));
    uint32_t network = addr & netmask;
    uint32_t broadcast = network | ~netmask;

    range->from[0] = (uint8_t)((network >> 24) & 0xff);
    range->from[1] = (uint8_t)((network >> 16) & 0xff);
    range->from[2] = (uint8_t)((network >> 8) & 0xff);
    range->from[3] = (uint8_t)(network & 0xff);
    range->to[0] = (uint8_t)((broadcast >> 24) & 0xff);
    range->to[1] = (uint8_t)((broadcast >> 16) & 0xff);
    range->to[2] = (uint8_t)((broadcast >> 8) & 0xff);
    range->to[3] = (uint8_t)(broadcast & 0xff);
    range->mask = 4;
    return true;
}

bool is_set_ip_mask_range_with_str(struct ip_mask_range_info *range, const char *ips)
{
    if ( !ips || strlen(ips) >= 64 || strlen(ips) == 0 ) {
        return false;
    }
    
    if ( is_likely_a_domain_name(ips) ) {
        return false;
    }

    // CIDR: 1.2.3.0/24 （须在按 '-' 拆分之前处理）
    if (strchr(ips, '/') != NULL) {
        return is_set_ip_mask_range_with_cidr(range, ips);
    }
    
    char ip1[DOMANAME_SIZE * 4] = {0};
    char ip2[32] = {0};
    
    char *p, *tofree;
    tofree = p = strdup(ips);
    if (!tofree) {
        return false;
    }
    strlcpy(ip1, strsep(&p, "-"), sizeof ip1);
    strlcpy(ip2, p ? p : "", sizeof ip2);
    free(tofree);
    
    int ret = ip_convert_helper(ip1, range->from);
    if ( ret == -1 ) {
        return false;
    }
    
    if ( ret == 4 && ip2[0] ) {
        ret = ip_convert_helper(ip2, range->to);
        if ( ret != 4 ) {
            return false;
        }
        range->mask = 4;
    }
    else {
        range->mask = (uint8_t)ret;
        memcpy(range->to, range->from, sizeof range->from);
    }
    
    if ( ret == 0 && 0 == strcmp(ip1, "*") ) {
        memset(range->from, 0x00, sizeof range->from);
        memset(range->to, 0xff, sizeof range->to);
        range->mask = 4;
    }

    // 完整起止 IP 时拒绝 from > to（否则匹配恒失败或行为难预期）
    if (range->mask == 4) {
        uint32_t from_h = ((uint32_t)range->from[0] << 24) | ((uint32_t)range->from[1] << 16) |
                          ((uint32_t)range->from[2] << 8) | (uint32_t)range->from[3];
        uint32_t to_h = ((uint32_t)range->to[0] << 24) | ((uint32_t)range->to[1] << 16) |
                        ((uint32_t)range->to[2] << 8) | (uint32_t)range->to[3];
        if (from_h > to_h) {
            return false;
        }
    }
    
    return true;
}

// 域名规范化拷贝：去首尾空白、转小写、去掉尾部 '.'（FQDN）
static void domain_copy_lower(char *dst, size_t dst_size, const char *src)
{
    size_t j = 0;
    if (!dst || dst_size == 0) {
        return;
    }
    if (!src) {
        dst[0] = '\0';
        return;
    }

    while (*src && isspace((unsigned char)*src)) {
        src++;
    }

    for (; *src != '\0' && (j + 1) < dst_size; src++) {
        dst[j++] = (char)tolower((unsigned char)*src);
    }
    dst[j] = '\0';

    while (j > 0 && isspace((unsigned char)dst[j - 1])) {
        dst[--j] = '\0';
    }
    while (j > 0 && dst[j - 1] == '.') {
        dst[--j] = '\0';
    }
}

static bool domain_matches_pattern(const char *domain, const char *rule_domain)
{
    char d[DOMANAME_SIZE];
    char p[DOMANAME_SIZE];

    if (!domain || !rule_domain) {
        return false;
    }

    domain_copy_lower(d, sizeof(d), domain);
    domain_copy_lower(p, sizeof(p), rule_domain);

    if (strcmp(p, "*") == 0 || strcmp(p, "*.*") == 0) {
        return true;
    }

    size_t plen = strlen(p);
    if (plen >= 2 && strncmp(p, "*.", 2) == 0) {
        const char *base = p + 2;
        size_t blen = strlen(base);
        size_t dlen = strlen(d);

        if (blen == 0) {
            return false;
        }
        // 裸域：aa.com
        if (strcmp(d, base) == 0) {
            return true;
        }
        // 子域：须以 ".aa.com" 结尾，避免 CCAA.COM 误匹配
        if (dlen > blen + 1 &&
            d[dlen - blen - 1] == '.' &&
            strcmp(d + (dlen - blen), base) == 0) {
            return true;
        }
        return false;
    }

    // 精确域名：忽略大小写全等
    return strcmp(d, p) == 0;
}

struct traffic_rule_info *init_all_matched_traffic_rule_info(void)
{
    struct traffic_rule_info *rule = (struct traffic_rule_info *)malloc(sizeof(struct traffic_rule_info));
    if (!rule) {
        return NULL;
    }
    memset(rule, 0, sizeof(struct traffic_rule_info));
    strlcpy(rule->domain, "*", DOMANAME_SIZE);
    strlcpy(rule->procname, "*", PROCNAME_SIZE_MAX);
    
    rule->protocol = PROTO_ANY; // all protocols

    // all range
    memset(rule->iprange.from, 0x00, sizeof rule->iprange.from);
    memset(rule->iprange.to, 0xff, sizeof rule->iprange.to);
    rule->iprange.mask = 4;
    
    // all port
    rule->portrange.from = 0;
    rule->portrange.to = 65535;
    
    // all area / isp，并写入结束标记，避免后续 0 被当成合法 id
    rule->ipranges.area_ids[0] = AREA_ANY_RULE;
    rule->ipranges.area_ids[1] = AREA_ISP_RULE_END_ID;
    rule->ipranges.isp_ids[0] = ISP_ANY_RULE;
    rule->ipranges.isp_ids[1] = AREA_ISP_RULE_END_ID;
    
    return rule;
}

struct dns_rule_info *init_dns_rule_info(const char *domain, const char *server)
{
    struct dns_rule_info *rule = (struct dns_rule_info *)malloc(sizeof(struct dns_rule_info));
    if (!rule) {
        return NULL;
    }
    memset(rule, 0, sizeof(struct dns_rule_info));
    // 保证 NUL 结尾，并统一小写 / 去尾点
    domain_copy_lower(rule->domain, DOMANAME_SIZE, domain ? domain : "");
    if (rule->domain[0] == '\0') {
        free(rule);
        return NULL;
    }

    if (!server || server[0] == '\0') {
        free(rule);
        return NULL;
    }
    // 拒绝非法 DNS IP（inet_addr 失败会得到 INADDR_NONE=255.255.255.255）
    struct in_addr addr;
    if (inet_aton(server, &addr) == 0) {
        free(rule);
        return NULL;
    }
    rule->server_addr_net = addr.s_addr;
    return rule;
}

void add_dns_rule_list(struct dns_rule_info *rule)
{
    if (!rule) {
        return;
    }

    LIST_INSERT_HEAD(&dnsrules, rule, entry);
}

void add_black_rule_list(struct traffic_rule_info *rule)
{
    if (!rule) {
        return;
    }
    
    LIST_INSERT_HEAD(&blackrules, rule, entry);
}

void add_white_rule_list(struct traffic_rule_info *rule)
{
    if (!rule) {
        return;
    }

    LIST_INSERT_HEAD(&whiterules, rule, entry);
}

void add_http_rule_list(struct traffic_rule_info *rule)
{
    if (!rule) {
        return;
    }
    
    LIST_INSERT_HEAD(&httprules, rule, entry);
}

void del_dns_rule_list(void)
{
    struct dns_rule_info *var, *tvar;
    LIST_FOREACH_SAFE(var, &dnsrules, entry, tvar) {
        LIST_REMOVE(var, entry);
        free(var);
    }
}

void del_black_rule_list(void)
{
    struct traffic_rule_info *var, *tvar;
    LIST_FOREACH_SAFE(var, &blackrules, entry, tvar) {
        LIST_REMOVE(var, entry);
        free(var);
    }
}

void del_white_rule_list(void)
{
    struct traffic_rule_info *var, *tvar;
    LIST_FOREACH_SAFE(var, &whiterules, entry, tvar) {
        LIST_REMOVE(var, entry);
        free(var);
    }
}

void del_http_rule_list(void)
{
    struct traffic_rule_info *var, *tvar;
    LIST_FOREACH_SAFE(var, &httprules, entry, tvar) {
        LIST_REMOVE(var, entry);
        free(var);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////

bool check_empty_ip_mask_range(struct ip_mask_range_info *range)
{
    struct ip_mask_range_info empty_range;
    memset(&empty_range, 0, sizeof(struct ip_mask_range_info));
    return memcmp(range, &empty_range, sizeof(struct ip_mask_range_info));
}

bool check_ip_in_ip_mask_range(uint32_t addr_net, struct ip_mask_range_info *iprange)
{
    int ip_hit = 0;
    for ( int j = 0; j < iprange->mask; j++ ) {
        uint8_t n = ((uint8_t *)&(addr_net))[j];
        if (n >= iprange->from[j] && n <= iprange->to[j]) {
            ip_hit++;
        } else {
            break;
        }
    }
    
    return ( ip_hit == iprange->mask );
}

bool is_isp_area_match_traffic_rule(int16_t isp, int16_t area, struct traffic_rule_info *rule)
{
    // Area and ISP
    bool match_area = false;
    bool match_isp = false;
    
    // ISP
    for ( int i = 0; i < RANGE_IDS_COUNT; i ++ )
    {
        uint16_t isp_id = rule->ipranges.isp_ids[i];
        
        if ( isp_id == AREA_ISP_RULE_END_ID)
        {
            break;
        }
        /*
        if ( isp_id == 0 )
        {
            break;
        }
        */
        
        if ( isp_id == ISP_ANY_RULE ) {
            match_isp = true;
            break;
        }
        
        if ( isp_id == isp ) {
            match_isp = true;
            break;
        }
    }
    
    if ( !match_isp ) {
        goto notmatch;
    }
    
    // Area
    for ( int i = 0; i < RANGE_IDS_COUNT; i ++ )
    {
        uint16_t area_id = rule->ipranges.area_ids[i];
        if ( area_id == AREA_ISP_RULE_END_ID)
        {
            break;
        }
        /*
        if ( area_id == 0 )
        {
            break;
        }
        */
        
        if ( area_id == AREA_ANY_RULE ) {
            match_area = true;
            break;
        }
        
        if ( area_id == area ) {
            match_area = true;
            break;
        }
    }
    
    if ( !match_area ) {
        goto notmatch;
    }

    return true;
    
notmatch:
    return false;
}

bool check_session_match_traffic_rule(struct ip_session_info *session, struct traffic_rule_info *rule)
{
    bool match_protocol = false;
    
    // Protocol
    protocol_t protocol = rule->protocol;
    
    if (protocol == PROTO_ANY ||
        protocol == session->packet.protocol) {
        match_protocol = true;
    }
    
    if (!match_protocol) {
        goto notmatch;
    }
    
    uint16_t port = ntohs(session->packet.dst_port_ip);
    bool match_port = (port >= rule->portrange.from && port <= rule->portrange.to);
    
    if (!match_port) {
        goto notmatch;
    }
    
    bool match_ip_range = check_ip_in_ip_mask_range(session->packet.dst_addr_ip, &rule->iprange);
    
    if (!match_ip_range) {
        goto notmatch;
    }
    
    bool match_ranges = is_isp_area_match_traffic_rule(session->isp_id,
                                                       session->area_id,
                                                       rule);
    //当前版本不根据isp_area做判断，不跳出
    if (!match_ranges)
    {
        //goto notmatch;
    }

    // Domain：忽略大小写；*.base 含裸域与子域，防 CCAA.COM 类误匹配
    bool match_domain = domain_matches_pattern(session->domain, rule->domain);
    
    if (!match_domain) {
        goto notmatch;
    }
    
    // Process，当前规则设置是配置进程必须为*
    bool match_process = (strcmp(rule->procname, "*") == 0);
    
    if (!match_process) {
        goto notmatch;
    }
    
    return true;
    
notmatch:
    return false;
}

bool check_session_match_black_rule(struct ip_session_info *session, struct traffic_rule_info *rule)
{
    bool ret = false;
    
    struct traffic_rule_info *var;
    LIST_FOREACH(var, &blackrules, entry) {
        if ( check_session_match_traffic_rule(session, var) ) {
            if ( rule ) {
                memcpy(rule, var, sizeof(struct traffic_rule_info));
            }
            ret = true;
            break;
        }
    }
    
    return ret;
}

bool check_session_match_white_rule(struct ip_session_info *session, struct traffic_rule_info *rule)
{
    bool ret = false;
    
    struct traffic_rule_info *var;
    LIST_FOREACH(var, &whiterules, entry) {
        if ( check_session_match_traffic_rule(session, var) ) {
            if ( rule ) {
                memcpy(rule, var, sizeof(struct traffic_rule_info));
            }
            ret = true;
            break;
        }
    }
    
    return ret;
}

bool check_session_match_http_rule(struct ip_session_info *session, struct traffic_rule_info *rule)
{
    bool ret = false;
    
    struct traffic_rule_info *var;
    LIST_FOREACH(var, &httprules, entry) {
        if ( check_session_match_traffic_rule(session, var) ) {
            if ( rule ) {
                memcpy(rule, var, sizeof(struct traffic_rule_info));
            }
            ret = true;
            break;
        }
    }
    
    return ret;
}

bool check_domain_match_dns_rule(const char *domain, struct dns_rule_info *rule)
{
    if (!domain) {
        return false;
    }

    bool ret = false;

    struct dns_rule_info *var;
    LIST_FOREACH(var, &dnsrules, entry)
    {
        if (!domain_matches_pattern(domain, var->domain)) {
            continue;
        }
        if (rule) {
            memcpy(rule, var, sizeof(struct dns_rule_info));
        }
        ret = true;
        break;
    }
    
    return ret;
}

const char *get_traffic_rule_string(const struct traffic_rule_info *rule, char *buf, size_t n)
{
    char areas[256] = {0};
    char isps[256] = {0};
    
    for ( int i = 0; i < RANGE_IDS_COUNT; i ++ ) {
        uint16_t area_id = rule->ipranges.area_ids[i];
        
        if ( area_id == AREA_NONE_RULE ) {
            break;
        }
        
        if ( area_id == AREA_ANY_RULE ) {
            areas[0] = '*';
            break;
        }
        
        char id_str[20];
        sprintf(id_str, "%d ", area_id);
        strcat(areas, id_str);
    }
    
    for ( int i = 0; i < RANGE_IDS_COUNT; i ++ ) {
        uint16_t isp_id = rule->ipranges.isp_ids[i];
        
        if ( isp_id == AREA_NONE_RULE ) {
            break;
        }
        
        if ( isp_id == ISP_ANY_RULE ) {
            isps[0] = '*';
            break;
        }
        
        char id_str[20];
        sprintf(id_str, "%d ", isp_id);
        strcat(isps, id_str);
    }

    snprintf(buf, n, "[%s] [%s] [%d.%d.%d.%d - %d.%d.%d.%d  %d] [%d - %d] %s [area: %s] [isp: %s]",
             rule->procname,
             rule->domain,
             rule->iprange.from[0],rule->iprange.from[1],rule->iprange.from[2],rule->iprange.from[3],
             rule->iprange.to[0],rule->iprange.to[1],rule->iprange.to[2],rule->iprange.to[3],
             rule->iprange.mask,
             rule->portrange.from, rule->portrange.to,
             protocol_2_string(rule->protocol),
             areas,
             isps);

    return buf;
}

const char *get_dns_rule_string(const struct dns_rule_info *rule, char *buf, size_t n)
{
    char ip[16];
    inet_ntop(AF_INET, &rule->server_addr_net, ip, sizeof(ip));
    snprintf(buf, n, "%s - %s flowId: %llu, flowlevel:%d",  rule->domain, ip, rule->flow.id, rule->flow.level);
    return buf;
}
