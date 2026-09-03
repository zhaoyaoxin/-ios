#import <Foundation/Foundation.h>

@interface VPNConfig : NSObject
+ (NSDictionary *)defaultConfig;
+ (BOOL)validateConfig:(NSDictionary *)config;
@end
