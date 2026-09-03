//
//  VPNController.m
//  GnwjNet
//
//  Created by Z0 on 2025.
//  Copyright © 2025 gnwj. All rights reserved.
//


#import "VPNController.h"
#import "VPNConfig.h"
#import <NetworkExtension/NetworkExtension.h>
#import <dispatch/dispatch.h>
#import <string.h>
#import "Headers.h"
#import <arpa/inet.h>
#import <ifaddrs.h>
#import <net/if.h>
#import <netinet/in.h>
#import <netinet6/in6.h>
#import <sys/socket.h>
#import <sys/sysctl.h>
#import <objc/runtime.h>
#import <UIKit/UIKit.h>
#import <SystemConfiguration/SystemConfiguration.h>

#import "GnwjLogger.h"

// 用 GnwjLogger 替代 NSLog
#define NSLog(frmt, ...) [[GnwjLogger shared] info:(frmt), ##__VA_ARGS__]

// 静态变量
static NETunnelProviderManager *vpnManager = nil;
static uint64_t sentBytes = 0;
static uint64_t receivedBytes = 0;
static dispatch_source_t trafficTimer = NULL;
static NSMutableDictionary *speedInfo = nil;
static dispatch_queue_t vpnQueue = NULL;
static id statusObserverToken = nil; // 用于存储观察者令牌
static BOOL userHasAcceptedRules = NO; // 用户是否已接受规则
static NSDictionary *currentRules = nil; // 当前应用的规则
static NSDate *lastRuleAcceptanceDate = nil; // 上次接受规则的日期
static SCNetworkReachabilityRef networkReachability = NULL; // 网络可达性对象

// 用于GN_GetSpeedInfo的引用计数内存管理
static char *speedInfoResult = NULL;
static int speedInfoResultRefCount = 0;

static NSInteger startEpoch = 0;
static BOOL startPipelineActive = NO;
static BOOL startSawConnecting = NO;
static BOOL startReachedConnected = NO;
static BOOL startHasFailed = NO;
static NSString *startFailMessage = nil;
static BOOL startTunnelSubmitted = NO;
static BOOL startWaitingForIdle = NO;
static int leftoverStopRetries = 0;
static NSInteger pendingStartEpoch = 0;
static NSString *pendingStartPath = nil;
static NSString *pendingStartRule = nil;
static GNVPNWaitCompletion pendingWaitCompletion = nil;
static dispatch_source_t startWaitTimer = NULL;
static NSTimeInterval pendingPostSubmitTimeout = VPN_Start_Connected_Timeout_Sec;

static NSTimeInterval ConnectedWaitTimeout(NSTimeInterval requested) {
    NSTimeInterval t = requested > 0 ? requested : VPN_Start_Connected_Timeout_Sec;
    NSTimeInterval floor = VPN_Start_Path_Resolve_Timeout_Sec + VPN_Start_Debug_Attach_Sec + 5.0;
    if (t < floor) {
        NSLog(@"Connected wait %.0fs below path/attach floor %.0fs, clamping", t, floor);
        return floor;
    }
    return t;
}

/// 从规则 JSON 解析加速路由模式；缺省为国内加速国外 (abroad)
/// 与 Tunnel 侧一致：规则字段优先于其它来源；支持 NSString / NSDictionary
static NSString *ResolveAccelRouteMode(id ruleInput) {
    NSDictionary *dict = nil;
    if ([ruleInput isKindOfClass:[NSDictionary class]]) {
        dict = (NSDictionary *)ruleInput;
    } else if ([ruleInput isKindOfClass:[NSString class]]) {
        NSString *ruleJsonStr = (NSString *)ruleInput;
        if (ruleJsonStr.length == 0) {
            return AccelRouteModeAbroad;
        }
        NSData *data = [ruleJsonStr dataUsingEncoding:NSUTF8StringEncoding];
        if (!data) {
            return AccelRouteModeAbroad;
        }
        id obj = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if (![obj isKindOfClass:[NSDictionary class]]) {
            return AccelRouteModeAbroad;
        }
        dict = (NSDictionary *)obj;
    } else {
        return AccelRouteModeAbroad;
    }
    id raw = dict[Accel_Route_Mode_JSON_Key];
    if (!raw || raw == [NSNull null]) {
        raw = dict[Accel_Route_Mode_Key];
    }
    if (raw == [NSNull null]) {
        return AccelRouteModeAbroad;
    }
    if ([raw isKindOfClass:[NSNumber class]]) {
        return ([(NSNumber *)raw integerValue] == 2) ? AccelRouteModeChina : AccelRouteModeAbroad;
    }
    if ([raw isKindOfClass:[NSString class]]) {
        NSString *s = [[(NSString *)raw stringByTrimmingCharactersInSet:
                        [NSCharacterSet whitespaceAndNewlineCharacterSet]] lowercaseString];
        if (s.length == 0) {
            return AccelRouteModeAbroad;
        }
        if ([s isEqualToString:AccelRouteModeChina] ||
            [s isEqualToString:@"to_china"] ||
            [s isEqualToString:@"china_only"] ||
            [s isEqualToString:@"2"]) {
            return AccelRouteModeChina;
        }
    }
    return AccelRouteModeAbroad;
}

static NSDictionary *BuildTunnelStartOptions(NSString *pathJsonStr, NSString *ruleJsonStr) {
    NSString *mode = ResolveAccelRouteMode(ruleJsonStr);
    return @{
        Path_Key: pathJsonStr ?: @"",
        Rule_Key: ruleJsonStr ?: @"",
        Accel_Route_Mode_Key: mode
    };
}

