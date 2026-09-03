//
//  K1PacketRouter.h
//  Gnwj
//
//  Created by Z0 on 01/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "K1FlowGroup.h"

@class K1PacketRouter;

@protocol K1PacketRouterDelegate <NSObject>
- (void)incomingIPPacket:(NSData *)packet fromRouter:(K1PacketRouter *)router;
@end

@interface K1PacketRouter : NSObject

@property (nonatomic, weak) id<K1PacketRouterDelegate> delegate;
@property (nonatomic, strong, readonly) NSArray *flowGroups;
@property (nonatomic, assign, readonly) uint64_t RX_bytes;
@property (nonatomic, assign, readonly) uint64_t TX_bytes;
@property (nonatomic, assign, readonly) uint64_t RX_packets;
@property (nonatomic, assign, readonly) uint64_t TX_packets;
/// 选路结果（Main_Speed_Path_Info），供宿主通过 IPC 拉取
@property (nonatomic, strong, readonly) NSDictionary *mainSpeedPathInfo;
@property (nonatomic, copy, nullable) void (^onAllPathsResolved)(BOOL anyReady);

- (instancetype)initWithOptions:(NSDictionary *)options
                         tunnel:(id)tunnel;

- (void)start_K1;
- (void)stop_K1;
- (BOOL)routePacket_K1:(NSData *)packet;
- (NEPacketTunnelNetworkSettings *)createTunnelNetworkSettings;
- (void)doHeartBeat_K1;
- (NSUInteger)flowGroupCount;

@end

