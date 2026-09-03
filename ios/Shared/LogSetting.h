//
//  LogSetting.h
//
//  Created by Z0 on 22/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "Headers.h"

// 兼容 CocoaLumberjack 的宏接口，底层使用 GnwjLogger

#import "GnwjLogger.h"

#ifndef DDLogCompatibility_h
#define DDLogCompatibility_h

#ifdef __cplusplus
extern "C" {
#endif

// ==================== 日志级别映射 ====================
// 你可以通过定义 DDLOG_LEVEL 控制输出级别
// 示例：
// #define DDLOG_LEVEL DDLogLevelInfo  // 只输出 Info 及以上

typedef NS_ENUM(NSInteger, DDLogLevel) {
    DDLogLevelDebug = 0,
    DDLogLevelInfo  = 1,
    DDLogLevelWarn  = 2,
    DDLogLevelError = 3
};

// 默认开启所有级别（Debug 模式）
#define DDLOG_LEVEL DDLogLevelDebug
// ==================== 宏开关控制 ====================
// 根据 DDLOG_LEVEL 过滤输出
#define DDLogDebug(frmt, ...) \
    do { \
        if (DDLOG_LEVEL <= DDLogLevelDebug) { \
            [[GnwjLogger shared] debug:(frmt), ##__VA_ARGS__]; \
        } \
    } while(0)

#define DDLogInfo(frmt, ...) \
    do { \
        if (DDLOG_LEVEL <= DDLogLevelInfo) { \
            [[GnwjLogger shared] info:(frmt), ##__VA_ARGS__]; \
        } \
    } while(0)

#define DDLogWarn(frmt, ...) \
    do { \
        if (DDLOG_LEVEL <= DDLogLevelWarn) { \
            [[GnwjLogger shared] warning:(frmt), ##__VA_ARGS__]; \
        } \
    } while(0)

#define DDLogError(frmt, ...) \
    do { \
        if (DDLOG_LEVEL <= DDLogLevelError) { \
            [[GnwjLogger shared] error:(frmt), ##__VA_ARGS__]; \
        } \
    } while(0)

// 可选：支持 CocoaLumberjack 的旧宏名
#ifndef LOG_DEBUG
    #define LOG_DEBUG(frmt, ...) DDLogDebug((frmt), ##__VA_ARGS__)
#endif

#ifndef LOG_INFO
    #define LOG_INFO(frmt, ...)  DDLogInfo((frmt), ##__VA_ARGS__)
#endif

#ifndef LOG_WARN
    #define LOG_WARN(frmt, ...)  DDLogWarn((frmt), ##__VA_ARGS__)
#endif

#ifndef LOG_ERROR
    #define LOG_ERROR(frmt, ...) DDLogError((frmt), ##__VA_ARGS__)
#endif

#define LOG_ExpObj(_X_)              LOG_INFO(@"%s = %@", #_X_, _X_)

#ifdef __cplusplus
}
#endif

#endif