// 定义Apple关键服务列表
static NSArray * const kAppleCriticalServices = @[
    @"apple.com",
    @"icloud.com",
    @"testflight.apple.com",
    @"apps.apple.com",
    @"buy.itunes.apple.com",
    @"phobos.apple.com",
    @"mesu.apple.com",
    @"gs.apple.com",
    @"guzzoni.apple.com",
    @"appldnld.apple.com",
    @"adcdownload.apple.com",
    @"ocsp.apple.com",
    @"crl.apple.com",
    @"init.itunes.apple.com",
    @"api.smoot.apple.com",
    @"gsp10-ssl.ls.apple.com",
    @"gateway.icloud.com",
    @"icloud-content.com",
    @"idmsa.apple.com",
    @"appleid.apple.com",
    @"keyvalueservice.icloud.com",
    @"init-p01st.smoot.apple.com",
    @"init-p03st.smoot.apple.com",
    @"init-p05st.smoot.apple.com",
    @"init-p07st.smoot.apple.com",
    @"init-p09st.smoot.apple.com",
    @"init-p11st.smoot.apple.com",
    @"init-p13st.smoot.apple.com",
    @"init-p15st.smoot.apple.com",
    @"init-p17st.smoot.apple.com",
    @"init-p19st.smoot.apple.com",
    @"init-p21st.smoot.apple.com",
    @"init-p23st.smoot.apple.com",
    @"init-p25st.smoot.apple.com",
    @"init-p27st.smoot.apple.com",
    @"init-p29st.smoot.apple.com",
    @"init-p31st.smoot.apple.com",
    @"init-p33st.smoot.apple.com",
    @"init-p35st.smoot.apple.com",
    @"init-p37st.smoot.apple.com",
    @"init-p39st.smoot.apple.com",
    @"init-p41st.smoot.apple.com",
    @"init-p43st.smoot.apple.com",
    @"init-p45st.smoot.apple.com",
    @"init-p47st.smoot.apple.com",
    @"init-p49st.smoot.apple.com",
    @"init-p51st.smoot.apple.com",
    @"init-p53st.smoot.apple.com",
    @"init-p55st.smoot.apple.com",
    @"init-p57st.smoot.apple.com",
    @"init-p59st.smoot.apple.com",
    @"init-p61st.smoot.apple.com",
    @"init-p63st.smoot.apple.com",
    @"init-p65st.smoot.apple.com",
    @"init-p67st.smoot.apple.com",
    @"init-p69st.smoot.apple.com",
    @"init-p71st.smoot.apple.com",
    @"init-p73st.smoot.apple.com",
    @"init-p75st.smoot.apple.com",
    @"init-p77st.smoot.apple.com",
    @"init-p79st.smoot.apple.com",
    @"init-p81st.smoot.apple.com",
    @"init-p83st.smoot.apple.com",
    @"init-p85st.smoot.apple.com",
    @"init-p87st.smoot.apple.com",
    @"init-p89st.smoot.apple.com",
    @"init-p91st.smoot.apple.com",
    @"init-p93st.smoot.apple.com",
    @"init-p95st.smoot.apple.com",
    @"init-p97st.smoot.apple.com",
    @"init-p99st.smoot.apple.com",
    @"init-p101st.smoot.apple.com",
    @"init-p103st.smoot.apple.com",
    @"init-p105st.smoot.apple.com",
    @"init-p107st.smoot.apple.com",
    @"init-p109st.smoot.apple.com",
    @"init-p111st.smoot.apple.com",
    @"init-p113st.smoot.apple.com",
    @"init-p115st.smoot.apple.com",
    @"init-p117st.smoot.apple.com",
    @"init-p119st.smoot.apple.com",
    @"init-p121st.smoot.apple.com",
    @"init-p123st.smoot.apple.com",
    @"init-p125st.smoot.apple.com",
    @"init-p127st.smoot.apple.com",
    @"init-p129st.smoot.apple.com",
    @"init-p131st.smoot.apple.com",
    @"init-p133st.smoot.apple.com",
    @"init-p135st.smoot.apple.com",
    @"init-p137st.smoot.apple.com",
    @"init-p139st.smoot.apple.com",
    @"init-p141st.smoot.apple.com",
    @"init-p143st.smoot.apple.com",
    @"init-p145st.smoot.apple.com",
    @"init-p147st.smoot.apple.com",
    @"init-p149st.smoot.apple.com",
    @"init-p151st.smoot.apple.com",
    @"init-p153st.smoot.apple.com",
    @"init-p155st.smoot.apple.com",
    @"init-p157st.smoot.apple.com",
    @"init-p159st.smoot.apple.com",
    @"init-p161st.smoot.apple.com",
    @"init-p163st.smoot.apple.com",
    @"init-p165st.smoot.apple.com",
    @"init-p167st.smoot.apple.com",
    @"init-p169st.smoot.apple.com",
    @"init-p171st.smoot.apple.com",
    @"init-p173st.smoot.apple.com",
    @"init-p175st.smoot.apple.com",
    @"init-p177st.smoot.apple.com",
    @"init-p179st.smoot.apple.com",
    @"init-p181st.smoot.apple.com",
    @"init-p183st.smoot.apple.com",
    @"init-p185st.smoot.apple.com",
    @"init-p187st.smoot.apple.com",
    @"init-p189st.smoot.apple.com",
    @"init-p191st.smoot.apple.com",
    @"init-p193st.smoot.apple.com",
    @"init-p195st.smoot.apple.com",
    @"init-p197st.smoot.apple.com",
    @"init-p199st.smoot.apple.com",
    @"init-p201st.smoot.apple.com",
    @"init-p203st.smoot.apple.com",
    @"init-p205st.smoot.apple.com",
    @"init-p207st.smoot.apple.com",
    @"init-p209st.smoot.apple.com",
    @"init-p211st.smoot.apple.com",
    @"init-p213st.smoot.apple.com",
    @"init-p215st.smoot.apple.com",
    @"init-p217st.smoot.apple.com",
    @"init-p219st.smoot.apple.com",
    @"init-p221st.smoot.apple.com",
    @"init-p223st.smoot.apple.com",
    @"init-p225st.smoot.apple.com",
    @"init-p227st.smoot.apple.com",
    @"init-p229st.smoot.apple.com",
    @"init-p231st.smoot.apple.com",
    @"init-p233st.smoot.apple.com",
    @"init-p235st.smoot.apple.com",
    @"init-p237st.smoot.apple.com",
    @"init-p239st.smoot.apple.com",
    @"init-p241st.smoot.apple.com",
    @"init-p243st.smoot.apple.com",
    @"init-p245st.smoot.apple.com",
    @"init-p247st.smoot.apple.com",
    @"init-p249st.smoot.apple.com",
    @"init-p251st.smoot.apple.com",
    @"init-p253st.smoot.apple.com",
    @"init-p255st.smoot.apple.com"
];

/*
// 检查域名是否为关键服务
static BOOL isCriticalServiceDomain(NSString *domain) {
    if (!domain) return NO;
    
    // 精确匹配
    for (NSString *service in kAppleCriticalServices) {
        if ([domain isEqualToString:service]) {
            return YES;
        }
    }
    
    // 后缀匹配
    for (NSString *service in kAppleCriticalServices) {
        if ([domain hasSuffix:[@"." stringByAppendingString:service]]) {
            return YES;
        }
    }
    
    return NO;
}

// 检查规则是否过于宽泛
static BOOL isOverlyBroadRule(NSString *domain) {
    if (!domain) return NO;
    
    // 检查通配符规则
    if ([domain isEqualToString:@"*"] ||
        [domain isEqualToString:@"*.com"] ||
        [domain isEqualToString:@"*.net"] ||
        [domain isEqualToString:@"*.org"] ||
        [domain isEqualToString:@"*.co.uk"] ||
        [domain isEqualToString:@"*.jp"] ||
        [domain isEqualToString:@"*.de"] ||
        [domain isEqualToString:@"*.fr"] ||
        [domain isEqualToString:@"*.it"] ||
        [domain isEqualToString:@"*.es"] ||
        [domain isEqualToString:@"*.ru"] ||
        [domain isEqualToString:@"*.br"] ||
        [domain isEqualToString:@"*.cn"]) {
        return YES;
    }
    
    return NO;
}
*/
// 检查规则版本是否兼容
static NSString * const kCurrentRuleVersion = @"1.0.0";


static BOOL isRuleVersionCompatible(NSDictionary *rules) {
    NSString *ruleVersion = rules[@"version"];
    if (!ruleVersion) return YES;
    
    /*
    // 比较版本号
    NSArray *currentParts = [kCurrentRuleVersion componentsSeparatedByString:@"."];
    NSArray *ruleParts = [ruleVersion componentsSeparatedByString:@"."];
    
    for (NSUInteger i = 0; i < MIN(currentParts.count, ruleParts.count); i++) {
        if ([ruleParts[i] integerValue] < [currentParts[i] integerValue]) {
            return NO; // 规则版本过旧
        }
    }
    */
    
    return YES;
}


// 定义错误代码枚举
typedef NS_ENUM(NSInteger, VPNErrorCode) {
    VPNError_3001 = 3001,
    VPNError_3002 = 3002,
    VPNErrorCriticalServiceBlocked = 3006,
    VPNErrorOverlyBroadRules = 3007,
    VPNErrorRuleVersionIncompatible = 3008,
    // ... 其他错误代码
};

// 设置错误状态的统一方法
static void SetErrorState(VPNErrorCode code, NSString *additionalInfo) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (speedInfo) {
            speedInfo[@"status"] = @"error";
            NSString *errorDescription;
            
            switch (code) {
                case VPNErrorCriticalServiceBlocked:
                    errorDescription = @"规则包含对Apple关键服务的拦截";
                    break;
                case VPNErrorOverlyBroadRules:
                    errorDescription = @"规则过于宽泛，可能影响正常网络功能";
                    break;
                case VPNErrorRuleVersionIncompatible:
                    errorDescription = @"规则版本与应用不兼容";
                    break;
                default:
                    errorDescription = @"未知错误";
                    break;
            }
            
            speedInfo[@"error"] = [NSString stringWithFormat:@"%@%@", errorDescription, additionalInfo ? [@" - " stringByAppendingString:additionalInfo] : @""];
            speedInfo[@"error_code"] = @(code);
        }
    });
}

#pragma mark - Traffic Monitoring

