#import "GnwjBridgeHandler.h"
#import "VPNController.h"
#import "Headers.h"
#import "DownloadSpeedTester.h"

#import "GnwjLogger.h"

// 用 GnwjLogger 替代 NSLog
#define NSLog(frmt, ...) [[GnwjLogger shared] info:(frmt), ##__VA_ARGS__]

@implementation GnwjBridgeHandler

- (instancetype)initWithWebView:(WKWebView *)webView {
    self = [super init];
    if (self) {
        _webView = webView;
    }
    return self;
}

#pragma mark - Safe JSON String Utilities

/**
 * 手动将 NSString 转为带引号的 JSON 字符串（含转义）
 */
- (NSString *)jsonStringEscaped:(NSString *)str {
    NSMutableString *output = [NSMutableString string];
    [output appendString:@"\""];
    
    const char *utf8 = [str UTF8String];
    for (int i = 0; utf8[i] != '\0'; i++) {
        unsigned char c = (unsigned char)utf8[i];
        
        switch (c) {
            case '"':   [output appendString:@"\\\""]; break;
            case '\\':  [output appendString:@"\\\\"]; break;
            case '\b':  [output appendString:@"\\b"];  break;
            case '\f':  [output appendString:@"\\f"];  break;
            case '\n':  [output appendString:@"\\n"];  break;
            case '\r':  [output appendString:@"\\r"];  break;
            case '\t':  [output appendString:@"\\t"];  break;
            default:
                if (c < 32 || c > 126) {
                    [output appendFormat:@"\\u%04X", c];
                } else {
                    [output appendFormat:@"%c", c];
                }
                break;
        }
    }
    
    [output appendString:@"\""];
    return output;
}

/**
 * 将 NSNumber 转为对应的 JSON 字面量字符串
 */
- (NSString *)jsonStringFromNumber:(NSNumber *)num {
    if ([num isKindOfClass:[NSNumber class]]) {
        if ([num isEqual:@YES]) return @"true";
        if ([num isEqual:@NO])  return @"false";
        double d = [num doubleValue];
        if (floor(d) == d) {
            return [NSString stringWithFormat:@"%ld", (long)d];
        } else {
            return [NSString stringWithFormat:@"%f", d];
        }
    }
    return @"null";
}

/**
 * 清洗对象：递归处理嵌套结构，替换非法类型为 null 或字符串
 */
- (id)sanitizeObject:(id)object {
    if (object == nil || [object isKindOfClass:[NSNull class]]) {
        return [NSNull null];
    }

    // 基础类型直接保留
    if ([object isKindOfClass:[NSString class]] ||
        [object isKindOfClass:[NSNumber class]]) {
        return object;
    }

    // NSArray: 递归清洗每个元素
    if ([object isKindOfClass:[NSArray class]]) {
        NSMutableArray *cleaned = [NSMutableArray array];
        for (id item in (NSArray *)object) {
            [cleaned addObject:[self sanitizeObject:item]];
        }
        return [cleaned copy];
    }

    // NSDictionary: 键必须是字符串，值递归清洗
    if ([object isKindOfClass:[NSDictionary class]]) {
        NSMutableDictionary *cleaned = [NSMutableDictionary dictionary];
        for (id key in (NSDictionary *)object) {
            id value = [(NSDictionary *)object objectForKey:key];
            
            if (![key isKindOfClass:[NSString class]]) {
                NSLog(@"Ignoring non-string key: %@ (%@)", key, [key class]);
                continue;
            }
            
            cleaned[(NSString *)key] = [self sanitizeObject:value];
        }
        return cleaned;
    }

    // NSDate → ISO 格式字符串
    if ([object isKindOfClass:[NSDate class]]) {
        static dispatch_once_t onceToken;
        static NSDateFormatter *fmt;
        dispatch_once(&onceToken, ^{
            fmt = [[NSDateFormatter alloc] init];
            fmt.dateFormat = @"yyyy-MM-dd'T'HH:mm:ssZ";
            fmt.timeZone = [NSTimeZone defaultTimeZone];
        });
        return [fmt stringFromDate:(NSDate *)object];
    }

    // NSData → Base64 字符串
    if ([object isKindOfClass:[NSData class]]) {
        return [object base64EncodedStringWithOptions:0];
    }

    // 其他类型（如自定义类）→ 替换为 null
    NSLog(@"🚫 Unsupported type converted to null: %@ (%@)", object, [object class]);
    return [NSNull null];
}

