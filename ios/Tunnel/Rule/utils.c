//
//  utils.c
//
//
//  Created by ZL on 21/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

#include "utils.h"
#include <string.h>
#include <stdlib.h>
#include <netinet/ip.h>
#include <netinet/udp.h>

bool check_private_or_lo_ipv4_addr(const void *addr)
{
    if (!addr)
        return false;
    
    uint8_t ip0 = ((uint8_t *) addr)[0];
    uint8_t ip1 = ((uint8_t *) addr)[1];
    uint8_t ip2 = ((uint8_t *) addr)[2];
    uint8_t ip3 = ((uint8_t *) addr)[3];
    
    if (ip0 >= 224 && ip0 <= 239) {
        // 224.0.0.0 - 239.255.255.255
        return true;
    }
    if (ip0 >= 240 && ip0 <= 255) {
        // 240.0.0.0 - 255.255.255.254
        // 255.255.255.255
        return true;
    }
    if (ip0 == 127 || ip0 == 10 || ip0 == 0) {
        // 0.0.0.0 - 0.255.255.255
        // 127.0.0.0 - 127.255.255.255
        // 10.0.0.0 - 10.255.255.255
        return true;
    }
    if (ip0 == 192 && ip1 == 168) {
        // 192.168.0.0 - 192.168.255.255
        return true;
    }
    if (ip0 == 172 && ip1 >= 16 && ip1 <= 31) {
        // 172.16.0.0 - 172.31.255.255
        return true;
    }
    if (ip0 == 169 && ip1 == 254) {
        // 169.254.0.0 - 169.254.255.255
        return true;
    }
    if (ip0 == 100 && ip1 >= 64 && ip1 <= 127) {
        // 100.64.0.0 - 100.127.255.255
        return true;
    }
    if (ip0 == 192 && ip1 == 0 && ip2 == 0 && ip3 >= 0 && ip3 <= 255) {
        // 192.0.0.0 - 192.0.0.255
        return true;
    }
    if (ip0 == 192 && ip1 == 0 && ip2 == 2 && ip3 >= 0 && ip3 <= 255) {
        // 192.0.2.0 - 192.0.2.255
        return true;
    }
    if (ip0 == 192 && ip1 == 88 && ip2 == 99 && ip3 >= 0 && ip3 <= 255) {
        // 192.88.99.0 - 192.88.99.255
        return true;
    }
    if (ip0 == 198 && ip1 >= 18 && ip1 <= 19) {
        // 198.18.0.0 - 198.19.255.255
        return true;
    }
    if (ip0 == 198 && ip1 == 51 && ip2 == 100 && ip3 >= 0 && ip3 <= 255) {
        // 198.51.100.0 - 198.51.100.255
        return true;
    }
    if (ip0 == 203 && ip1 == 0 && ip2 == 113 && ip3 >= 0 && ip3 <= 255) {
        // 203.0.113.0 - 203.0.113.255
        return true;
    }
    
    return false;
}


bool check_likely_dns_packet(const uint8_t *data, size_t len)
{
    if (!data || len < 15)
        return false;
    
    int QR = (data[2] >> 7) & 0x01;
    if (QR != 0)
        return false;
    
    int opcode = (data[2] >> 3) & 0x0f;
    if (opcode != 0)
        return false;
    
    int TC = (data[2] >> 1) & 0x01;
    if (TC != 0)
        return false;
    
    if (data[4] != 0 || data[5] != 1)
        return false;
    
    return true;
}

bool check_likely_a_dns_packet(const uint8_t *payload, size_t payload_len, bool query_true_resp_false)
{
    const uint8_t *data = payload;
    const size_t data_len = payload_len;

    if (data_len < 15)
        return false;
    
    int QR = (data[2] >> 7) & 0x01;
    const int QR_QUERY = 0;
    const int QR_RESP  = 1;
    if (query_true_resp_false && (QR != QR_QUERY))
        return false;
    if (!query_true_resp_false && (QR != QR_RESP))
        return false;
    
    int Opcode = (data[2] >> 3) & 0x0f;
    if (Opcode != 0){
        return false;
    }
    
    int TC = (data[2] >> 1) & 0x01;
    if (TC != 0) {
        return false;
    }
    
    if (!query_true_resp_false && ((data[3] & 0x0f) != 0)) {
        return false;
    }
    
    if (query_true_resp_false && (data_len < 6 || data[4] != 0 || data[5] != 1)) {
        return false;
    }
    
    return true;
}