// 获取真实网络流量
static void UpdateRealTrafficStats() {
    // 仅在连接状态下执行
    if (!vpnManager || vpnManager.connection.status != NEVPNStatusConnected) {
        return;
    }
    
    NETunnelProviderSession *session = (NETunnelProviderSession *)vpnManager.connection;
    if (!session) {
        NSLog(@"Session object is nil during traffic update");
        return;
    }
    
    // 准备命令数据
    NSData *cmdData = [TunnelTrafficCMD dataUsingEncoding:NSUTF8StringEncoding];
    if (!cmdData) {
        NSLog(@"Command encoding failed for traffic update");
        return;
    }
    
    // 发送消息获取流量数据
    [session sendProviderMessage:cmdData
                     returnError:nil
                  responseHandler:^(NSData * _Nullable responseData) {
        if (!responseData) {
            NSLog(@"No response data received for traffic update");
            return;
        }
        
        // 解析JSON响应
        NSError *jsonError;
        NSDictionary *info = [NSJSONSerialization JSONObjectWithData:responseData
                                                            options:0
                                                              error:&jsonError];
        if (!info || jsonError) {
            NSLog(@"流量统计解析失败: %@", jsonError);
            dispatch_async(dispatch_get_main_queue(), ^{
                speedInfo[@"error"] = @"无法获取网络性能数据";
                speedInfo[@"error_code"] = @1001;
            });
            return;
        }
        
        // 安全获取流量数据
        NSNumber *txBytesNum = info[@"TX_bytes"];
        NSNumber *rxBytesNum = info[@"RX_bytes"];
        
        if (![txBytesNum isKindOfClass:[NSNumber class]] ||
            ![rxBytesNum isKindOfClass:[NSNumber class]]) {
            NSLog(@"流量数据类型错误");
            dispatch_async(dispatch_get_main_queue(), ^{
                speedInfo[@"error"] = @"流量数据格式错误";
                speedInfo[@"error_code"] = @1002;
            });
            return;
        }
        
        uint64_t TX_bytes = [txBytesNum unsignedLongLongValue];
        uint64_t RX_bytes = [rxBytesNum unsignedLongLongValue];
        
        // 安全获取性能指标
        double A_Sent = [info[@"A_Sent"] doubleValue];
        double A_Recived = [info[@"A_Recived"] doubleValue];
        uint16_t A_Delay = [info[@"A_Delay"] unsignedIntValue];
        
        // 线程安全更新全局状态
        dispatch_sync(vpnQueue, ^{
            // 更新流量计数器
            sentBytes = TX_bytes;
            receivedBytes = RX_bytes;
            

            // 从speedInfo获取历史值（解决静态变量线程安全问题）
            NSNumber *prevSentNum = speedInfo[@"prevSent"];
            uint64_t prevSent = prevSentNum ? [prevSentNum unsignedLongLongValue] : 0;
            
            NSNumber *prevReceivedNum = speedInfo[@"prevReceived"];
            uint64_t prevReceived = prevReceivedNum ? [prevReceivedNum unsignedLongLongValue] : 0;
            
            // 计算并更新速度（KB/s）
            uint64_t uploadSpeed = (TX_bytes - prevSent) / 1024;
            uint64_t downloadSpeed = (RX_bytes - prevReceived) / 1024;
            
            // 更新历史值
            speedInfo[@"prevSent"] = @(TX_bytes);
            speedInfo[@"prevReceived"] = @(RX_bytes);
            
            // 更新丢包率（安全计算，防止无效值）
            uint16_t packetLoss = 0;
            if (A_Sent > 0 && A_Recived >= 0 && A_Recived <= A_Sent) {
                double loss = (A_Sent - A_Recived) / A_Sent * 100;
                packetLoss = (uint16_t)loss;
                if (packetLoss > 100) packetLoss = 100; // 确保不超过100%
            }
            
            // 更新状态信息
            speedInfo[@"upload_speed"] = @(uploadSpeed);
            speedInfo[@"download_speed"] = @(downloadSpeed);
            speedInfo[@"total_sent"] = @(TX_bytes);
            speedInfo[@"total_received"] = @(RX_bytes);
            speedInfo[@"latency"] = @(A_Delay);
            speedInfo[@"packet_loss"] = @(packetLoss);

            // 选路信息：与参考端 GN_GetSpeedInfo Main_Speed_Path_Info 对齐
            id pathInfo = info[@"Main_Speed_Path_Info"];
            if ([pathInfo isKindOfClass:[NSDictionary class]]) {
                NSDictionary *prevPath = [speedInfo[@"Main_Speed_Path_Info"] isKindOfClass:[NSDictionary class]]
                    ? speedInfo[@"Main_Speed_Path_Info"]
                    : nil;
                // NSDictionary 深度相等：避免流量轮询重复刷同一条选路日志
                BOOL changed = (prevPath == nil) || ![prevPath isEqualToDictionary:(NSDictionary *)pathInfo];
                speedInfo[@"Main_Speed_Path_Info"] = pathInfo;
                if (changed) {
                    NSError *pathErr = nil;
                    NSData *pathData = [NSJSONSerialization dataWithJSONObject:pathInfo options:0 error:&pathErr];
                    if (pathData && !pathErr) {
                        NSString *pathJson = [[NSString alloc] initWithData:pathData encoding:NSUTF8StringEncoding];
                        NSLog(@"GN_GetSpeedInfo Main_Speed_Path_Info:%@", pathJson);
                    }
                }
            }

            NSLog(@"流量统计: 上行=%lluKB/s, 下行=%lluKB/s,上行总量=%lluKB, 下行总量=%lluKB",
                    uploadSpeed, downloadSpeed, TX_bytes/1024, RX_bytes/1024);
        });
    }];
}

// 启动真实的流量监控
static void StartRealTrafficMonitor() {
    if (trafficTimer) {
        dispatch_source_cancel(trafficTimer);
        trafficTimer = NULL;
    }
    
    // 根据应用状态动态调整轮询频率
    NSTimeInterval interval;
    if ([[UIApplication sharedApplication] applicationState] == UIApplicationStateActive) {
        interval = 1.0; // 前台：1秒
    } else {
        interval = 5.0; // 后台：5秒
    }
    
    // 添加电池状态检查
    if ([[UIDevice currentDevice] batteryState] == UIDeviceBatteryStateUnplugged &&
        [[UIDevice currentDevice] batteryLevel] < 0.2) {
        interval = MAX(interval, 10.0); // 低电量时进一步降低频率
    }
    
    NSLog(@"启动流量监控，轮询间隔: %.1f秒", interval);
    
    trafficTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, vpnQueue);
    dispatch_source_set_timer(trafficTimer,
                             dispatch_time(DISPATCH_TIME_NOW, 0),
                             (uint64_t)(interval * NSEC_PER_SEC),
                             0);
    
    dispatch_source_set_event_handler(trafficTimer, ^{
        UpdateRealTrafficStats();
    });
    
    dispatch_resume(trafficTimer);
}

// 停止流量监控
static void StopTrafficMonitor() {
    if (trafficTimer) {
        dispatch_source_cancel(trafficTimer);
        trafficTimer = NULL;
        NSLog(@"已停止流量监控");
    }
}


#pragma mark - Private Helper Functions

// 初始化队列
static void InitializeQueues() {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        vpnQueue = dispatch_queue_create("com.gnwj.VPNController.Queue", DISPATCH_QUEUE_SERIAL);
    });
}

// 清理状态观察者（ARC 安全版本）
static void CleanupStatusObserver() {
    if (statusObserverToken) {
        [[NSNotificationCenter defaultCenter] removeObserver:statusObserverToken];
        statusObserverToken = nil;
    }
}

// 获取当前活动窗口（解决 keyWindow 弃用问题）
static UIWindow *GetCurrentKeyWindow()
{
    // 遍历所有已连接的场景
    for (UIWindowScene *scene in [[UIApplication sharedApplication] connectedScenes]) {
        // 只处理处于前台活动状态的场景
        if (scene.activationState == UISceneActivationStateForegroundActive) {
            // 遍历场景中的所有窗口
            for (UIWindow *window in scene.windows) {
                // 返回第一个 key window
                if (window.isKeyWindow) {
                    return window;
                }
            }
        }
    }
    
    return nil;
}

// 检查是否可以安全使用UIKit
static BOOL CanUseUIKit() {
    return [NSThread isMainThread] && [UIApplication sharedApplication];
}

static void CancelStartWaitTimer(void);
static void ArmStartWaitTimer(NSTimeInterval timeout, NSInteger epoch);
static void FireStartWaitLocked(BOOL connected, NSString *message);
static void SubmitStartVPNTunnel(NSString *pathJsonStr, NSString *ruleJsonStr, NSInteger epoch);
static void RunOnVPNQueueSync(void (^block)(void));