/**
 * 安全生成任意对象的 JSON 字符串，绝不崩溃
 */
- (NSString *)safeJSONString:(id)object {
    @try {
        id cleaned = [self sanitizeObject:object];

        // 处理基础类型：不走 NSJSONSerialization
        if ([cleaned isKindOfClass:[NSString class]]) {
            return [self jsonStringEscaped:cleaned];
        }
        if ([cleaned isKindOfClass:[NSNumber class]]) {
            return [self jsonStringFromNumber:cleaned];
        }
        if ([cleaned isKindOfClass:[NSNull class]]) {
            return @"null";
        }

        // NSDictionary / NSArray 使用标准序列化
        if ([cleaned isKindOfClass:[NSDictionary class]] ||
            [cleaned isKindOfClass:[NSArray class]]) {
            NSError *error;
            NSData *data = [NSJSONSerialization dataWithJSONObject:cleaned options:0 error:&error];
            if (data && !error) {
                NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
                if (json) return json;
            } else {
                NSLog(@"Serialization failed: %@", error.localizedDescription);
            }
        }

        // 默认 fallback
        return @"null";

    }
    @catch (NSException *exception) {
        NSLog(@"💥 Exception during JSON conversion: %@", exception.reason);
        return @"null";
    }
}

#pragma mark - Event Dispatch (Native → JS)

/**
 * 向 JS 发送事件（例如：加速被中断）
 */
- (void)sendEvent:(NSString *)event data:(id)data {
    NSString *js = [NSString stringWithFormat:@"(function(){ \
        try { \
            var handlers = window.GnwjBridge && window.GnwjBridge.eventHandlers; \
            if (handlers && Array.isArray(handlers['%@'])) { \
                handlers['%@'].forEach(function(handler) { \
                    try { handler(%@); } \
                    catch(e) { console.error('Event handler error:', e); } \
                }); \
            } \
        } catch(err) { console.error('Dispatch event error:', err); } \
    })();", event, event, [self safeJSONString:data]];

    [self.webView evaluateJavaScript:js completionHandler:^(id result, NSError *jsError) {
        if (jsError) {
            NSLog(@"Failed to dispatch event '%@': %@", event, jsError.localizedDescription);
        }
    }];
}