unsigned short cksum_ip(uint8_t *ip, int len)
{
    uint32_t sum = 0; /* assume 32 bit long, 16 bit short */
    uint16_t *ptr = (uint16_t *)ip;
    
    while (len > 1) {
        sum += *ptr++;
        if (sum & 0x80000000) /* if high order bit set, fold */
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if (len) /* take care of left over byte */
        sum += (unsigned short) *(unsigned char *) ip;
    
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    return ((uint16_t)(~sum));
}

uint16_t udp_checksum_calc(const void *buff, size_t len, uint32_t src_addr_ip, uint32_t dest_addr_net)
{
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr_ip, *ip_dst = (void *) &dest_addr_net;
    uint32_t sum;
    size_t length = len;
    
    // Calculate the sum
    sum = 0;
    while (len > 1) {
        sum += *buf++;
        if (sum & 0x80000000)
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if (len & 1)
        // Add the padding if the packet lenght is odd
        sum += *((uint8_t *) buf);
    
    // Add the pseudo-header
    sum += *(ip_src++);
    sum += *ip_src;
    
    sum += *(ip_dst++);
    sum += *ip_dst;
    
    sum += htons(IPPROTO_UDP);
    sum += htons(length);
    
    // Add the carries
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    // Return the one's complement of sum
    return ((uint16_t)(~sum));
}

uint16_t packet_checksum_calc(const void *buff, size_t len, uint32_t src_addr_ip, uint32_t dest_addr_net, uint16_t protocol)
{
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr_ip, *ip_dst = (void *) &dest_addr_net;
    uint32_t sum;
    size_t length = len;
    
    // Calculate the sum
    sum = 0;
    while (len > 1) {
        sum += *buf++;
        if (sum & 0x80000000)
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if (len & 1)
        // Add the padding if the packet lenght is odd
        sum += *((uint8_t *) buf);
    
    // Add the pseudo-header
    sum += *(ip_src++);
    sum += *ip_src;
    
    sum += *(ip_dst++);
    sum += *ip_dst;
    
    sum += htons(protocol);
    sum += htons(length);
    
    // Add the carries
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    // Return the one's complement of sum
    return ((uint16_t)(~sum));
}

void get_domain_from_dns_data(char *domain, const uint8_t *data, size_t len)
{
    if (len < 12)
        return;
    
    const uint8_t *ptr = (const uint8_t *)(data + 12);
    const uint8_t *endPtr = (const uint8_t *)(data + len);
    
    int domainLength = 0;
    while (*ptr != 0) {
        u_int8_t len = *ptr;
        ptr++;
        if (ptr + len >= endPtr) return;
        stpncpy(domain + domainLength, (const char *)ptr, len);
        ptr += len;
        domainLength += len;
        domain[domainLength] = '.';
        domainLength++;
    }
    
    ptr += 3;
    if (ptr >= endPtr) return;
    
    domain[domainLength - 1] = '\0';
}

char *get_domain_from_dns_data_dynamic(const uint8_t *data, int len)
{
    if (!data || len < 12)
        return NULL;
    
    char *domain = (char *) malloc(sizeof(char) * DOMANAME_SIZE);
    if (!domain)
        return NULL;
    memset(domain, 0, DOMANAME_SIZE);
    
    domain[0] = '\0';
    int domain_len = 0;
    
    const uint8_t *ptr = data;
    ptr += 12;
    
    for (int n = 0; n < len;) {
        uint8_t c = ptr[n];
        if (c == 0x00)
            break;
        
        if ((n + c + 1) > len)
            break;
        if ((n + c + 1) > DOMANAME_SIZE)
            break;
        
        n += 1;
        strncat(domain, (const char *) (ptr + n), c);
        strncat(domain, ".", 1);
        domain_len += (c + 1);
        n += c;
    }
    
    if (domain_len >= 1)
        domain[domain_len - 1] = '\0';
    
    return domain;
}

static inline uint16_t decode(const uint8_t *data, int a, int b)
{
    return ((data[a] << 8) + data[b]);
}

int get_ip_addrs_from_dns(uint32_t *addrs, const uint8_t *dns_data, size_t dns_len)
{
    int ret = 0;
    const size_t len = dns_len;
    
    if (len < 12)
        return ret;
    const uint8_t *ptr = dns_data;
    
    // 跳过DNS头部长度
    int n = 12;
    
    // 跳过DNS的Query部分
    while (n < len) {
        if (ptr[n] == 0x00) {
            if ((n + 5) > len)
                return ret;
            else
                break;
        }
        n++;
    }
    n += 5;
    
    // 开始解析Answers
    while (true) {
        if ((n + 12 > len))
            break;
        
        n += 2;
        int type = decode(ptr + n, 0, 1);
        n += 2;
        int class = decode(ptr + n, 0, 1);
        n += 2;
        n += 4;
        int data_length = decode(ptr + n, 0, 1);
        n += 2;
        
        if ((type != 1) || (class != 1) || (data_length != 4)) {
            n += data_length;
            continue;
        } else {
            if ((n + 4) > len) {
                break;
            } else {
                union { uint32_t d32; uint8_t d8[4]; } addr;
                addr.d8[0] = ptr[n + 0];
                addr.d8[1] = ptr[n + 1];
                addr.d8[2] = ptr[n + 2];
                addr.d8[3] = ptr[n + 3];
                
                if (ret >= 64)
                    return ret;
                
                addrs[ret] = addr.d32;
                ret++;
                n += 4;
            }
        }
    }
    
    return ret;
}


bool is_likely_a_domain_name(const char *str)
{
    size_t len = strlen(str);
    if (len < 3)
        return false;
    
    if (!strchr(str, '.'))
        return false;
    if (*str == '.') {
        return false;
    }
    
    for (int i = 0; i < len; i++) {
        if ((str[i] >= 'a' && str[i] <= 'z') || (str[i] >= 'A' && str[i] <= 'Z')) {
            return true;
        }
    }
    
    return false;
}
