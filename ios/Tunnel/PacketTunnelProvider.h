//
//  PacketTunnelProvider.h
//  PureNetworkExtension
//
//  Created by AI Assistant on 2025.
//  Copyright © 2025. All rights reserved.
//

#import <NetworkExtension/NetworkExtension.h>
#import "K1Kit.h"
#import "RuleKit.h"
#import "K1PacketRouter.h"

@class K1PacketRouter;

@interface PacketTunnelProvider : NEPacketTunnelProvider <K1PacketRouterDelegate>

@end
