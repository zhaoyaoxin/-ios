//
//  K1DNSServer.h
//  Gnwj
//
//  Created by Z0 on 07/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "K1UDPSocket.h"
#import "N2IPPacket.h"

@class K1DNSServer;

@protocol K1DNSServerDelegate <NSObject>

- (void)didReceiveDatas:(NSArray *)datas fromDNS:(K1DNSServer *)dns;

@end

@interface K1DNSServer : NSObject

@property (nonatomic, strong) K1UDPSocket *socket_DNS;
@property (nonatomic, weak) id<K1DNSServerDelegate> delegate_DNS;
@property (nonatomic, assign) BOOL started_DNS;

- (instancetype)initWithDNSServer_DNS:(NSString *)dnsServer;

- (void)start_DNS;
- (void)stop_DNS;
- (BOOL)processDNSQueryPacket_DNS:(N2IPPacket *)packet;

@end
