//
//  K1DNSServer.m
//  Gnwj
//
//  Created by Z0 on 07/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//
#import "K1DNSServer.h"
#include <arpa/inet.h>
#include <netinet/udp.h>
#include <netinet/ip.h>
#import "K1Kit.h"

@interface K1DNSServerQuery : NSObject

@property (nonatomic, assign) u_int16_t identifier_DNS;
@property (nonatomic, assign) u_int32_t destHost_DNS;
@property (nonatomic, assign) u_int16_t destPort_DNS;
@property (nonatomic, assign) u_int32_t srcHost_DNS;
@property (nonatomic, assign) u_int16_t srcPort_DNS;

@end

@implementation K1DNSServerQuery

@end

///////////////////////////////////////////////////////////////////////////////////////////////////

@interface K1DNSServer ()<K1UDPSocketDelegate>
{
    NSMutableDictionary *_waittingQueriesMap;
    u_int16_t _queryIDCounter;
}

@end


@implementation K1DNSServer

- (instancetype)initWithDNSServer_DNS:(NSString *)dnsServer
{
    self = [super init];
    if ( self ) {
        self.socket_DNS = [[K1UDPSocket alloc] initWithHost_K1:dnsServer port:53];
        self.socket_DNS.delegate_k1 = self;
        _waittingQueriesMap = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)start_DNS
{
    self.started_DNS = YES;
}

- (void)stop_DNS
{
    self.started_DNS = NO;
}

- (BOOL)processDNSQueryPacket_DNS:(N2IPPacket *)packet
{
    if ( packet.is_DNS && packet.outgoing ) {
        if (_queryIDCounter == UINT16_MAX) _queryIDCounter = 0;
        u_int16_t queryID = _queryIDCounter++;
        K1DNSServerQuery *query = [K1DNSServerQuery new];
        query.srcHost_DNS = packet.source_IP;
        query.srcPort_DNS = packet.sourcePort_IP;
        query.destHost_DNS = packet.destination_IP;
        query.destPort_DNS = packet.destinationPort_IP;
        query.identifier_DNS = packet.queryId_DNS;
        _waittingQueriesMap[@(queryID)] = query;
        
        NSData *data = packet.rawData_IP;
        const uint8_t *bytes = data.bytes;
        const size_t length = data.length;
        
        struct ip *iphdr = (struct ip *)bytes;
        const int ip_hl = iphdr->ip_hl << 2;
        
        bytes = bytes + ip_hl;
        
        size_t udp_length = length - ip_hl;
        bytes = bytes + sizeof(struct udphdr *);
        size_t payload_length = udp_length - sizeof(struct udphdr *);
        
        NSMutableData *outData = [[NSMutableData alloc] initWithBytes:bytes length:payload_length];
        [outData replaceBytesInRange:NSMakeRange(0, 2) withBytes:&queryID];
        
        [self.socket_DNS writeDatas_K1:@[outData]];
        
        LOG_INFO(@"Foward DNS Query: %@ to %@", packet.queryDomain_DNS, self.socket_DNS.session.resolvedEndpoint);
        return YES;
    }
    
    return NO;
}

- (NSData *)processDNSResp_DNS:(NSData *)resp
{
    u_int16_t queryID = *((u_int16_t *)resp.bytes);
    K1DNSServerQuery *query = _waittingQueriesMap[@(queryID)];
    if ( !query ) {
        LOG_ERROR(@"Local query not found!");
    }
    else {
        NSMutableData *data = [resp mutableCopy];
        u_int16_t identifier = query.identifier_DNS;
        [data replaceBytesInRange:NSMakeRange(0, 2) withBytes:&identifier];
        
        
        NSData *packetData = [N2IPPacket udpPacketData_WithSourceIP:query.destHost_DNS
                                                        sourcePort:query.destPort_DNS
                                                     destinationIP:query.srcHost_DNS
                                                   destinationPort:query.srcPort_DNS
                                                       payloadData:data];
        
#if DEBUG_PRINT_INTERCEPT_IPPACKET
        N2IPPacket *packet = [N2IPPacket udpPacket_WithSourceIP:query.destHost
                                                    sourcePort:query.destPort
                                                 destinationIP:query.srcHost
                                               destinationPort:query.srcPort
                                                   payloadData:data];
        LOG_Info(@"DNS Resp = %@", packet);
#endif
        return packetData;
    }
    
    return nil;
}

#pragma mark -

- (void)didReceiveDatas:(NSArray *)datas from:(K1UDPSocket *)socket
{
    NSMutableArray *packets = [NSMutableArray array];
    for ( NSData *eachResp in datas ) {
        NSData *packet = [self processDNSResp_DNS:eachResp];
        if ( packet ) {
            [packets addObject:packet];
        }
    }
    
    if ( [packets count] > 0 && [self.delegate_DNS respondsToSelector:@selector(didReceiveDatas:fromDNS:)] ) {
        [self.delegate_DNS didReceiveDatas:packets fromDNS:self];
    }
}

@end