// 处理连接状态变化
static void HandleVPNStatusChange(NEVPNStatus status) {
    NSString *statusStr;
    
    switch (status) {
        case NEVPNStatusInvalid:
            statusStr = @"invalid";
            break;
        case NEVPNStatusDisconnected:
            statusStr = @"disconnected";
            StopTrafficMonitor();
            break;
        case NEVPNStatusConnecting:
            statusStr = @"connecting";
            break;
        case NEVPNStatusConnected:
            statusStr = @"connected";
            StartRealTrafficMonitor();
            break;
        case NEVPNStatusReasserting:
            statusStr = @"reasserting";
            break;
        case NEVPNStatusDisconnecting:
            statusStr = @"disconnecting";
            break;
        default:
            statusStr = [NSString stringWithFormat:@"unknown(%ld)", (long)status];
            break;
    }
    
    NSLog(@"VPN 状态变更: %@", statusStr);
    
    if (speedInfo) {
        speedInfo[@"connection_status"] = statusStr;
        if (status == NEVPNStatusConnected) {
            speedInfo[@"status"] = @"connected";
            speedInfo[@"error"] = @"";
            speedInfo[@"error_code"] = @0;
        } else if (status == NEVPNStatusDisconnected) {
            speedInfo[@"status"] = @"disconnected";
        } else if (status == NEVPNStatusConnecting) {
            speedInfo[@"status"] = @"connecting";
        }
    }
    
    if (!vpnQueue) {
        return;
    }
    dispatch_async(vpnQueue, ^{
        if (startWaitingForIdle && startPipelineActive &&
            (status == NEVPNStatusDisconnected || status == NEVPNStatusInvalid)) {
            startWaitingForIdle = NO;
            SubmitStartVPNTunnel(pendingStartPath, pendingStartRule, pendingStartEpoch);
            return;
        }
        if (status == NEVPNStatusConnecting) {
            if (startTunnelSubmitted) {
                startSawConnecting = YES;
            }
        }
        if (status == NEVPNStatusConnected) {
            if (!startTunnelSubmitted || !startPipelineActive) {
                return;
            }
            startReachedConnected = YES;
            startHasFailed = NO;
            FireStartWaitLocked(YES, nil);
            return;
        }
        if (!startPipelineActive) {
            return;
        }
        if (status == NEVPNStatusInvalid && startTunnelSubmitted) {
            startHasFailed = YES;
            startFailMessage = @"VPN配置无效";
            FireStartWaitLocked(NO, startFailMessage);
            return;
        }
        if (status == NEVPNStatusDisconnected && startTunnelSubmitted && startSawConnecting) {
            startHasFailed = YES;
            startFailMessage = @"VPN连接已断开";
            FireStartWaitLocked(NO, startFailMessage);
        }
    });
}

// 使用通知系统替代 KVO
static void SetupStatusNotification() {
    // 清理现有观察者
    CleanupStatusObserver();
    
    if (!vpnManager || !vpnManager.connection) return;
    
    // 使用通知系统监听状态变化
    statusObserverToken = [[NSNotificationCenter defaultCenter]
                          addObserverForName:NEVPNStatusDidChangeNotification
                          object:vpnManager.connection
                          queue:[NSOperationQueue mainQueue]
                          usingBlock:^(NSNotification *note) {
        NEVPNStatus status = vpnManager.connection.status;
        HandleVPNStatusChange(status);
    }];
}

#pragma mark - Rule Management
#define SAFE_ARRAY(dict, key) \
    ({ \
        id _val = (dict)[key]; \
        ([_val isKindOfClass:[NSArray class]]) ? (NSArray *)_val : nil; \
    })
// 规则验证函数
static BOOL validateRules(NSDictionary *rules)
{
    // 检查规则是否有效
    if (!rules || ![rules isKindOfClass:[NSDictionary class]]) {
        NSLog(@"无效的规则格式");
        SetErrorState(VPNError_3001, @"规则格式无效");
        return NO;
    }

    // 检查规则版本
    if (!isRuleVersionCompatible(rules)) {
        NSLog(@"规则版本不兼容");
        SetErrorState(VPNErrorRuleVersionIncompatible, [NSString stringWithFormat:@"当前版本: %@, 规则版本: %@", kCurrentRuleVersion, rules[@"version"]]);
        return NO;
    }
    
    NSDictionary *ruleDict = rules[Rule_Key];
    if (!ruleDict) {
        NSLog(@"缺少Rule键");
        SetErrorState(VPNError_3002, @"规则数据缺失");
        return NO;
    }
    /*
    // 检查DNS规则
    //NSArray *dnsRules = ruleDict[@"dns"];
    NSArray *dnsRules = SAFE_ARRAY(ruleDict, @"dns");
    if (dnsRules) {
        for (NSDictionary *rule in dnsRules) {
            NSArray *domains = rule[@"domain"];
            for (NSString *domain in domains) {
                // 检查是否屏蔽Apple关键服务
                if (isCriticalServiceDomain(domain)) {
                    NSLog(@"规则屏蔽了Apple关键服务: %@", domain);
                    SetErrorState(VPNErrorCriticalServiceBlocked, [NSString stringWithFormat:@"关键服务: %@", domain]);
                    return NO;
                }
                
                // 检查是否规则过于宽泛
                if (isOverlyBroadRule(domain)) {
                    NSLog(@"规则过于宽泛: %@", domain);
                    SetErrorState(VPNErrorOverlyBroadRules, [NSString stringWithFormat:@"宽泛规则: %@", domain]);
                    return NO;
                }
            }
        }
    }
    
    // 检查黑名单规则
    //NSArray *blacklist = ruleDict[@"black_list"];
    NSArray *blacklist = SAFE_ARRAY(ruleDict, @"black_list");
    if (blacklist) {
        for (NSDictionary *rule in blacklist) {
            NSString *host = rule[@"host"];
            
            // 检查是否屏蔽Apple关键服务
            if (isCriticalServiceDomain(host)) {
                NSLog(@"规则屏蔽了Apple关键服务: %@", host);
                SetErrorState(VPNErrorCriticalServiceBlocked, [NSString stringWithFormat:@"关键服务: %@", host]);
                return NO;
            }
            
            // 检查是否规则过于宽泛
            if (isOverlyBroadRule(host)) {
                NSLog(@"规则过于宽泛: %@", host);
                SetErrorState(VPNErrorOverlyBroadRules, [NSString stringWithFormat:@"宽泛规则: %@", host]);
                return NO;
            }
        }
    }
    */
    return YES;
}

// 生成规则描述
static NSString *generateRuleDescription(NSDictionary *rules) {
    NSMutableString *description = [NSMutableString string];
    
    NSDictionary *ruleDict = rules[Rule_Key];
    if (!ruleDict) {
        return @"[无法解析规则详情]";
    }
    
    // 描述DNS规则
    NSArray *dnsRules = ruleDict[@"dns"];
    if (dnsRules && dnsRules.count > 0) {
        NSUInteger totalDNSRules = 0;
        for (NSDictionary *rule in dnsRules) {
            totalDNSRules += [rule[@"domain"] count];
        }
        
        [description appendString:[NSString stringWithFormat:@"• 将拦截以下域名的DNS请求以过滤广告和跟踪器（共 %lu 项）：\n", (unsigned long)totalDNSRules]];
        
        NSUInteger maxDisplayRules = 10;
        NSUInteger displayedRules = 0;
        
        for (NSDictionary *rule in dnsRules) {
            NSArray *domains = rule[@"domain"];
            for (NSString *domain in domains) {
                if (displayedRules < maxDisplayRules) {
                    [description appendFormat:@"  - %@\n", domain];
                    displayedRules++;
                } else if (displayedRules == maxDisplayRules) {
                    [description appendFormat:@"  ... 及另外 %lu 个域名\n", (unsigned long)(totalDNSRules - maxDisplayRules)];
                    displayedRules++;
                }
            }
        }
        [description appendString:@"\n"];
    }
    
    // 描述黑名单规则
    NSArray *blacklist = ruleDict[@"blacklist"];
    if (blacklist && blacklist.count > 0) {
        [description appendString:[NSString stringWithFormat:@"• 将阻止以下目的地的网络连接（共 %lu 项）：\n", (unsigned long)blacklist.count]];
        
        NSUInteger maxDisplayRules = 5;
        NSUInteger displayedRules = 0;
        
        for (NSDictionary *rule in blacklist) {
            if (displayedRules < maxDisplayRules) {
                [description appendFormat:@"  - %@:%@ (%@)\n",
                 rule[@"host"], rule[@"port"], rule[@"protocol"]];
                displayedRules++;
            } else if (displayedRules == maxDisplayRules) {
                [description appendFormat:@"  ... 及另外 %lu 个连接规则\n", (unsigned long)(blacklist.count - maxDisplayRules)];
                displayedRules++;
            }
        }
        [description appendString:@"\n"];
    }
    
    // 添加说明
    [description appendString:@"所有DNS查询将在您的设备上本地处理，不会发送到任何外部服务器。"];
    
    return description;
}

