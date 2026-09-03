//
//  ip_packet.h
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

typedef uint16_t protocol_t;

#ifdef __cplusplus
extern "C" {
#endif

struct ip_packet_info {
    uint32_t dst_addr_ip;
    uint16_t dst_port_ip;
    protocol_t protocol;
    uint32_t src_addr_ip;
    uint16_t src_port_ip;
    uint16_t payload_length;
};

bool ippacket_desc_equal(const struct ip_packet_info *dst, const struct ip_packet_info *src);
int get_ippacket_info(struct ip_packet_info *packet, const uint8_t *data, size_t len);
    
const char *protocol_2_string(protocol_t protocol);
const char *ippacket_desc_string(const struct ip_packet_info *v, char *buf, size_t n);

    
#ifdef __cplusplus
}
#endif
