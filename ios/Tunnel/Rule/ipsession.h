//
//  ipsession.h
//  
//
//  Created by ZL on 22/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#include "ruleheader.h"
#include "ippacket.h"

#ifdef __cplusplus
extern "C" {
#endif
    
#define DIRECTION_UN    0
#define DIRECTION_IN    1
#define DIRECTION_OUT   2

struct ip_session_info {
    int8_t direction;
    struct ip_packet_info packet;
    bool is_dns;
    char domain[DOMANAME_SIZE];  // 如果是 DNS Query 则是 Query Domain
    uint32_t flow_group;
    uint16_t isp_id;
    uint16_t area_id;
};
    
int get_ipsession_info(struct ip_session_info *session, const uint8_t *data, size_t len, const int8_t direction);
    
#ifdef __cplusplus
}
#endif
