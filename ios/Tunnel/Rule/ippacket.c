//
//  ip_packet.c
//  
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "ippacket.h"
#include <arpa/inet.h>
#include <stdio.h>
#include <string.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <netinet/udp.h>
#include <netinet/ip_icmp.h>
#include "utils.h"

bool ippacket_desc_equal(const struct ip_packet_info *dst, const struct ip_packet_info *src)
{
    return
    dst->dst_addr_ip == src->dst_addr_ip
    &&
    dst->dst_port_ip == src->dst_port_ip
    &&
    dst->protocol == src->protocol
    &&
    dst->src_addr_ip == src->src_addr_ip
    &&
    dst->src_port_ip == src->src_port_ip;
    
}

const char *protocol_2_string(protocol_t protocol)
{
    switch (protocol) {
        case IPPROTO_TCP: return "TCP";
            
        case IPPROTO_UDP: return "UDP";
            
        case IPPROTO_ICMP: return "ICMP";
            
        case PROTO_ANY: return "ALL";
            
        default: return "Unknown";
    }
}

const char *ippacket_desc_string(const struct ip_packet_info *v, char *buf, size_t n)
{
    char src_ip[16];
    char dst_ip[16];
    inet_ntop(AF_INET, &v->dst_addr_ip, src_ip, sizeof(src_ip));
    inet_ntop(AF_INET, &v->dst_addr_ip, dst_ip, sizeof(dst_ip));
    
    if (v->protocol != IPPROTO_ICMP)
        snprintf(buf, n, "%s %s:%d %d", protocol_2_string(v->protocol), dst_ip, ntohs(v->dst_port_ip), ntohs(v->src_port_ip));
    else
        snprintf(buf, n, "%s %s (%s:%d)", protocol_2_string(v->protocol), dst_ip, src_ip, v->src_port_ip);
    
    return buf;
}

int get_ippacket_info(struct ip_packet_info *packet, const uint8_t *data, size_t len)
{
    struct ip *ip = (struct ip *)data;
    memset(packet, 0x00, sizeof(*packet));
    
    if (len < 20) {
        return -1;
    }
    
    packet->protocol = ip->ip_p;
    switch (ip->ip_p) {
        case IPPROTO_ICMP:
        case IPPROTO_TCP:
        case IPPROTO_UDP:
            break;
        default:
            return -1;
    }
    
    packet->dst_addr_ip = ip->ip_dst.s_addr;
    packet->src_addr_ip = ip->ip_src.s_addr;
    
    int iphdrlen = 4 * ip->ip_hl;
    if (ip->ip_p == IPPROTO_TCP) {
        struct tcphdr tcp;
        memcpy(&tcp, data + iphdrlen, sizeof(struct tcphdr));
        packet->dst_port_ip = tcp.th_dport;
        packet->src_port_ip = tcp.th_sport;
        packet->payload_length = ntohs(ip->ip_len) - iphdrlen - sizeof(struct tcphdr);
        
    } else if (ip->ip_p == IPPROTO_UDP) {
        struct udphdr udp;
        memcpy(&udp, data + iphdrlen, sizeof(struct udphdr));
        packet->dst_port_ip = udp.uh_dport;
        packet->src_port_ip = udp.uh_sport;
        packet->payload_length = ntohs(udp.uh_ulen) - sizeof(struct udphdr);
        
    } else if (ip->ip_p == IPPROTO_ICMP) {
        struct icmp icmp;
        memcpy(&icmp, data + iphdrlen, sizeof(struct icmp));
        if (icmp.icmp_type != ICMP_ECHO)
            return -1;
        packet->src_port_ip = icmp.icmp_id;
        packet->payload_length = ntohs(ip->ip_len) - iphdrlen - 16; //sizeof(struct icmp);
    }

    return 0;
}