// 显示规则确认对话框
static void ShowRuleConfirmationDialog(NSDictionary *rules, void (^completionHandler)(BOOL accepted)) {
    // 确保在主线程执行UIKit操作
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!CanUseUIKit()) {
            NSLog(@"无法显示规则确认对话框：UIKit不可用");
            if (completionHandler) {
                completionHandler(NO);
            }
            return;
        }
        
        NSString *ruleDescription = generateRuleDescription(rules);
        
        // 创建用户确认对话框
        UIAlertController *alert = [UIAlertController
            alertControllerWithTitle:@"网络规则确认"
            message:[NSString stringWithFormat:@"此应用将应用以下网络规则进行内容过滤：\n\n%@\n\n这些规则有助于保护您的隐私并过滤广告。所有DNS查询将在您的设备上本地处理，不会发送到任何外部服务器，也不会记录您的浏览历史。\n\n您可以通过我们的隐私政策了解更多详情：", ruleDescription]
            preferredStyle:UIAlertControllerStyleAlert];
        
        UIAlertAction *acceptAction = [UIAlertAction actionWithTitle:@"接受"
            style:UIAlertActionStyleDefault
            handler:^(UIAlertAction * _Nonnull action) {
                // 保存用户接受时间
                lastRuleAcceptanceDate = [NSDate date];
                userHasAcceptedRules = YES;
                currentRules = [rules copy];
                
                // 保存到Keychain（更安全）
                NSError *archiverError = nil;
                NSData *encodedRules = [NSKeyedArchiver archivedDataWithRootObject:ruleDescription
                                                               requiringSecureCoding:NO
                                                                             error:&archiverError];
                if (!encodedRules) {
                    NSLog(@"规则归档错误: %@", archiverError);
                } else {
                    // 使用可变字典
                    NSMutableDictionary *keychainQuery = [@{
                        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
                        (__bridge id)kSecAttrService: @"com.gnwj.VPNRules",
                        (__bridge id)kSecAttrAccount: @"LastAcceptedRule",
                        (__bridge id)kSecValueData: encodedRules
                    } mutableCopy];
                    
                    // 先删除旧条目
                    SecItemDelete((__bridge CFDictionaryRef)keychainQuery);
                    // 添加新条目
                    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)keychainQuery, NULL);
                    if (status != errSecSuccess) {
                        NSLog(@"Keychain保存错误: %ld", (long)status);
                    }
                }
                
                // 保存基本状态到NSUserDefaults
                NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
                [defaults setObject:lastRuleAcceptanceDate forKey:@"LastRuleAcceptanceDate"];
                [defaults setBool:YES forKey:@"UserHasAcceptedRules"];
                [defaults synchronize];
                
                if (completionHandler) {
                    completionHandler(YES);
                }
            }];
        
        UIAlertAction *privacyPolicyAction = [UIAlertAction actionWithTitle:@"查看隐私政策"
            style:UIAlertActionStyleDefault
            handler:^(UIAlertAction * _Nonnull action) {
                NSURL *privacyURL = [NSURL URLWithString:@"https://yourdomain.com/privacy-policy"];
                if ([[UIApplication sharedApplication] canOpenURL:privacyURL]) {
                    [[UIApplication sharedApplication] openURL:privacyURL options:@{} completionHandler:nil];
                }
            }];
        
        UIAlertAction *detailAction = [UIAlertAction actionWithTitle:@"查看详细规则"
            style:UIAlertActionStyleDefault
            handler:^(UIAlertAction * _Nonnull action) {
                // 显示详细规则页面
                NSString *detailedRules = [NSString stringWithFormat:@"规则数据:\n\nPath: %@\n\nRule: %@",
                                          rules[Path_Key], rules[Rule_Key]];
                
                UIAlertController *detailAlert = [UIAlertController
                    alertControllerWithTitle:@"详细规则信息"
                    message:detailedRules
                    preferredStyle:UIAlertControllerStyleAlert];
                
                UIAlertAction *returnAction = [UIAlertAction actionWithTitle:@"返回"
                    style:UIAlertActionStyleDefault
                    handler:nil];
                
                [detailAlert addAction:returnAction];
                
                UIWindow *keyWindow = GetCurrentKeyWindow();
                if (keyWindow && keyWindow.rootViewController) {
                    [keyWindow.rootViewController presentViewController:detailAlert animated:YES completion:nil];
                }
            }];
        
        UIAlertAction *rejectAction = [UIAlertAction actionWithTitle:@"拒绝"
            style:UIAlertActionStyleCancel
            handler:^(UIAlertAction * _Nonnull action) {
                userHasAcceptedRules = NO;
                currentRules = nil;
                
                if (completionHandler) {
                    completionHandler(NO);
                }
            }];
        
        [alert addAction:acceptAction];
        [alert addAction:privacyPolicyAction];
        [alert addAction:detailAction];
        [alert addAction:rejectAction];
        
        // 在主线程显示对话框
        UIWindow *keyWindow = GetCurrentKeyWindow();
        if (keyWindow && keyWindow.rootViewController) {
            [keyWindow.rootViewController presentViewController:alert animated:YES completion:nil];
        } else {
            NSLog(@"无法找到根ViewController来显示规则确认对话框");
            
            // 如果没有rootViewController，直接调用completionHandler拒绝
            if (completionHandler) {
                completionHandler(NO);
            }
        }
    });
}

// 检查规则是否需要用户确认
static BOOL ShouldShowRuleConfirmation(NSDictionary *newRules) {
    // 如果是首次使用，总是显示
    if (![[NSUserDefaults standardUserDefaults] boolForKey:@"UserHasAcceptedRules"]) {
        //return YES;
        return NO;
    }
    
    // 如果规则发生变化，需要重新确认
    if (!currentRules || ![currentRules isEqual:newRules]) {
        //return YES;
        return NO;
    }
    
    // 规则未变化，不需要重新确认
    return NO;
}

#pragma mark - Network Reachability

static void NetworkReachabilityCallback(SCNetworkReachabilityRef target, SCNetworkReachabilityFlags flags, void *info) {
    BOOL isReachable = (flags & kSCNetworkFlagsReachable) != 0;
    if (!isReachable) {
        NSLog(@"网络不可用，暂停流量监控");
        StopTrafficMonitor();
    } else if (vpnManager && vpnManager.connection.status == NEVPNStatusConnected) {
        NSLog(@"网络恢复，重启流量监控");
        StartRealTrafficMonitor();
    }
}

static void SetupNetworkReachability() {
    if (networkReachability) {
        return;
    }
    
    networkReachability = SCNetworkReachabilityCreateWithName(NULL, "apple.com");
    if (!networkReachability) {
        NSLog(@"无法创建网络可达性对象");
        return;
    }
    
    SCNetworkReachabilityContext context = {0, NULL, NULL, NULL, NULL};
    if (!SCNetworkReachabilitySetCallback(networkReachability, NetworkReachabilityCallback, &context)) {
        NSLog(@"无法设置网络可达性回调");
        CFRelease(networkReachability);
        networkReachability = NULL;
        return;
    }
    
    if (!SCNetworkReachabilitySetDispatchQueue(networkReachability, dispatch_get_main_queue())) {
        NSLog(@"无法设置网络可达性队列");
        CFRelease(networkReachability);
        networkReachability = NULL;
        return;
    }
}

static void CleanupNetworkReachability() {
    if (networkReachability) {
        SCNetworkReachabilitySetCallback(networkReachability, NULL, NULL);
        SCNetworkReachabilitySetDispatchQueue(networkReachability, NULL);
        CFRelease(networkReachability);
        networkReachability = NULL;
    }
}


#pragma mark - VPN Manager Initialization

static void CancelStartWaitTimer(void) {
    if (startWaitTimer) {
        dispatch_source_cancel(startWaitTimer);
        startWaitTimer = NULL;
    }
}

static void ArmStartWaitTimer(NSTimeInterval timeout, NSInteger epoch) {
    CancelStartWaitTimer();
    if (timeout <= 0) {
        timeout = ConnectedWaitTimeout(0);
    }
    startWaitTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, vpnQueue);
    if (!startWaitTimer) {
        startHasFailed = YES;
        startFailMessage = @"启动等待定时器创建失败";
        FireStartWaitLocked(NO, startFailMessage);
        return;
    }
    dispatch_source_set_timer(startWaitTimer,
                              dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)),
                              DISPATCH_TIME_FOREVER,
                              (int64_t)(0.1 * NSEC_PER_SEC));
    dispatch_source_set_event_handler(startWaitTimer, ^{
        if (epoch != startEpoch) {
            return;
        }
        startHasFailed = YES;
        startFailMessage = startTunnelSubmitted
            ? @"加速服务启动超时，请检查权限和网络设置"
            : @"VPN配置超时，请检查系统VPN权限";
        FireStartWaitLocked(NO, startFailMessage);
    });
    dispatch_resume(startWaitTimer);
}

