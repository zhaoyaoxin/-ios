//
//  dns.c
//
//  Created by ZL on 23/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "dns.h"
#include "utils.h"
#include "ruleheader.h"
#include <pthread.h>
#include <netinet/ip.h>
#include <netinet/udp.h>
#include <string.h>
#include <stdio.h>
#include <arpa/inet.h>  // 必须添加这个头文件来使用 inet_ntop



static LIST_HEAD(, dns_data_info) dns_data_info_list;
static pthread_mutex_t dns_lookup_lock  = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t ip2domain_lock   = PTHREAD_MUTEX_INITIALIZER;

void add_dns_data(uint32_t saddr, uint32_t daddr, uint16_t id)
{
    struct dns_data_info *data = (struct dns_data_info *)malloc(sizeof(struct dns_data_info));
    if (!data)
        return;
    
    data->saddr = saddr;
    data->daddr = daddr;
    data->id = id;
    pthread_mutex_lock(&dns_lookup_lock);
    LIST_INSERT_HEAD(&dns_data_info_list, data, entry);
    pthread_mutex_unlock(&dns_lookup_lock);
}

uint32_t del_dns_data(uint32_t saddr, uint16_t id) {
    uint32_t daddr = 0;
    struct dns_data_info *var, *tvar;
    
    pthread_mutex_lock(&dns_lookup_lock);
    LIST_FOREACH_SAFE(var, &dns_data_info_list, entry, tvar) {
        if ((var->saddr == saddr) && (var->id == id)) {
            daddr = var->daddr;
            LIST_REMOVE(var, entry);
            free(var);
            break;
        }
    }
    pthread_mutex_unlock(&dns_lookup_lock);
    
    return daddr;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// 添加DNS包验证函数
static bool is_valid_dns_packet(uint8_t *packet, size_t len) {
    // 基本长度检查
    if (len < sizeof(struct ip) + sizeof(struct udphdr) + 12) { // DNS头部至少12字节
        return false;
    }
    
    struct ip *iphdr = (struct ip *)packet;
    if (iphdr->ip_v != 4) { // 只支持IPv4
        return false;
    }
    
    int ip_hl = iphdr->ip_hl << 2;
    if (ip_hl < sizeof(struct ip) || ip_hl > len) {
        return false; // 无效的IP头部长度
    }
    
    struct udphdr *udphdr = (struct udphdr *)(packet + ip_hl);
    uint16_t udp_len = ntohs(udphdr->uh_ulen);
    if (udp_len < sizeof(struct udphdr) + 12 ||
        udp_len > len - ip_hl) {
        return false; // 无效的UDP长度
    }
    
    // 检查DNS头部
    const uint8_t *dns_data = packet + ip_hl + sizeof(struct udphdr);
    uint16_t flags = ntohs(*(uint16_t *)(dns_data + 2));
    uint16_t qdcount = ntohs(*(uint16_t *)(dns_data + 4));
    
    // 检查是否为查询包（非响应）
    if ((flags & 0x8000) != 0) {
        return false;
    }
    
    // 至少有一个问题
    if (qdcount == 0) {
        return false;
    }
    
    return true;
}

bool process_dns_query(uint32_t naddr, uint8_t *packet, size_t len)
{
    // 添加DNS包验证
    if (!is_valid_dns_packet(packet, len)) {
        return false;
    }
    
    const uint8_t *bytes = packet;
    const size_t length = len;
    
    struct ip *iphdr = (struct ip *)bytes;
    int32_t daddr = iphdr->ip_dst.s_addr;
    iphdr->ip_dst.s_addr = naddr;
    const int ip_hl = iphdr->ip_hl << 2;

    struct udphdr *udp = (struct udphdr *) (bytes + ip_hl);
    size_t udp_length = length - ip_hl;
    udp->uh_sum = 0;
    udp->uh_sum = udp_checksum_calc(bytes + ip_hl, udp_length, iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
    
    iphdr->ip_sum = 0;
    iphdr->ip_sum = cksum_ip((uint8_t *)iphdr, ip_hl);
    
    const uint8_t *dns_data = bytes + ip_hl + HEADER_LEN_UDP;
    uint16_t dns_id = *(uint16_t *)(dns_data);
    add_dns_data(iphdr->ip_src.s_addr, daddr, dns_id);
    
    return true;
}

bool process_dns_answer(uint8_t *packet, size_t len, bool record_ip_domain)
{
    // 添加DNS包验证 ，已经验证过 不做重复检查
    /*
    if (!is_valid_dns_packet(packet, len)) {
        return false;
    }
    */
    
    const uint8_t *bytes = packet;
    
    struct ip *iphdr = (struct ip *)bytes;
    const int ip_hl = iphdr->ip_hl << 2;
    
    const uint8_t *dns_data = bytes + ip_hl + HEADER_LEN_UDP;
    
    uint16_t dns_id = *(uint16_t *)(dns_data);
    uint32_t origin_addr = del_dns_data(iphdr->ip_dst.s_addr, dns_id);
    
    if ( origin_addr != 0 ) {
        iphdr->ip_src.s_addr = origin_addr;
        struct udphdr *udp = (struct udphdr *) (bytes + ip_hl);
        size_t udp_length = len - ip_hl;
        udp->uh_sum = 0;
        udp->uh_sum = udp_checksum_calc(bytes + ip_hl, udp_length, iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
        
        iphdr->ip_sum = 0;
        iphdr->ip_sum = cksum_ip((uint8_t *)iphdr, ip_hl);
    }

    if ( record_ip_domain ) {
        get_ip_for_domain_from_dns_answer(packet, len);
    }
    
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// 修改ip_to_domain_info结构，支持一个IP对应多个域名
struct ip_to_domain_info {
    uint32_t addr;
    char **domains;      // 支持多个域名
    int domain_count;    // 域名数量
    int domain_capacity; // 域名容量
    
    LIST_ENTRY(ip_to_domain_info) entry;
};

static LIST_HEAD(, ip_to_domain_info) ip_domain_list;

void domain_from_ip(uint32_t addr, char *domain, size_t domain_size) {
    if (!domain || domain_size <= 0)
        return;
    
    domain[0] = '\0';
    struct ip_to_domain_info *var = NULL;
    
    pthread_mutex_lock(&ip2domain_lock);
    LIST_FOREACH(var, &ip_domain_list, entry) {
        if (var->addr == addr && var->domain_count > 0) {
            // 返回第一个域名（或可实现更复杂的策略）
            strncpy(domain, var->domains[0], domain_size - 1);
            domain[domain_size - 1] = '\0';
            break;
        }
    }
    pthread_mutex_unlock(&ip2domain_lock);
}

void add_to_ip_for_domain_list(uint32_t addr, const char *domain, size_t domain_size) {
    if (!domain || domain_size <= 0)
        return;
    
    struct ip_to_domain_info *var = NULL;
    bool found = false;
    
    pthread_mutex_lock(&ip2domain_lock);
    LIST_FOREACH(var, &ip_domain_list, entry) {
        if (var->addr == addr) {
            found = true;
            break;
        }
    }
    
    // 如果IP已存在，添加域名到列表
    if (found && var) {
        // 检查域名是否已存在
        for (int i = 0; i < var->domain_count; i++) {
            if (strcmp(var->domains[i], domain) == 0) {
                pthread_mutex_unlock(&ip2domain_lock);
                return; // 域名已存在
            }
        }
        
        // 需要扩容
        if (var->domain_count >= var->domain_capacity) {
            int new_capacity = var->domain_capacity ? var->domain_capacity * 2 : 4;
            char **new_domains = (char **)realloc(var->domains, new_capacity * sizeof(char *));
            if (!new_domains) {
                pthread_mutex_unlock(&ip2domain_lock);
                return;
            }
            var->domains = new_domains;
            var->domain_capacity = new_capacity;
        }
        
        // 添加新域名
        var->domains[var->domain_count] = strdup(domain);
        if (var->domains[var->domain_count]) {
            var->domain_count++;
        }
    }
    // 如果IP不存在，创建新条目
    else {
        struct ip_to_domain_info *info = (struct ip_to_domain_info *)malloc(sizeof(struct ip_to_domain_info));
        if (!info) {
            pthread_mutex_unlock(&ip2domain_lock);
            return;
        }
        
        info->addr = addr;
        info->domain_capacity = 4;
        info->domain_count = 1;
        info->domains = (char **)malloc(info->domain_capacity * sizeof(char *));
        if (info->domains) {
            info->domains[0] = strdup(domain);
            if (!info->domains[0]) {
                free(info);
                pthread_mutex_unlock(&ip2domain_lock);
                return;
            }
        } else {
            free(info);
            pthread_mutex_unlock(&ip2domain_lock);
            return;
        }
        
        LIST_INSERT_HEAD(&ip_domain_list, info, entry);
    }
    
    pthread_mutex_unlock(&ip2domain_lock);
}

int get_ip_for_domain_from_dns_answer(uint8_t *packet, size_t len)
{
    const uint8_t *bytes = packet;
    
    struct ip *iphdr = (struct ip *)bytes;
    const int ip_hl = iphdr->ip_hl << 2;
    
    const uint8_t *udp_payload = bytes + ip_hl + HEADER_LEN_UDP;
    const size_t udp_payload_len = len - ip_hl - HEADER_LEN_UDP;
    
    char domain[DOMANAME_BUFF_SIZE] = {0};
    get_domain_from_dns_data(domain, udp_payload, udp_payload_len);
    
    //char ip_str[INET_ADDRSTRLEN];
    //struct in_addr ip_addr;
    
    uint32_t addrs[64] = {0};
    int cnt = get_ip_addrs_from_dns(addrs, udp_payload, udp_payload_len);
    for ( int i = 0; i < cnt; i ++ )
    {
        uint32_t addr = addrs[i];
        add_to_ip_for_domain_list(addr, domain, DOMANAME_SIZE);
    }
    return cnt;
}

void clear_ip_for_domain_list(void) {
    struct ip_to_domain_info *var, *tvar;
    pthread_mutex_lock(&ip2domain_lock);
    LIST_FOREACH_SAFE(var, &ip_domain_list, entry, tvar) {
        LIST_REMOVE(var, entry);
        for (int i = 0; i < var->domain_count; i++) {
            free(var->domains[i]);
        }
        free(var->domains);
        free(var);
    }
    pthread_mutex_unlock(&ip2domain_lock);
}
