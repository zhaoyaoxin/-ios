//
//  K1PacketFlowController.h
//  Gnwj
//
//  Created by Z0 on 31/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "K1FlowGroup.h"

@interface K1FlowGroupManager : NSObject

@property (nonatomic, strong) NSMutableArray *flowGroups_All;
@property (nonatomic, strong) NSMutableArray *blackRoutes_All;
@property (nonatomic, assign) NSInteger flowId_All;

- (instancetype)initWithSpeedInfo_AllFlowGroup:(K1M_SPEED_START_INFO *)info;

- (K1FlowGroup *)groupForId:(NSUInteger)groupId;

- (void)start_AllFlowGroup;
- (void)stop_AllFlowGroup;

@end