/// 仅在 vpnQueue 上调用
static void FireStartWaitLocked(BOOL connected, NSString *message) {
    CancelStartWaitTimer();
    startPipelineActive = NO;
    startWaitingForIdle = NO;
    startTunnelSubmitted = NO;
    startSawConnecting = NO;
    if (!connected) {
        startReachedConnected = NO;
    }
    GNVPNWaitCompletion cb = pendingWaitCompletion;
    pendingWaitCompletion = nil;
    if (!cb) {
        return;
    }
    NSString *msg = message ? [message copy] : nil;
    dispatch_async(dispatch_get_main_queue(), ^{
        cb(connected, connected ? nil : (msg.length ? msg : @"加速服务启动失败"));
    });
}

static void RunOnVPNQueueSync(void (^block)(void)) {
    if (!block) {
        return;
    }
    InitializeQueues();
    const char *currentLabel = dispatch_queue_get_label(DISPATCH_CURRENT_QUEUE_LABEL);
    const char *vpnLabel = dispatch_queue_get_label(vpnQueue);
    if (currentLabel && vpnLabel && strcmp(currentLabel, vpnLabel) == 0) {
        block();
        return;
    }
    dispatch_sync(vpnQueue, block);
}

static void ResetStartWaitState(void) {
    startSawConnecting = NO;
    startReachedConnected = NO;
    startHasFailed = NO;
    startFailMessage = nil;
    startTunnelSubmitted = NO;
    startWaitingForIdle = NO;
    leftoverStopRetries = 0;
}

static BOOL IsRetryableNEVPNStartError(NSError *error) {
    if (!error) return NO;
    if (![error.domain isEqualToString:NEVPNErrorDomain]) return NO;
    return (error.code == NEVPNErrorConfigurationInvalid ||
            error.code == NEVPNErrorConfigurationStale);
}

static void ApplyProtocolConfiguration(NSString *pathJsonStr, NSString *ruleJsonStr) {
    NETunnelProviderProtocol *protocol = nil;
    if ([vpnManager.protocolConfiguration isKindOfClass:[NETunnelProviderProtocol class]]) {
        protocol = (NETunnelProviderProtocol *)vpnManager.protocolConfiguration;
    } else {
        protocol = [[NETunnelProviderProtocol alloc] init];
    }
    protocol.serverAddress = Default_ServerAddress;
    protocol.providerBundleIdentifier = BundleIdentifier_Tunnel;
    
    NSMutableDictionary *providerConfig = [protocol.providerConfiguration mutableCopy] ?: [@{} mutableCopy];
    if (pathJsonStr.length > 0) {
        providerConfig[Path_Key] = pathJsonStr;
    }
    if (ruleJsonStr.length > 0) {
        providerConfig[Rule_Key] = ruleJsonStr;
        NSString *mode = ResolveAccelRouteMode(ruleJsonStr);
        providerConfig[Accel_Route_Mode_Key] = mode;
        if (speedInfo) {
            speedInfo[Accel_Route_Mode_Key] = mode;
        }
    }
    protocol.providerConfiguration = providerConfig;
    vpnManager.protocolConfiguration = protocol;
    vpnManager.enabled = YES;
    vpnManager.onDemandEnabled = NO;
}

static void LoadPreferencesThen(NSInteger epoch, void (^done)(NSError * _Nullable error)) {
    [vpnManager loadFromPreferencesWithCompletionHandler:^(NSError * _Nullable error) {
        dispatch_async(vpnQueue, ^{
            if (epoch != startEpoch) {
                return;
            }
            done(error);
        });
    }];
}

static void SaveAndReload(NSInteger epoch, void (^done)(NSError * _Nullable error)) {
    [vpnManager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable error) {
        dispatch_async(vpnQueue, ^{
            if (epoch != startEpoch) {
                return;
            }
            if (error) {
                done(error);
                return;
            }
            LoadPreferencesThen(epoch, ^(NSError *loadErr) {
                if (epoch != startEpoch) {
                    return;
                }
                if (loadErr) {
                    done(loadErr);
                    return;
                }
                if (!vpnManager.enabled) {
                    vpnManager.enabled = YES;
                    [vpnManager saveToPreferencesWithCompletionHandler:^(NSError * _Nullable saveErr) {
                        dispatch_async(vpnQueue, ^{
                            if (epoch != startEpoch) {
                                return;
                            }
                            if (saveErr) {
                                done(saveErr);
                                return;
                            }
                            LoadPreferencesThen(epoch, done);
                        });
                    }];
                    return;
                }
                done(nil);
            });
        });
    }];
}

typedef void (^GNVPNEnsureCompletion)(NSError * _Nullable error);

static void EnsureManagerReady(NSString *pathJsonStr, NSString *ruleJsonStr, NSInteger epoch, GNVPNEnsureCompletion done) {
    InitializeQueues();
    [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
        dispatch_async(vpnQueue, ^{
            if (epoch != startEpoch) {
                return;
            }
            if (error) {
                NSLog(@"Error loading VPN preferences: %@", error);
                if (done) done(error);
                return;
            }
            
            if (managers.count > 0) {
                vpnManager = managers[0];
                if (managers.count > 1) {
                    for (NSUInteger i = 1; i < managers.count; i++) {
                        [managers[i] removeFromPreferencesWithCompletionHandler:nil];
                    }
                }
            } else {
                vpnManager = [[NETunnelProviderManager alloc] init];
                vpnManager.localizedDescription = V_Description;
            }
            
            ApplyProtocolConfiguration(pathJsonStr, ruleJsonStr);
            SaveAndReload(epoch, done);
        });
    }];
}

static void SubmitStartVPNTunnel(NSString *pathJsonStr, NSString *ruleJsonStr, NSInteger epoch) {
    if (epoch != startEpoch) {
        return;
    }
    if (!vpnManager || !vpnManager.connection) {
        startHasFailed = YES;
        startFailMessage = @"VPN未初始化";
        FireStartWaitLocked(NO, startFailMessage);
        return;
    }
    NSDictionary *options = BuildTunnelStartOptions(pathJsonStr, ruleJsonStr);
    NSError *error = nil;
    BOOL started = [vpnManager.connection startVPNTunnelWithOptions:options andReturnError:&error];
    if (started) {
        NEVPNStatus st = vpnManager.connection.status;
        if (st == NEVPNStatusConnected) {
            leftoverStopRetries += 1;
            if (leftoverStopRetries > 2) {
                startHasFailed = YES;
                startFailMessage = @"无法重启已连接的VPN";
                FireStartWaitLocked(NO, startFailMessage);
                return;
            }
            startTunnelSubmitted = NO;
            startSawConnecting = NO;
            startWaitingForIdle = YES;
            NSLog(@"startVPNTunnel still Connected, stopping leftover session");
            [vpnManager.connection stopVPNTunnel];
            NEVPNStatus after = vpnManager.connection.status;
            if (after == NEVPNStatusDisconnected || after == NEVPNStatusInvalid) {
                startWaitingForIdle = NO;
                dispatch_async(vpnQueue, ^{
                    SubmitStartVPNTunnel(pendingStartPath, pendingStartRule, epoch);
                });
            }
            return;
        }
        startTunnelSubmitted = YES;
        pendingPostSubmitTimeout = ConnectedWaitTimeout(pendingPostSubmitTimeout);
        ArmStartWaitTimer(pendingPostSubmitTimeout, epoch);
        NSLog(@"startVPNTunnel accepted mode=%@", speedInfo[Accel_Route_Mode_Key]);
        if (st == NEVPNStatusConnecting) {
            startSawConnecting = YES;
        }
        return;
    }
    
    if (IsRetryableNEVPNStartError(error)) {
        NSLog(@"startVPNTunnel retryable error: %@", error);
        LoadPreferencesThen(epoch, ^(NSError *loadErr) {
            if (epoch != startEpoch) {
                return;
            }
            if (loadErr) {
                startHasFailed = YES;
                startFailMessage = loadErr.localizedDescription;
                FireStartWaitLocked(NO, startFailMessage);
                return;
            }
            NSError *retryErr = nil;
            BOOL retryStarted = [vpnManager.connection startVPNTunnelWithOptions:options andReturnError:&retryErr];
            if (retryStarted) {
                NEVPNStatus st = vpnManager.connection.status;
                if (st == NEVPNStatusConnected) {
                    leftoverStopRetries += 1;
                    if (leftoverStopRetries > 2) {
                        startHasFailed = YES;
                        startFailMessage = @"无法重启已连接的VPN";
                        FireStartWaitLocked(NO, startFailMessage);
                        return;
                    }
                    startTunnelSubmitted = NO;
                    startSawConnecting = NO;
                    startWaitingForIdle = YES;
                    NSLog(@"startVPNTunnel retry still Connected, stopping leftover session");
                    [vpnManager.connection stopVPNTunnel];
                    NEVPNStatus after = vpnManager.connection.status;
                    if (after == NEVPNStatusDisconnected || after == NEVPNStatusInvalid) {
                        startWaitingForIdle = NO;
                        dispatch_async(vpnQueue, ^{
                            SubmitStartVPNTunnel(pendingStartPath, pendingStartRule, epoch);
                        });
                    }
                    return;
                }
                startTunnelSubmitted = YES;
                pendingPostSubmitTimeout = ConnectedWaitTimeout(pendingPostSubmitTimeout);
                ArmStartWaitTimer(pendingPostSubmitTimeout, epoch);
                if (st == NEVPNStatusConnecting) {
                    startSawConnecting = YES;
                }
                return;
            }
            startHasFailed = YES;
            startFailMessage = retryErr.localizedDescription ?: @"连接失败";
            FireStartWaitLocked(NO, startFailMessage);
        });
        return;
    }
    
    startHasFailed = YES;
    startFailMessage = error.localizedDescription ?: @"连接失败";
    FireStartWaitLocked(NO, startFailMessage);
}

