//
//  K1PacketRuleController.h
//  Gnwj
//
//  Created by Z0 on 30/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>

#import "K1Kit.h"
#import "RuleKit.h"

@interface K1PacketRuleManager : NSObject

@property (nonatomic, strong) NSMutableArray *blackRoutes;

- (instancetype)initWith_SpeedInfo:(K1M_SPEED_START_INFO *)info;
- (instancetype)initWithSpeedInfo_json:(NSDictionary *)speedInfo;

- (BOOL)session_WithPacket:(NSData *)packet
                  session:(struct ip_session_info *)session
                 outgoing:(BOOL)outgoing;

- (BOOL)session:(struct ip_session_info *)session
   check_Black:(struct traffic_rule_info *)blackRule;

- (BOOL)session:(struct ip_session_info *)session
   check_White:(struct traffic_rule_info *)whiteRule;

- (BOOL)session:(struct ip_session_info *)session
     check_DNS:(struct dns_rule_info *)dnsRule;

@end
