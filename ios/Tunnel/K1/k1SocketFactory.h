//
//  K1SocketFactory.h
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <NetworkExtension/NetworkExtension.h>

@interface K1SocketFactory : NSObject

@property (nonatomic, weak) NETunnelProvider *tunnelProvider;

+ (instancetype)currentFactory_K1;

@end
