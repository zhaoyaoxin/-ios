
//
//  K1UDPSocket.h
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <NetworkExtension/NetworkExtension.h>

@class K1UDPSocket;

@protocol K1UDPSocketDelegate <NSObject>

- (void)didReceiveDatas:(NSArray *)datas from:(K1UDPSocket *)socket;

@end

@interface K1UDPSocket : NSObject

@property (nonatomic, weak) id<K1UDPSocketDelegate> delegate_k1;
@property (nonatomic, strong) NWUDPSession *session;
@property (nonatomic, copy) NSString *host;
@property (nonatomic, assign) NSInteger port;

- (instancetype)initWithHost_K1:(NSString *)host port:(NSInteger)port;
- (void)writeDatas_K1:(NSArray *)datas;
- (void)writeData_K1:(NSData *)data toHost:(NSString *)host port:(NSInteger)port;
- (void)disconnect;

@end
