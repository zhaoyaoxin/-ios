//
//  rules.h
//  
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//


#pragma once

#include "queue.h"
#include "ruleheader.h"
#include "iprange_list.h"
#include "ippacket.h"
#include "ipsession.h"

#ifdef __cplusplus
extern "C" {
#endif
    
#define RANGE_IDS_COUNT 64
    
struct rule_flow_info {
    uint64_t id;
    uint16_t offset;
    uint16_t level;
};

struct dns_rule_info {
    uint64_t id;
    struct rule_flow_info flow;
    char domain[DOMANAME_SIZE];
    uint32_t server_addr_net;
    
    LIST_ENTRY(dns_rule_info) entry;
};
    
struct port_range_info {
    uint16_t from;
    uint16_t to;
};

struct ip_mask_range_info {
    uint8_t from[4];
    uint8_t to[4];
    uint8_t mask;
};

struct traffic_rule_info {
    uint64_t id;
    struct rule_flow_info flow;
    char domain[DOMANAME_SIZE];
    char procname[PROCNAME_SIZE_MAX];
    protocol_t protocol;
    
    struct {
        uint16_t area_ids[RANGE_IDS_COUNT];
        uint16_t isp_ids[RANGE_IDS_COUNT];
    } ipranges;
    
    struct ip_mask_range_info iprange;
    struct port_range_info portrange;
    
    LIST_ENTRY(traffic_rule_info) entry;
};
    
bool is_set_ip_mask_range_with_str(struct ip_mask_range_info *range, const char *str);
bool check_empty_ip_mask_range(struct ip_mask_range_info *range);
bool check_ip_in_ip_mask_range(uint32_t addr_net, struct ip_mask_range_info *iprange);
    
struct traffic_rule_info *init_all_matched_traffic_rule_info(void);
struct dns_rule_info *init_dns_rule_info(const char *domain, const char *server);
    
void add_dns_rule_list(struct dns_rule_info *rule);
void add_black_rule_list(struct traffic_rule_info *rule);
void add_white_rule_list(struct traffic_rule_info *rule);
void add_http_rule_list(struct traffic_rule_info *rule);
    
void del_dns_rule_list(void);
void del_black_rule_list(void);
void del_white_rule_list(void);
void del_http_rule_list(void);
    
bool check_session_match_traffic_rule(struct ip_session_info *session, struct traffic_rule_info *rule);
bool check_session_match_black_rule(struct ip_session_info *session, struct traffic_rule_info *rule);
bool check_session_match_white_rule(struct ip_session_info *session, struct traffic_rule_info *rule);
bool check_session_match_http_rule(struct ip_session_info *session, struct traffic_rule_info *rule);
bool check_domain_match_dns_rule(const char *domain, struct dns_rule_info *rule);
    
const char *get_traffic_rule_string(const struct traffic_rule_info *rule, char *buf, size_t n);
const char *get_dns_rule_string(const struct dns_rule_info *rule, char *buf, size_t n);
    
#ifdef __cplusplus
}
#endif