#pragma mark - Message Handler (JS → Native)

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"gnwjBridge"]) return;

    NSLog(@"📩 Received message from JS: %@", message.body);

    NSDictionary *body = message.body;
    NSString *method = body[@"method"];
    NSArray *params = body[@"params"] ?: @[];
    NSString *messageId = body[@"id"];

    if (!method || !messageId) {
        NSLog(@"Missing method or id: method='%@', id='%@'", method, messageId);
        return;
    }

    id result = nil;

    if ([method isEqualToString:@"GN_LoadSys"]) {
        NSLog(@"🚀 GN_LoadSys | Params: %@", params);
        if (params.count > 0) {
            int mode = [params[0] intValue];
            int rc = GN_LoadSys(mode);
            result = @(rc >= 0);
            NSLog(rc >= 0 ? @"✅ GN_LoadSys succeeded" : @"❌ GN_LoadSys failed");
        } else {
            result = @(NO);
        }
    }
    else if ([method isEqualToString:@"GN_Start"]) {
        NSLog(@"🚀 GN_Start | Count: %lu", (unsigned long)params.count);
        if (params.count < 2) {
            result = @(NO);
        } else if (![params[0] isKindOfClass:[NSString class]] ||
                   ![params[1] isKindOfClass:[NSString class]]) {
            result = @(NO);
            NSLog(@"❌ GN_Start params must be strings");
        } else {
            const char* path = [params[0] UTF8String];
            const char* rules = [params[1] UTF8String];
            int rc = GN_Start(path, rules);
            if (rc < 0) {
                result = @(NO);
                NSLog(@"❌ GN_Start failed");
            } else {
                NSString *waitId = [messageId copy];
                __weak typeof(self) weakSelf = self;
                GN_WaitForConnected(VPN_Start_Connected_Timeout_Sec, ^(BOOL connected, NSString *errorMessage) {
                    NSLog(connected ? @"✅ GN_Start connected" : @"❌ GN_Start wait failed: %@", errorMessage);
                    [weakSelf replyMessageId:waitId result:@(connected)];
                });
                return;
            }
        }
    }
    else if ([method isEqualToString:@"GN_StartOK"]) {
        result = @(GN_StartOK());
    }
    else if ([method isEqualToString:@"GN_Stop"]) {
        NSLog(@"🛑 GN_Stop");
        int rc = GN_Stop(1);
        result = @(rc >= 0);
        NSLog(rc >= 0 ? @"✅ GN_Stop succeeded" : @"❌ GN_Stop failed");
    }
    else if ([method isEqualToString:@"GN_GetTrafficInfo"]) {
        uint64_t sent = 0, recv = 0;
        BOOL success = GN_GetTrafficInfo(&sent, &recv);
        if (success) {
            result = @{ @"sendBytes": @(sent), @"receiveBytes": @(recv) };
            NSLog(@"📊 Traffic: %llu ↑ / %llu ↓", sent, recv);
        } else {
            result = [NSNull null];
        }
    }
    else if ([method isEqualToString:@"GN_GetSpeedInfo"]) {
        const char* info = GN_GetSpeedInfo(1);
        result = info ? [NSString stringWithUTF8String:info] : @"";
        NSLog(@"📶 SpeedInfo returned");
    }
    else if ([method isEqualToString:@"GN_TestSpeed"]) {
        //该位置增加测速代码
        NSLog(@"测速......");
        // 懒加载 speedTester
        if (!self.speedTester) {
            self.speedTester = [[DownloadSpeedTester alloc] init];
        }

        // 测速文件 URL（请替换为真实的大文件地址）
        NSString  *testURL=@"https://speed.cloudflare.com/__down?during=download&bytes=1073741824";
        
        //测速超时时间，1000 30秒
        NSTimeInterval timeout = 30.0;
        //刷新进度间隔1秒刷新一次信息
        NSTimeInterval updateIntervalMs = 1000;
        
        [self.speedTester startWithURLString:testURL
                                      timeout:timeout
                             updateIntervalMs:updateIntervalMs
                                   onProgress:^(double progress, double speedKbps) {
                                       NSLog(@"进度: %.0f%% | 实时速度: %.1f Kbps", progress*100, speedKbps);
                                   } onComplete:^(DownloadSpeedResult *result, NSError *error) {
                                       if (result) {
                                           NSLog(@"\n📈【测速报告】\n"
                                                 @"文件大小: %.2f KB\n"
                                                 @"耗时: %.0f ms\n"
                                                 @"平均速度: %.2f Kbps",
                                                 result.fileSizeKB,
                                                 result.durationMs,
                                                 result.averageSpeedKbps);
                                       } else {
                                           NSLog(@"测速失败: %@", error.localizedDescription);
                                       }
                                   }];
        result = [NSNull null];
    }
    else {
        NSLog(@"❓ Unknown method: %@", method);
        result = [NSNull null];
    }

    [self replyMessageId:messageId result:result];
}

- (void)replyMessageId:(NSString *)messageId result:(id)result {
    if (messageId.length == 0) {
        return;
    }
    NSString *resultJSON = [self safeJSONString:result];
    NSString *js = [NSString stringWithFormat:@"(function(){ \
        var handler = window.GnwjBridge && window.GnwjBridge.messageHandlers && window.GnwjBridge.messageHandlers['%@']; \
        if (typeof handler === 'function') { \
            try { handler(%@); } \
            catch(e) { console.error('Callback error:', e); } \
        } else { \
            console.warn('No handler found for ID: %@'); \
        } \
        delete window.GnwjBridge.messageHandlers['%@']; \
    })();", messageId, resultJSON, messageId, messageId];

    [self.webView evaluateJavaScript:js completionHandler:^(id ignored, NSError *jsError) {
        if (jsError) {
            NSLog(@"JS execution error: %@", jsError.localizedDescription);
        }
    }];
}

@end
