//
//  N2IPPacket.m
//  Gnwj
//
//  Created by Z0 on 26/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "N2IPPacket.h"
#include <arpa/inet.h>
#include <netinet/udp.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#import "K1Kit.h"
#import "GnwjLogger.h"


#define IP_HLEN 20

#pragma mark - C

struct ICMPHeader {
    uint8_t     type;
    uint8_t     code;
    uint16_t    checksum;
    uint16_t    identifier;
    uint16_t    sequenceNumber;
    // data...
};
typedef struct ICMPHeader ICMPHeader;

static boolean_t check_likely_a_dns_packet(const uint8_t *data, size_t data_len, Boolean query_true_resp_false)
{
    if (data_len < 15)
        return FALSE;
    
    int QR = (data[2] >> 7) & 0x01;
    const int QR_QUERY = 0;
    const int QR_RESP  = 1;
    if (query_true_resp_false && (QR != QR_QUERY))
        return FALSE;
    if (!query_true_resp_false && (QR != QR_RESP))
        return FALSE;
    
    int Opcode = (data[2] >> 3) & 0x0f;
    if (Opcode != 0){
        return FALSE;
    }
    
    int TC = (data[2] >> 1) & 0x01;
    if (TC != 0) {
        return FALSE;
    }
    
    if (!query_true_resp_false && ((data[3] & 0x0f) != 0)) {
        return FALSE;
    }
    
    if (query_true_resp_false && (data_len < 6 || data[4] != 0 || data[5] != 1)) {
        return FALSE;
    }
    
    return TRUE;
}