static void StartTunnelAfterReady(NSString *pathJsonStr, NSString *ruleJsonStr, NSInteger epoch) {
    if (epoch != startEpoch) {
        return;
    }
    if (!vpnManager || !vpnManager.connection) {
        startHasFailed = YES;
        startFailMessage = @"VPN未初始化";
        FireStartWaitLocked(NO, startFailMessage);
        return;
    }
    pendingStartPath = [pathJsonStr copy];
    pendingStartRule = [ruleJsonStr copy];
    pendingStartEpoch = epoch;
    SetupStatusNotification();
    
    NEVPNStatus st = vpnManager.connection.status;
    if (st == NEVPNStatusConnected ||
        st == NEVPNStatusConnecting ||
        st == NEVPNStatusReasserting ||
        st == NEVPNStatusDisconnecting) {
        startWaitingForIdle = YES;
        startTunnelSubmitted = NO;
        NSLog(@"VPN busy (%ld), stopping before restart", (long)st);
        [vpnManager.connection stopVPNTunnel];
        NEVPNStatus after = vpnManager.connection.status;
        if (after == NEVPNStatusDisconnected || after == NEVPNStatusInvalid) {
            startWaitingForIdle = NO;
            SubmitStartVPNTunnel(pathJsonStr, ruleJsonStr, epoch);
        }
        return;
    }
    
    SubmitStartVPNTunnel(pathJsonStr, ruleJsonStr, epoch);
}

static void BeginStartPipeline(NSString *pathJsonStr, NSString *ruleJsonStr) {
    InitializeQueues();
    __block NSInteger epoch = 0;
    void (^prepare)(void) = ^{
        FireStartWaitLocked(NO, @"已开始新的启动");
        ResetStartWaitState();
        startEpoch += 1;
        epoch = startEpoch;
        startPipelineActive = YES;
        if (speedInfo) {
            speedInfo[Path_Key] = pathJsonStr ?: @"";
            speedInfo[Rule_Key] = ruleJsonStr ?: @"";
            speedInfo[@"status"] = @"connecting";
            speedInfo[@"connection_status"] = @"connecting";
            speedInfo[@"error"] = @"";
            speedInfo[@"error_code"] = @0;
        }
    };
    RunOnVPNQueueSync(prepare);
    
    EnsureManagerReady(pathJsonStr, ruleJsonStr, epoch, ^(NSError *error) {
        if (epoch != startEpoch) {
            return;
        }
        if (error) {
            NSLog(@"EnsureManagerReady failed: %@", error);
            startHasFailed = YES;
            startFailMessage = error.localizedDescription ?: @"VPN配置保存失败";
            dispatch_async(dispatch_get_main_queue(), ^{
                if (speedInfo) {
                    speedInfo[@"status"] = @"error";
                    speedInfo[@"error"] = startFailMessage;
                    speedInfo[@"error_code"] = @2002;
                }
            });
            FireStartWaitLocked(NO, startFailMessage);
            return;
        }
        StartTunnelAfterReady(pathJsonStr, ruleJsonStr, epoch);
    });
}

void GN_WaitForConnected(NSTimeInterval timeoutSeconds, GNVPNWaitCompletion completion) {
    if (!completion) {
        return;
    }
    InitializeQueues();
    dispatch_async(vpnQueue, ^{
        if (startReachedConnected) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(YES, nil);
            });
            return;
        }
        if (startHasFailed) {
            NSString *msg = startFailMessage ?: @"加速服务启动失败";
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(NO, msg);
            });
            return;
        }
        
        GNVPNWaitCompletion oldWait = pendingWaitCompletion;
        pendingWaitCompletion = [completion copy];
        pendingPostSubmitTimeout = ConnectedWaitTimeout(timeoutSeconds);
        NSInteger epoch = startEpoch;
        NSTimeInterval arm = startTunnelSubmitted
            ? pendingPostSubmitTimeout
            : VPN_Start_Config_Timeout_Sec;
        ArmStartWaitTimer(arm, epoch);
        if (oldWait) {
            dispatch_async(dispatch_get_main_queue(), ^{
                oldWait(NO, @"被新的启动等待替换");
            });
        }
    });
}

extern "C" bool GN_StartOK(void) {
    return vpnManager && vpnManager.connection.status == NEVPNStatusConnected;
}

// 启动流量监控计时器
static void StartTrafficMonitor() {
    if (trafficTimer) {
        dispatch_source_cancel(trafficTimer);
        trafficTimer = NULL;
    }
}

#pragma mark - Helper Functions for GN_Start

static void HandleRuleAccepted(NSString *pathJsonStr, NSString *ruleJsonStr) {
    if (!speedInfo) {
        speedInfo = [NSMutableDictionary dictionary];
    }
    speedInfo[Path_Key] = pathJsonStr ?: @"";
    speedInfo[Rule_Key] = ruleJsonStr ?: @"";
    speedInfo[Accel_Route_Mode_Key] = ResolveAccelRouteMode(ruleJsonStr);
    BeginStartPipeline(pathJsonStr, ruleJsonStr);
}

// 处理用户拒绝规则的情况
static void HandleRuleRejected() {
    // 用户拒绝规则
    dispatch_async(dispatch_get_main_queue(), ^{
        if (speedInfo) {
            speedInfo[@"status"] = @"error";
            speedInfo[@"error"] = @"用户拒绝网络规则";
            speedInfo[@"error_code"] = @3005;
        }
    });
}

#pragma mark - Public API Implementation

extern "C" int GN_LoadSys(int Mode) {
    @autoreleasepool {
        InitializeQueues();
        SetupNetworkReachability();
        StartTrafficMonitor();
        
        speedInfo = [NSMutableDictionary dictionary];
        speedInfo[@"status"] = @"initialized";
        speedInfo[@"mode"] = @(Mode);
        speedInfo[@"connection_status"] = @"disconnected";
        speedInfo[@"privacy_notice"] = @"本应用仅收集匿名网络性能数据用于优化连接，不监控或记录您的浏览内容";
        
        NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
        userHasAcceptedRules = [defaults boolForKey:@"UserHasAcceptedRules"];
        lastRuleAcceptanceDate = [defaults objectForKey:@"LastRuleAcceptanceDate"];
        currentRules = nil;
        
        NSMutableDictionary *keychainQuery = [@{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: @"com.gnwj.VPNRules",
            (__bridge id)kSecAttrAccount: @"LastAcceptedRule",
            (__bridge id)kSecReturnData: @YES
        } mutableCopy];
        
        CFDataRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)keychainQuery, (CFTypeRef *)&result);
        if (status == errSecSuccess && result) {
            NSData *ruleData = (__bridge NSData *)result;
            NSError *unarchiverError = nil;
            id unarchivedObject = [NSKeyedUnarchiver unarchivedObjectOfClass:[NSString class]
                                                                 fromData:ruleData
                                                                    error:&unarchiverError];
            if (unarchivedObject) {
                NSLog(@"已从Keychain加载规则描述");
            } else {
                NSLog(@"反归档错误: %@", unarchiverError);
            }
            CFRelease(result);
        }
        
        NSLog(@"VPN控制器已加载 (模式: %d, 用户已接受规则: %d)", Mode, userHasAcceptedRules);
        return 0;
    }
}

