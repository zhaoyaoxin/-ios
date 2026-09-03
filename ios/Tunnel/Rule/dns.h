//
//  dns.h
//
//  Created by ZL on 23/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include <stdlib.h>
#include "queue.h"
#include "ippacket.h"

#ifdef __cplusplus
extern "C" {
#endif
    
/* DNS查询数据 */
struct dns_data_info {
    // DNS查询id
    uint16_t id;
    // DNS查询的内网地址, 和id字段确定唯一的一个DNS查询
    uint32_t saddr;
    // DNS查询中原始的目的地址, 在收到DNS查询回报以后将包改为原始的目的地址
    uint32_t daddr;
    
    LIST_ENTRY(dns_data_info) entry;
};

// Thread Safe
void add_dns_data(uint32_t saddr, uint32_t daddr, uint16_t id);
uint32_t del_dns_data(uint32_t saddr, uint16_t id);

// 确保是 DNS Packet，由于性能原因该函数不会做 DNS Packet 检查
bool process_dns_query(uint32_t naddr, uint8_t *packet, size_t len);
bool process_dns_answer(uint8_t *packet, size_t len, bool record_ip_domain);

// Thread Safe
void domain_from_ip(uint32_t addr, char *domain, size_t domain_size);
void add_to_ip_for_domain_list(uint32_t addr, const char *domain, size_t domain_size);
void clear_ip_for_domain_list(void);
int get_ip_for_domain_from_dns_answer(uint8_t *packet, size_t len);
    
#ifdef __cplusplus
}
#endif