static void get_domain_from_dns_data(char *domain, const uint8_t *data, size_t len) {
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

static unsigned short decode(const unsigned char* buf, int a, int b) {
    return (buf[a] << 8) + buf[b];
}

static int get_ip_addrs_from_dns(uint32_t *addrs, const uint8_t *data, size_t len) {
    int ret = 0;
    
    if (len < 12)
        return ret;
    const uint8_t *ptr = data;
    
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
    while (TRUE) {
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

static unsigned short cksum_ip(struct ip *ip, int len){
    long sum = 0;  /* assume 32 bit long, 16 bit short */
    uint16_t *ptr = (uint16_t *)ip;
    while(len > 1){
        
        sum += *ptr++;
        
        if(sum & 0x80000000)   /* if high order bit set, fold */
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if(len)       /* take care of left over byte */
        sum += (unsigned short) *(unsigned char *)ip;
    
    while(sum>>16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    return ~sum;
}

static uint16_t udp_checksum_calc(const void *buff, size_t len, uint32_t src_addr, uint32_t dest_addr) {
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr, *ip_dst = (void *) &dest_addr;
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

uint16_t calc_tcp_checksum(const void *buff, size_t len, uint32_t src_addr, uint32_t dest_addr) {
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr, *ip_dst = (void *) &dest_addr;
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

    sum += htons(0); // always zero
    sum += htons(IPPROTO_TCP);
    sum += htons(length);
    
    // Add the carries
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    // Return the one's complement of sum
    return ((uint16_t)(~sum));
}

static uint16_t in_cksum(const void *buffer, size_t bufferLen)
// This is the standard BSD checksum code, modified to use modern types.
{
    size_t              bytesLeft;
    int32_t             sum;
    const uint16_t *    cursor;
    union {
        uint16_t        us;
        uint8_t         uc[2];
    } last;
    uint16_t            answer;
    
    bytesLeft = bufferLen;
    sum = 0;
    cursor = buffer;
    
    /*
     * Our algorithm is simple, using a 32 bit accumulator (sum), we add
     * sequential 16 bit words to it, and at the end, fold back all the
     * carry bits from the top 16 bits into the lower 16 bits.
     */
    while (bytesLeft > 1) {
        sum += *cursor;
        cursor += 1;
        bytesLeft -= 2;
    }
    
    /* mop up an odd byte, if necessary */
    if (bytesLeft == 1) {
        last.uc[0] = * (const uint8_t *) cursor;
        last.uc[1] = 0;
        sum += last.us;
    }
    
    /* add back carry outs from top 16 bits to low 16 bits */
    sum = (sum >> 16) + (sum & 0xffff);    /* add hi 16 to low 16 */
    sum += (sum >> 16);            /* add carry */
    answer = (uint16_t) ~sum;   /* truncate to 16 bits */
    
    return answer;
}

struct ip *generate_new_iphdr(u_int8_t proto, struct in_addr src, struct in_addr dest, uint16_t total_len) {
    struct ip *iphdr = malloc(sizeof(struct ip));

    static u_short ip_id = 0;
    
    ip_id ++;
    if ( ip_id == USHRT_MAX ) {
        ip_id = 1;
    }
    
    iphdr->ip_v = 4;
    iphdr->ip_hl = 5;
    iphdr->ip_dst = dest;
    iphdr->ip_src = src;
    iphdr->ip_tos = 0;
    iphdr->ip_off = 0;
    iphdr->ip_ttl = 64;
    iphdr->ip_id = ip_id;
    iphdr->ip_p = IPPROTO_UDP;
    iphdr->ip_len = htons(total_len);
    iphdr->ip_sum = 0;
    iphdr->ip_sum = cksum_ip(iphdr, IP_HLEN);
    
    return iphdr;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// 修复 1️⃣：移除有问题的宏，使用标准单例实现
@interface N2IPInfoManager : NSObject

// 明确返回类型为 N2IPInfoManager*
+ (instancetype)sharedInstance;

@property (nonatomic, strong) NSMutableDictionary *domainMap;

@end

@implementation N2IPInfoManager

// 修复 2️⃣：使用 dispatch_once 标准单例实现
+ (instancetype)sharedInstance {
    static N2IPInfoManager *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[self alloc] init];
    });
    return sharedInstance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _domainMap = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)recordDomain:(NSString *)domain forAddrs:(NSArray *)addrs {
    for (NSNumber *eachAddr in addrs) {
        _domainMap[eachAddr] = domain;
    }
}

- (NSString *)domainForAddr:(u_int32_t)addr {
    return _domainMap[@(addr)];
}

@end


@implementation N2IPPacket

+ (instancetype)packet_WithData:(NSData *)data outgoing:(BOOL)flag {
    return [[self alloc] init_WithData:data outgoing:flag];
}

- (instancetype)init_WithData:(NSData *)data
                    outgoing:(BOOL)flag {
    self = [super init];
    if (self) {
        if (data.length < IP_HLEN) return nil;
        
        _rawData_IP = data;
        _outgoing = flag;
        
        const uint8_t *bytes = data.bytes;
        
        _protocol_IP = *((u_int8_t *)(bytes + 9));
        _source_IP = *((u_int32_t *)(bytes + 12));
        _destination_IP = *((u_int32_t *)(bytes + 16));
        _header_Length = ((*(u_int8_t *)bytes) & 0x0F) * 4;
        
        if (_protocol_IP == 0x11) {
            _is_UDP = YES;
        }
        else if (_protocol_IP == 0x06) {
            _is_TCP = YES;
        }
        
        const uint8_t *payloadBytes = (const uint8_t *)(bytes + _header_Length);
        
        if (_is_UDP || _is_TCP) {
            _sourcePort_IP = ntohs(*(u_int16_t *)(payloadBytes));
            _destinationPort_IP = ntohs(*(u_int16_t *)(payloadBytes + 2));
        }
        
        if (_is_UDP) {
            const uint8_t *udpPayloadBytes = (const uint8_t *)(payloadBytes + 8);
            size_t udpPayloadLength = _rawData_IP.length - _header_Length - 8;
            BOOL rightPort = _outgoing ? (_destinationPort_IP == 53) : (_sourcePort_IP == 53);
            if (rightPort) {
                _is_DNS = check_likely_a_dns_packet(udpPayloadBytes, udpPayloadLength, _outgoing);
            }
            
            if (_is_DNS) {
                char domain[256];
                
                char ip_str[INET_ADDRSTRLEN];
                struct in_addr ip_addr;
                
                get_domain_from_dns_data(domain, udpPayloadBytes, udpPayloadLength);
                self.queryDomain_DNS = @(domain);
                self.queryId_DNS = *((u_int16_t *)udpPayloadBytes);
                if (!_outgoing) {
                    uint32_t addrs[64] = {0};
                    int cnt = get_ip_addrs_from_dns(addrs, udpPayloadBytes, udpPayloadLength);
                    NSMutableArray *addrsArr = [NSMutableArray arrayWithCapacity:cnt];
                    for (int i = 0; i < cnt; i++)
                    {
                        uint32_t addr = addrs[i];
                        [addrsArr addObject:@(addr)];
                        
                        ip_addr.s_addr = addr;  // addr 已经是网络字节序
                                
                        if (inet_ntop(AF_INET, &ip_addr, ip_str, INET_ADDRSTRLEN) != NULL) {
                            DDLogInfo(@"Domain: %@ resolves to IP: %@",
                                             [NSString stringWithUTF8String:domain],
                                             [NSString stringWithUTF8String:ip_str]);
                        }
                        else
                        {
                            // 错误处理
                            DDLogInfo(@"Failed to convert IP address to string: 0x%08x", addr);
                        }
                    }
                    self.domainAddrs_DNS = [NSArray arrayWithArray:addrsArr];
                    
                    // 修复 4️⃣：使用标准单例调用
                    [[N2IPInfoManager sharedInstance] recordDomain:_queryDomain_DNS forAddrs:_domainAddrs_DNS];
                }
            }
        }
        
        // 修复 5️⃣：使用标准单例调用
        _destinationDomain_IP = [[N2IPInfoManager sharedInstance] domainForAddr:_destination_IP] ?: self.destinationHost;
    }
    return self;
}

- (NSString *)description {
    NSString *packetProto = @"IPv4";
    
    if (_is_TCP) {
        packetProto = @"TCP";
    }
    
    if (_is_UDP) {
        packetProto = @"UDP";
    }
    
    if (_is_DNS) {
        packetProto = @"DNS";
    }
    
    NSString *arrow = _outgoing ? @"--->" : @"<---";
    
    NSString *left = [NSString stringWithFormat:@"%@:%d", self.sourceHost, self.sourcePort_IP];
    NSString *right = [NSString stringWithFormat:@"%@:%d", self.destinationHost, self.destinationPort_IP];
    
    if (_outgoing && _destinationDomain_IP) {
        right = [right stringByAppendingFormat:@"(%@)", _destinationDomain_IP];
    }
    
    if (!_outgoing) {
        NSString *s = left;
        left = right;
        right = s;
    }

    if (_rawData_IP.length > 1400) {
        // 修复 6️⃣：使用 DDLogError 替代 LOG_Error
        DDLogError(@"== Too Big Packet ====");
    }
    
    NSString *des = [NSString stringWithFormat:@"[%@], %@ %@ %@", packetProto, left, arrow, right];
    
    if (_is_DNS) {
        des = [des stringByAppendingFormat:@", query: %@", _queryDomain_DNS];
        if (!_outgoing) {
            NSMutableArray *strAddrs = [NSMutableArray arrayWithCapacity:[_domainAddrs_DNS count]];
            
            for (NSNumber *eachIP in _domainAddrs_DNS) {
                struct in_addr inaddr;
                inaddr.s_addr = [eachIP unsignedIntValue];
                [strAddrs addObject:[NSString stringWithUTF8String:inet_ntoa(inaddr)]];
            }
            
            des = [des stringByAppendingFormat:@", addrs: %@", strAddrs];
        }
    }
    
    if (_matchRule_K1) {
        des = [des stringByAppendingFormat:@", Rule: %@", _matchRule_K1];
    }
    
    return des;
}

- (NSString *)destinationHost {
    struct in_addr inaddr;
    inaddr.s_addr = _destination_IP;
    return [NSString stringWithUTF8String:inet_ntoa(inaddr)];
}

- (NSString *)sourceHost {
    struct in_addr inaddr;
    inaddr.s_addr = _source_IP;
    return [NSString stringWithUTF8String:inet_ntoa(inaddr)];
}

- (void)replaceDestinationWith_IP:(u_int32_t)IP {
    NSData *data = [_rawData_IP copy];
    
    const uint8_t *bytes = data.bytes;
    const size_t length = data.length;
    
    struct ip *iphdr = (struct ip *)bytes;
    iphdr->ip_dst.s_addr = IP;
    
    const int ip_hl = iphdr->ip_hl << 2;
    
    struct udphdr *udp = (struct udphdr *) (bytes + ip_hl);
    size_t udp_length = length - ip_hl;
    udp->uh_sum = 0;
    udp->uh_sum = udp_checksum_calc(bytes + ip_hl, udp_length, iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);

    iphdr->ip_sum = 0;
    iphdr->ip_sum = cksum_ip(iphdr, ip_hl);
    
    _rawData_IP = [NSData dataWithBytes:bytes length:length];
    _destination_IP = IP;
}

+ (NSData *)udpPacketData_WithSourceIP:(u_int32_t)sourceIP
                           sourcePort:(u_int16_t)sourcePort
                        destinationIP:(u_int32_t)destinationIP
                      destinationPort:(u_int16_t)destinationPort
                          payloadData:(NSData *)payloadData {
    uint8_t *bytes = (uint8_t *)[payloadData bytes];
    
    struct in_addr src = { sourceIP };
    struct in_addr dst = { destinationIP };
    
    int bytes_len = (int)payloadData.length;
    int udp_length = sizeof(struct udphdr) + bytes_len;
    int total_len = IP_HLEN + udp_length;
    
    struct ip *iphdr = generate_new_iphdr(IPPROTO_UDP, src, dst, total_len);
    struct udphdr udphdr;
    udphdr.uh_dport = htons(destinationPort);
    udphdr.uh_sport = htons(sourcePort);
    udphdr.uh_ulen = htons(udp_length);
    udphdr.uh_sum = htons(0);
    
    uint8_t *udpdata = malloc(sizeof(uint8_t) * udp_length);
    memcpy(udpdata, &udphdr, sizeof(struct udphdr));
    memcpy(udpdata + sizeof(struct udphdr), bytes, bytes_len);
    
    struct udphdr *new_udphdr = (struct udphdr *)udpdata;
    new_udphdr->uh_sum = udp_checksum_calc(udpdata, udp_length, sourceIP, destinationIP);
    
    uint8_t *ipdata = malloc(sizeof(uint8_t) * total_len);
    memcpy(ipdata, iphdr, IP_HLEN);
    memcpy(ipdata + sizeof(struct ip), udpdata, udp_length);
    
    NSData *outData = [[NSData alloc] initWithBytes:ipdata length:total_len];
    free(ipdata);
    free(iphdr);
    free(udpdata);
    
    return outData;
}

+ (instancetype)udpPacket_WithSourceIP:(u_int32_t)sourceIP
                           sourcePort:(u_int16_t)sourcePort
                        destinationIP:(u_int32_t)destinationIP
                      destinationPort:(u_int16_t)destinationPort
                          payloadData:(NSData *)payloadData {
    uint8_t *bytes = (uint8_t *)[payloadData bytes];
    
    struct in_addr src = { sourceIP };
    struct in_addr dst = { destinationIP };
    
    int bytes_len = (int)payloadData.length;
    int udp_length = sizeof(struct udphdr) + bytes_len;
    int total_len = IP_HLEN + udp_length;

    struct ip *iphdr = generate_new_iphdr(IPPROTO_UDP, src, dst, total_len);
    struct udphdr udphdr;
    udphdr.uh_dport = htons(destinationPort);
    udphdr.uh_sport = htons(sourcePort);
    udphdr.uh_ulen = htons(udp_length);
    udphdr.uh_sum = htons(0);
    
    uint8_t *udpdata = malloc(sizeof(uint8_t) * udp_length);
    memcpy(udpdata, &udphdr, sizeof(struct udphdr));
    memcpy(udpdata + sizeof(struct udphdr), bytes, bytes_len);
    
    struct udphdr *new_udphdr = (struct udphdr *)udpdata;
    new_udphdr->uh_sum = udp_checksum_calc(udpdata, udp_length, sourceIP, destinationIP);
    
    uint8_t *ipdata = malloc(sizeof(uint8_t) * total_len);
    memcpy(ipdata, iphdr, IP_HLEN);
    memcpy(ipdata + sizeof(struct ip), udpdata, udp_length);
    
    NSData *outData = [[NSData alloc] initWithBytes:ipdata length:total_len];
    free(ipdata);
    free(iphdr);
    free(udpdata);

    return [self packet_WithData:outData outgoing:NO];
}

- (void)updateChecksum_IP {
    NSData *data = [_rawData_IP copy];
    const uint8_t *bytes = data.bytes;
    const size_t length = data.length;
    struct ip *iphdr = (struct ip *)bytes;
    const int ip_hl = iphdr->ip_hl << 2;
    
    if (self.is_UDP) {
        struct udphdr *udp = (struct udphdr *) (bytes + ip_hl);
        size_t udp_length = length - ip_hl;
        udp->uh_sum = 0;
        udp->uh_sum = udp_checksum_calc(bytes + ip_hl, udp_length, iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
    }
    else if (self.is_TCP) {
        struct tcphdr *tcp = (struct tcphdr *) (bytes + ip_hl);
        size_t tcp_length = length - ip_hl;
        tcp->th_sum = 0;
        tcp->th_sum = calc_tcp_checksum(bytes + ip_hl, tcp_length, iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
    }
    else if (self.protocol_IP == IPPROTO_ICMP) {
        ICMPHeader *icmpPtr = (struct ICMPHeader *) (bytes + ip_hl);
        size_t icmp_length = length - ip_hl;
        icmpPtr->checksum  = 0;
        icmpPtr->checksum  = in_cksum(icmpPtr, icmp_length);
    }
    
    iphdr->ip_sum = 0;
    iphdr->ip_sum = cksum_ip(iphdr, ip_hl);
    _rawData_IP = [NSData dataWithBytes:bytes length:length];
}

@end
