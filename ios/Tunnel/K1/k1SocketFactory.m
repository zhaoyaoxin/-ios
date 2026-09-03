//
//  K1SocketFactory.m
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1SocketFactory.h"

@implementation K1SocketFactory

+ (instancetype)currentFactory_K1
{
    static dispatch_once_t pred;
    __strong static id sharedInstance = nil;
    
    dispatch_once(&pred, ^{
        sharedInstance = [[self alloc] init];
    });
    
    return sharedInstance;
}
/*
- (NWUDPSession *)createUDPSessionToEndpoint:(NWEndpoint *)endpoint fromEndpoint:(NWEndpoint *)localEndpoint {
    if (!self.tunnelProvider) {
        DDLogError(@"Cannot create UDP session: tunnelProvider is nil. "
                  "Make sure to call setTunnelProvider: before creating sockets.");
        return nil;
    }
    
    return [self.tunnelProvider createUDPSessionToEndpoint:endpoint fromEndpoint:localEndpoint];
}
*/
@end
