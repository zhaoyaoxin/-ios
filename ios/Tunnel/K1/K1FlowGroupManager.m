//
//  K1PacketFlowController.m
//  Gnwj
//
//  Created by Z0 on 31/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1FlowGroupManager.h"
#import "K1FlowGroup.h"
#import "K1Utils.h"
#import <NetworkExtension/NetworkExtension.h>

@interface K1FlowGroupManager ()

@property (nonatomic, strong) NSMutableDictionary *flowGroupsMap;

@end

@implementation K1FlowGroupManager

- (instancetype)initWithSpeedInfo_AllFlowGroup:(K1M_SPEED_START_INFO *)info
{
    self = [super init];
    if ( self ) {
        self.blackRoutes_All = [NSMutableArray array];
        self.flowGroupsMap = [NSMutableDictionary dictionary];
        self.flowGroups_All = [NSMutableArray array];
        self.flowId_All = [info.flow_id integerValue];
        [self extractFlowGroupWithSpeedInfo:info];

        LOG_ExpObj(info);
        LOG_ExpObj(self.flowGroupsMap);
    }
    
    return self;
}

- (NSUInteger)caculateHashKeyFor:(K1FlowGroup *)flowGroup
{
    NSMutableString *keys = [NSMutableString string];
    
    for ( K1M_ENTRANCE *eachEntrance in flowGroup.entrances_OneFlowGroup ) {
        [keys appendString:eachEntrance.ip ?: @""];
        [keys appendString:@"#"];
        // 端口参与 hash，避免同 IP 不同端口被合并成一组
        if ([eachEntrance.port isKindOfClass:[NSArray class]]) {
            NSArray *ports = [eachEntrance.port sortedArrayUsingSelector:@selector(compare:)];
            [keys appendString:[ports componentsJoinedByString:@","]];
        }
        [keys appendString:@";"];
    }
    
    for ( K1M_EXIT *eachExit in flowGroup.exits_OneFlowGroup ) {
        [keys appendFormat:@"%@|%@;", eachExit.addr ?: @"", eachExit.nat ?: @""];
    }
    
    [keys appendFormat:@"L%ld", (long)flowGroup.flowLevel_OneFlowGroup];
    
    return [keys hash];
}

- (K1FlowGroup *)flowGroupWithEntrances:(NSArray *)entrances
                                  exits:(NSArray *)exits
                                  level:(NSInteger)level
                                   name:(NSString *)name
{
    if ( [exits count] == 0 || [entrances count] == 0 ) {
        return nil;
    }
    
    K1FlowGroup *group = [K1FlowGroup new];
    group.flowLevel_OneFlowGroup = level;
    group.entrances_OneFlowGroup = entrances;
    group.exits_OneFlowGroup = exits;
    group.flowId_OneFlowGroup = self.flowId_All;
    group.rx_OneFlowGroup = 200;
    group.tx_OneFlowGroup = 200;
    group.ruleIds_OneFlowGroup = [NSMutableArray array];
    group.groupName_OneFlowGroup = name;
    
    NSUInteger hash = [self caculateHashKeyFor:group];
    K1FlowGroup *result = self.flowGroupsMap[@(hash)];
    
    if ( result ) {
        LOG_INFO(@"already has same flow group");
        return result;
    }
    
    group.groupId_OneFlowGroup = hash;
    self.flowGroupsMap[@(hash)] = group;
    [self.flowGroups_All addObject:group];
    
    result = group;
    
    return result;
}

- (void)extractFlowGroupWithSpeedInfo:(K1M_SPEED_START_INFO *)speedInfo
{
    // 白名单,如果出口，入口，traffic_level相同（hash 后设置给groupId_OneFlowGroup），执行 合并。 并更新eachRule.traffic_id（id ）为groupId_OneFlowGroup
    //ruleIds_OneFlowGroup 用于记录原始规则id
    for ( K1M_TRAFFIC_GROUP *eachGroup in speedInfo.vni_array ) {
        K1FlowGroup *group = [self flowGroupWithEntrances:eachGroup.entrance
                                                    exits:eachGroup.exits
                                                    level:[eachGroup.traffic_level integerValue]
                                                     name:@""];
        if (!group) {
            DDLogWarn(@"Skip traffic group %@ : failed to build flow group", eachGroup.id);
            continue;
        }
        for ( K1M_TRAFFIC_RULE *eachRule in eachGroup.dest ) {
            eachRule.traffic_id = @(group.groupId_OneFlowGroup);
        }
        
        if ( eachGroup.id ) {
            [group.ruleIds_OneFlowGroup addObject:eachGroup.id];
        }
    }
}

- (K1FlowGroup *)groupForId:(NSUInteger)groupId
{
    return self.flowGroupsMap[@(groupId)];
}

// 寻找最优路径
- (void)start_AllFlowGroup
{
    for ( K1FlowGroup *eachGroup in self.flowGroups_All ) {
        [eachGroup startResolving_OneFlowGroup];
    }
}

- (void)stop_AllFlowGroup
{
    for ( K1FlowGroup *eachGroup in self.flowGroups_All ) {
        [eachGroup stop_OneFlowGroup];
    }
}

@end
