#import "VPNControllerBridge.h"
#import "VPNController.h"
#import "Headers.h"
#import "DownloadSpeedTester.h"
#import <React/RCTLog.h>
#import <React/RCTEventEmitter.h>
#import <TargetConditionals.h>

static NSString *const VPNSimulatorMessage = @"iOS 模拟器不支持 VPN 加速，请连接 iPhone 真机测试。";

@implementation VPNControllerBridge

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (NSDictionary *)constantsToExport {
    return @{@"isSimulator": @(TARGET_OS_SIMULATOR)};
}

// 支持的事件列表
- (NSArray<NSString *> *)supportedEvents {
    return @[@"SpeedTestProgress", @"SpeedTestComplete"];
}

// 加载系统
RCT_EXPORT_METHOD(loadSys:(int)mode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        int rc = GN_LoadSys(mode);
        if (rc < 0) {
            reject(@"VPN_LOAD_ERROR", @"Failed to load VPN system", nil);
            return;
        }
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"VPN_LOAD_ERROR", exception.reason, nil);
    }
}

// 启动加速
RCT_EXPORT_METHOD(start:(NSString *)jsonPathResult
                  jsonGamesRules:(NSString *)jsonGamesRules
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#if TARGET_OS_SIMULATOR
    reject(@"VPN_UNSUPPORTED_ENVIRONMENT", VPNSimulatorMessage, nil);
    return;
#endif
    @try {
        const char* path = [jsonPathResult UTF8String];
        const char* rules = [jsonGamesRules UTF8String];
        
        int rc = GN_Start(path, rules);
        if (rc < 0) {
            reject(@"VPN_START_ERROR", @"Failed to start VPN", nil);
            return;
        }
        GN_WaitForConnected(VPN_Start_Connected_Timeout_Sec, ^(BOOL connected, NSString *errorMessage) {
            if (connected) {
                resolve(@YES);
            } else {
                reject(@"VPN_START_ERROR", errorMessage ?: @"Failed to start VPN", nil);
            }
        });
    } @catch (NSException *exception) {
        reject(@"VPN_START_ERROR", exception.reason, nil);
    }
}

// 停止加速
RCT_EXPORT_METHOD(stop:(int)mode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        int rc = GN_Stop(mode);
        if (rc < 0) {
            reject(@"VPN_STOP_ERROR", @"Failed to stop VPN", nil);
            return;
        }
        resolve(@YES);
    } @catch (NSException *exception) {
        reject(@"VPN_STOP_ERROR", exception.reason, nil);
    }
}

// 获取流量信息
RCT_EXPORT_METHOD(getTrafficInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        uint64_t sentBytes = 0;
        uint64_t receivedBytes = 0;
        
        BOOL success = GN_GetTrafficInfo(&sentBytes, &receivedBytes);
        if (success) {
            NSDictionary *result = @{
                @"sendBytes": @(sentBytes),
                @"receiveBytes": @(receivedBytes)
            };
            resolve(result);
        } else {
            reject(@"VPN_TRAFFIC_ERROR", @"Failed to get traffic info", nil);
        }
    } @catch (NSException *exception) {
        reject(@"VPN_TRAFFIC_ERROR", exception.reason, nil);
    }
}

// 获取速度信息
RCT_EXPORT_METHOD(getSpeedInfo:(int)mode
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        const char* info = GN_GetSpeedInfo(mode);
        if (info) {
            NSString *jsonString = [NSString stringWithUTF8String:info];
            // 尝试解析为 JSON 对象
            NSError *jsonError;
            NSData *jsonData = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
            id jsonObject = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&jsonError];
            
            if (jsonObject && !jsonError) {
                resolve(jsonObject);
            } else {
                resolve(jsonString);
            }
        } else {
            reject(@"VPN_SPEED_ERROR", @"Failed to get speed info", nil);
        }
    } @catch (NSException *exception) {
        reject(@"VPN_SPEED_ERROR", exception.reason, nil);
    }
}

// 静态变量存储 speedTester 实例
static DownloadSpeedTester *g_speedTester = nil;

// 开始网络测速
RCT_EXPORT_METHOD(testSpeed:(NSString *)testURL
                  timeout:(double)timeout
                  updateIntervalMs:(double)updateIntervalMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        // 懒加载 speedTester
        if (!g_speedTester) {
            g_speedTester = [[DownloadSpeedTester alloc] init];
        }
        
        // 如果 URL 为空，使用默认 URL
        NSString *urlString = testURL;
        if (!urlString || [urlString length] == 0) {
            urlString = @"https://speed.cloudflare.com/__down?during=download&bytes=1073741824";
        }
        
        // 默认值
        NSTimeInterval timeoutInterval = timeout > 0 ? timeout : 30.0;
        NSTimeInterval updateInterval = updateIntervalMs > 0 ? updateIntervalMs : 1000.0;
        
        // 启动测速
        [g_speedTester startWithURLString:urlString
                                   timeout:timeoutInterval
                          updateIntervalMs:updateInterval
                                onProgress:^(double progress, double speedKbps) {
                                    // 发送进度事件到 React Native
                                    NSLog(@"发送进度事件: progress=%.2f, speedKbps=%.2f", progress, speedKbps);
                                    [self sendEventWithName:@"SpeedTestProgress"
                                                       body:@{
                                                           @"progress": @(progress),
                                                           @"speedKbps": @(speedKbps)
                                                       }];
                                }
                              onComplete:^(DownloadSpeedResult *result, NSError *error) {
                                  // 发送完成事件到 React Native
                                  NSLog(@"发送完成事件: result=%@, error=%@", result, error);
                                  NSMutableDictionary *eventBody = [NSMutableDictionary dictionary];
                                  
                                  if (result) {
                                      NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
                                      formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ssZ";
                                      
                                      eventBody[@"result"] = @{
                                          @"fileSizeBytes": @(result.fileSizeBytes),
                                          @"fileSizeKB": @(result.fileSizeKB),
                                          @"durationMs": @(result.durationMs),
                                          @"averageSpeedKbps": @(result.averageSpeedKbps),
                                          @"startTime": [formatter stringFromDate:result.startTime],
                                          @"endTime": [formatter stringFromDate:result.endTime]
                                      };
                                  }
                                  
                                  if (error) {
                                      eventBody[@"error"] = @{
                                          @"code": @(error.code),
                                          @"message": error.localizedDescription ?: @"Unknown error"
                                      };
                                  }
                                  
                                  [self sendEventWithName:@"SpeedTestComplete" body:eventBody];
                              }];
        
        // 立即返回成功，实际结果通过事件通知
        resolve(@(YES));
    } @catch (NSException *exception) {
        reject(@"VPN_TEST_SPEED_ERROR", exception.reason, nil);
    }
}

@end
