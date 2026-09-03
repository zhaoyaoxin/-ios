//
//  utils.h
//  
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include "ruleheader.h"

#ifdef __cplusplus
extern "C" {
#endif

bool check_private_or_lo_ipv4_addr(const void *addr);
bool check_likely_dns_packet(const uint8_t *data, size_t len);
bool check_likely_a_dns_packet(const uint8_t *payload, size_t payload_len, bool query_true_resp_false);
unsigned short cksum_ip(uint8_t *ip, int len);
uint16_t udp_checksum_calc(const void *buff, size_t len, uint32_t src_addr_ip, uint32_t dest_addr_net);
uint16_t packet_checksum_calc(const void *buff, size_t len, uint32_t src_addr_ip, uint32_t dest_addr_net, uint16_t protocol);
void get_domain_from_dns_data(char *domain, const uint8_t *data, size_t len);
char *get_domain_from_dns_data_dynamic(const uint8_t *data, int len);
int get_ip_addrs_from_dns(uint32_t *addrs, const uint8_t *dns_data, size_t dns_len);
bool is_likely_a_domain_name(const char *str);

#ifdef __cplusplus
}
#endif
