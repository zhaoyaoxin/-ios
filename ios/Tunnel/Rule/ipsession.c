//
//  ipsession.c
//
//
//  Created by ZL on 22/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "ipsession.h"
#include "ruleheader.h"
#include <string.h>
#include <arpa/inet.h>
#include <netinet/ip.h>
#include "utils.h"
#include "dns.h"

int get_ipsession_info(struct ip_session_info *session, const uint8_t *data, size_t len, const int8_t direction)
{
    memset(session, 0, sizeof(struct ip_session_info));
    
    struct ip_packet_info packet;
    memset(&packet, 0, sizeof(struct ip_packet_info));
    if ( 0 != get_ippacket_info(&packet, data, len) ) {
        return -1;
    }
    
    memcpy(&session->packet, &packet, sizeof(struct ip_packet_info));
    session->direction = direction;

    if (session->packet.protocol != IPPROTO_UDP &&
        session->packet.protocol != IPPROTO_TCP &&
        session->packet.protocol != IPPROTO_ICMP ) {
        return 0;
    }
    
    // 获取更详细的信息
    struct ip *iphdr = (struct ip *)data;
    const int ip_hl = iphdr->ip_hl << 2;
    
    if ( DIRECTION_OUT == direction ) {
        session->is_dns = (packet.protocol == IPPROTO_UDP) &&
                          (ntohs(packet.dst_port_ip) == DNS_PORT) && \
                          check_likely_a_dns_packet(data + ip_hl + HEADER_LEN_UDP, len - ip_hl - HEADER_LEN_UDP, true);
        
        if ( !session->is_dns ) {
            domain_from_ip(packet.dst_addr_ip, session->domain, DOMANAME_SIZE);
        }
    }
    else {
        session->is_dns = (packet.protocol == IPPROTO_UDP) &&
                          (ntohs(packet.src_port_ip) == DNS_PORT) && \
                          check_likely_a_dns_packet(data + ip_hl + HEADER_LEN_UDP, len - ip_hl - HEADER_LEN_UDP, false);
        
    }

    // 域名缓冲区
    char domain[DOMANAME_BUFF_SIZE];
    domain[0] = '\0';
    if ( session->is_dns ) {
        get_domain_from_dns_data(domain, data + ip_hl + HEADER_LEN_UDP, len - ip_hl - HEADER_LEN_UDP);
        domain[DOMANAME_SIZE - 1] = '\0';
        strlcpy(session->domain, domain, DOMANAME_SIZE);
    }
    else {
        int32_t addr_net = direction == DIRECTION_OUT ? packet.dst_addr_ip : packet.src_addr_ip;
        domain_from_ip(addr_net, domain, DOMANAME_SIZE);
        domain[DOMANAME_SIZE - 1] = '\0';
        strlcpy(session->domain, domain, DOMANAME_SIZE);
    }
    
    return 0;
}