extern "C" int GN_Start(const char* JsonPathResult, const char* JsonGamesRules) {
    @autoreleasepool {
        InitializeQueues();
        if (!speedInfo) {
            speedInfo = [NSMutableDictionary dictionary];
        }
        
        if (!JsonPathResult || !JsonGamesRules) {
            NSLog(@"无效的JSON输入(null pointer)");
            speedInfo[@"status"] = @"error";
            speedInfo[@"error"] = @"无效的配置数据";
            speedInfo[@"error_code"] = @3002;
            return -3002;
        }
        
        NSString *pathJsonStr = [NSString stringWithUTF8String:JsonPathResult];
        NSString *ruleJsonStr = [NSString stringWithUTF8String:JsonGamesRules];
        
        if (!pathJsonStr || !ruleJsonStr || pathJsonStr.length == 0 || ruleJsonStr.length == 0) {
            NSLog(@"无效的JSON输入");
            speedInfo[@"status"] = @"error";
            speedInfo[@"error"] = @"无效的配置数据";
            speedInfo[@"error_code"] = @3002;
            return -3002;
        }
        
        NSDictionary *rules = @{
            Path_Key: pathJsonStr,
            Rule_Key: ruleJsonStr
        };
        
        if (!validateRules(rules)) {
            NSLog(@"规则验证失败");
            return -3002;
        }
        
        if (ShouldShowRuleConfirmation(rules)) {
            void (^completionHandler)(BOOL) = ^void(BOOL accepted) {
                if (accepted) {
                    dispatch_async(vpnQueue, ^void() {
                        HandleRuleAccepted(pathJsonStr, ruleJsonStr);
                    });
                } else {
                    HandleRuleRejected();
                    dispatch_async(vpnQueue, ^{
                        startHasFailed = YES;
                        startFailMessage = @"用户拒绝网络规则";
                        FireStartWaitLocked(NO, startFailMessage);
                    });
                }
            };
            dispatch_async(dispatch_get_main_queue(), ^{
                ShowRuleConfirmationDialog(rules, completionHandler);
            });
            return 0;
        }
        
        speedInfo[Path_Key] = pathJsonStr;
        speedInfo[Rule_Key] = ruleJsonStr;
        speedInfo[Accel_Route_Mode_Key] = ResolveAccelRouteMode(ruleJsonStr);
        BeginStartPipeline(pathJsonStr, ruleJsonStr);
        return 0;
    }
}

extern "C" int GN_Stop(int Mode) {
    @autoreleasepool {
        (void)Mode;
        InitializeQueues();
        __block NSInteger stopEpoch = 0;
        RunOnVPNQueueSync(^{
            startEpoch += 1;
            stopEpoch = startEpoch;
            startPipelineActive = NO;
            startWaitingForIdle = NO;
            startTunnelSubmitted = NO;
            startReachedConnected = NO;
            leftoverStopRetries = 0;
            startHasFailed = YES;
            startFailMessage = @"已取消加速";
            FireStartWaitLocked(NO, startFailMessage);
        });
        
        CleanupStatusObserver();
        
        if (vpnManager) {
            NSLog(@"请求停止VPN连接");
            [vpnManager.connection stopVPNTunnel];
            return 0;
        }
        
        [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> * _Nullable managers, NSError * _Nullable error) {
            dispatch_async(vpnQueue, ^{
                if (stopEpoch != startEpoch) {
                    return;
                }
                if (error) {
                    NSLog(@"GN_Stop loadAll failed: %@", error);
                    return;
                }
                if (managers.count == 0) {
                    NSLog(@"尝试停止未初始化的VPN");
                    return;
                }
                vpnManager = managers[0];
                NSLog(@"请求停止VPN连接");
                [vpnManager.connection stopVPNTunnel];
            });
        }];
        return 0;
    }
}

extern "C" bool GN_TestSpeed(int Mode)
{
    return true;
}

extern "C" bool GN_GetTrafficInfo(uint64_t* pSendBytes, uint64_t* pReceiveBytes) {
    @autoreleasepool {
        if (!pSendBytes || !pReceiveBytes) {
            NSLog(@"无效的指针参数");
            return false;
        }
        
        InitializeQueues();
        dispatch_sync(vpnQueue, ^{
            *pSendBytes = sentBytes;
            *pReceiveBytes = receivedBytes;
        });
        
        NSLog(@"获取流量信息: 发送=%llu, 接收=%llu", sentBytes, receivedBytes);
        return true;
    }
}

extern "C" const char* GN_GetSpeedInfo(int Mode) {
    @autoreleasepool {
        (void)Mode;
        if (!speedInfo) {
            return strdup("{\"status\":\"uninitialized\"}");
        }
        // 添加规则信息到speedInfo
        if (userHasAcceptedRules && lastRuleAcceptanceDate) {
            speedInfo[@"user_has_accepted_rules"] = @YES;
            speedInfo[@"last_rule_acceptance_date"] = lastRuleAcceptanceDate;
        } else {
            speedInfo[@"user_has_accepted_rules"] = @NO;
        }
        
        // 生成JSON字符串
        NSError *error;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:speedInfo options:0 error:&error];
        if (!jsonData || error) {
            NSLog(@"Failed to serialize speed info: %@", error);
            return strdup("{\"error\": \"Failed to serialize speed info\", \"error_code\": 4001}");
        }
        
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        if (!jsonString) {
            NSLog(@"Failed to create JSON string");
            return strdup("{\"error\": \"Failed to create JSON string\", \"error_code\": 4002}");
        }
        
        // 释放旧内存
        if (speedInfoResult) {
            free(speedInfoResult);
            speedInfoResult = NULL;
            speedInfoResultRefCount = 0;
        }
        
        speedInfoResult = strdup([jsonString UTF8String]);
        speedInfoResultRefCount = 1;
        
        // 添加调试日志（审核时可移除）
        NSLog(@"返回速度信息: %@", jsonString);
        return speedInfoResult;
    }
}

// 新增：释放内存的函数
extern "C" void GN_ReleaseSpeedInfo(const char* info) {
    if (info == speedInfoResult) {
        speedInfoResultRefCount--;
        if (speedInfoResultRefCount <= 0) {
            free((void*)speedInfoResult);
            speedInfoResult = NULL;
        }
    }
}

// 新增：获取当前规则信息（用于应用UI展示）
extern "C" const char* GN_GetCurrentRulesInfo() {
    @autoreleasepool {
        if (!currentRules) {
            return strdup("{\"status\": \"no_rules\"}");
        }
        
        NSError *error;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:currentRules options:0 error:&error];
        if (!jsonData || error) {
            return strdup("{\"error\": \"Failed to serialize rules info\"}");
        }
        
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        static char *result = NULL;
        char *newResult = strdup([jsonString UTF8String]);
        if (result) {
            free(result);
        }
        result = newResult;
        
        return result;
    }
}

// 新增：检查用户是否已接受规则
extern "C" bool GN_HasUserAcceptedRules() {
    return userHasAcceptedRules;
}

// 新增：获取上次接受规则的日期
extern "C" const char* GN_GetLastRuleAcceptanceDate() {
    @autoreleasepool {
        if (!lastRuleAcceptanceDate) {
            return strdup("");
        }
        
        NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
        [formatter setDateFormat:@"yyyy-MM-dd HH:mm:ss"];
        NSString *dateString = [formatter stringFromDate:lastRuleAcceptanceDate];
        
        static char *result = NULL;
        char *newResult = strdup([dateString UTF8String]);
        if (result) {
            free(result);
        }
        result = newResult;
        
        return result;
    }
}

// 新增：清理资源
extern "C" void GN_Cleanup() {
    @autoreleasepool {
        StopTrafficMonitor();
        CleanupStatusObserver();
        CleanupNetworkReachability();
        
        dispatch_async(vpnQueue ?: dispatch_get_main_queue(), ^{
            startEpoch += 1;
            startPipelineActive = NO;
            CancelStartWaitTimer();
            pendingWaitCompletion = nil;
        });
        
        if (speedInfoResult) {
            free(speedInfoResult);
            speedInfoResult = NULL;
        }
        
        vpnManager = nil;
        sentBytes = 0;
        receivedBytes = 0;
        speedInfo = nil;
        statusObserverToken = nil;
        userHasAcceptedRules = NO;
        currentRules = nil;
        lastRuleAcceptanceDate = nil;
    }
}
