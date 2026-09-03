#import "VPNConfig.h"

@implementation VPNConfig

+ (NSDictionary *)defaultConfig {
    return @{
        @"server_address": @"gnwj-server.example.com",
        @"encryption": @"AES-256-GCM",
        @"protocol": @"udp",
        @"dns_servers": @[@"1.1.1.1", @"8.8.8.8"]
    };
}

+ (BOOL)validateConfig:(NSDictionary *)config {
    if (![config isKindOfClass:[NSDictionary class]]) return NO;
    if (![config[@"server_address"] isKindOfClass:[NSString class]]) return NO;
    if (![config[@"encryption"] isKindOfClass:[NSString class]]) return NO;
    return YES;
}

@end
