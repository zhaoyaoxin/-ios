//
//  N2IPPacketInfo.h
//  Gnwj
//
//  Created by Z0 on 26/19/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>

@class N2PacketRule;

@interface N2IPPacket : NSObject

@property (nonatomic, strong) NSData *rawData_IP;
@property (nonatomic, assign) BOOL outgoing;

// IP v4
@property (nonatomic, readonly) u_int8_t protocol_IP;
@property (nonatomic, readonly) u_int32_t source_IP;
@property (nonatomic, readonly) u_int32_t destination_IP;
@property (nonatomic, readonly) u_int16_t sourcePort_IP;
@property (nonatomic, readonly) u_int16_t destinationPort_IP;

@property (nonatomic, readonly) NSString *sourceHost_IP;
@property (nonatomic, readonly) NSString *destinationHost_IP;
@property (nonatomic, readonly) NSString *destinationDomain_IP;


@property (nonatomic, assign) NSUInteger header_Length;
@property (nonatomic, assign) NSUInteger payload_Length;

// Protocol
@property (nonatomic, assign) BOOL is_UDP;
@property (nonatomic, assign) BOOL is_TCP;
@property (nonatomic, assign) BOOL is_DNS;

// DNS
@property (nonatomic, assign) u_int16_t queryId_DNS;
@property (nonatomic, strong) NSString *queryDomain_DNS;
@property (nonatomic, strong) NSArray *domainAddrs_DNS;

// VNI
@property (nonatomic, weak) N2PacketRule *matchRule_K1;

- (instancetype)init_WithData:(NSData *)data
                    outgoing:(BOOL)flag;

+ (instancetype)packet_WithData:(NSData *)data
                      outgoing:(BOOL)flag;

+ (NSData *)udpPacketData_WithSourceIP:(u_int32_t)sourceIP
                           sourcePort:(u_int16_t)sourcePort
                        destinationIP:(u_int32_t)destinationIP
                      destinationPort:(u_int16_t)destinationPort
                          payloadData:(NSData *)payloadData;

+ (instancetype)udpPacket_WithSourceIP:(u_int32_t)sourceIP
                           sourcePort:(u_int16_t)sourcePort
                        destinationIP:(u_int32_t)destinationIP
                      destinationPort:(u_int16_t)destinationPort
                          payloadData:(NSData *)payloadData;

- (void)replaceDestinationWith_IP:(u_int32_t)IP;

- (void)updateChecksum_IP;

@end
