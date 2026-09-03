//
//  K1FlowGroup.h
//  Gnwj
//
//  Created by Z0 on 01/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "K1UDPSocket.h"
#import "K1Kit.h"

typedef NS_ENUM(NSInteger, K1FlowGroupStatus) {
    K1FlowGroupStatusInvalid = -1,
    K1FlowGroupStatusInit = 0,
    K1FlowGroupStatusDetecting,
    K1FlowGroupStatusResolving,
    K1FlowGroupStatusReady,
    K1FlowGroupStatusActive,
    K1FlowGroupStatusTimeout
};

@class K1FlowGroup;

@interface K1ResolveResultItem : NSObject
@property (nonatomic, strong) K1M_ENTRANCE *entrance_OneFlowGroup;
@property (nonatomic, strong) K1M_EXIT *exit_OneFlowGroup;
@property (nonatomic, assign) NSInteger score_OneFlowGroup;
@property (nonatomic, assign) NSInteger flowLevel_OneFlowGroup;
@property (nonatomic, assign) NSInteger port_OneFlowGroup;
@property (nonatomic, assign) NSInteger A_Delay;
@property (nonatomic, assign) NSInteger A_Lost;
@property (nonatomic, assign) NSInteger A_Score;
@property (nonatomic, assign) NSInteger B_Delay;
@property (nonatomic, assign) NSInteger B_Lost;
@property (nonatomic, assign) NSInteger B_Score;
@end


@protocol K1FlowGroupDelegate <NSObject>
- (void)flowPacket:(NSData *)packet fromFlowGroup:(K1FlowGroup *)flowGroup;
- (void)successResolving:(K1ResolveResultItem *)result fromFlowGroup:(K1FlowGroup *)flowGroup;
- (void)flowGroupFaildResolving:(K1FlowGroup *)flowGroup;
- (void)finishResolvingWithAllResults:(NSArray *)results fromFlowGroup:(K1FlowGroup *)flowGroup;
@end

//K1FlowGroup 个数。 groupId_OneFlowGroup由 白名单,出口，入口，traffic_level（hash 后设置给groupId_OneFlowGroup）。将规则和线路，通过groupId_OneFlowGroup链接
@interface K1FlowGroup : NSObject

@property (nonatomic, weak) id<K1FlowGroupDelegate> delegate_OneFlowGroup;
@property (nonatomic, assign) NSUInteger groupId_OneFlowGroup;                 // 本地唯一ID（哈希生成）traffic_id flow.id 并且最终匹配规则中用的id也是这个
@property (nonatomic, assign) NSInteger flowId_OneFlowGroup;                   // 流ID（来自 speedInfo.flow_id）转发必须
@property (nonatomic, copy) NSString *groupName_OneFlowGroup;
@property (nonatomic, assign) NSInteger flowLevel_OneFlowGroup;                // 路径等级（QoS）转发必须
@property (nonatomic, assign) K1FlowGroupStatus status_OneFlowGroup;

@property (nonatomic, assign) uint16_t rx_OneFlowGroup;
@property (nonatomic, assign) uint16_t tx_OneFlowGroup;
@property (nonatomic, assign) uint16_t heartDelay_OneFlowGroup;
@property (nonatomic, assign) uint64_t heartSent_OneFlowGroup;
@property (nonatomic, assign) uint64_t heartRecived_OneFlowGroup;

@property (nonatomic, strong) NSArray *entrances_OneFlowGroup;                 // 入口列表（IP+端口）
@property (nonatomic, strong) NSArray *exits_OneFlowGroup;                     // 出口列表（addr+k1name, nat+IP）

@property (nonatomic, strong) K1M_ENTRANCE *resolveEntrance_OneFlowGroup;      // 当前选中的入口
@property (nonatomic, strong) K1M_EXIT *resolveExit_OneFlowGroup;              // 当前选中的出口

@property (nonatomic, strong) NSNumber *ruleId_OneFlowGroup;
@property (nonatomic, strong) NSMutableArray *ruleIds_OneFlowGroup;

- (void)startResolving_OneFlowGroup;
- (void)stop_OneFlowGroup;
- (BOOL)inputPacket_OneFlowGroup:(NSData *)packet;

// 新增方法声明
- (void)startHeartBeat;
- (void)stopHeartBeat;

@end
