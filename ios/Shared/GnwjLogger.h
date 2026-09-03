// GnwjLogger.h
#import <Foundation/Foundation.h>

typedef NS_ENUM(NSInteger, GnwjLogLevel) {
    GnwjLogLevelDebug,
    GnwjLogLevelInfo,
    GnwjLogLevelWarning,
    GnwjLogLevelError
};

@interface GnwjLogger : NSObject

/// 获取单例
+ (instancetype)shared;

/// 日志输出方法（支持格式化字符串）
- (void)debug:(NSString *)format, ... NS_FORMAT_FUNCTION(1,2);
- (void)info:(NSString *)format, ... NS_FORMAT_FUNCTION(1,2);
- (void)warning:(NSString *)format, ... NS_FORMAT_FUNCTION(1,2);
- (void)error:(NSString *)format, ... NS_FORMAT_FUNCTION(1,2);

/// 直接写入消息（可用于崩溃捕获）
- (void)logMessage:(NSString *)message level:(GnwjLogLevel)level;

/// 读取当前日志内容
- (NSString *)readLogContent;

/// 清除日志文件
- (void)clearLogs;

/// 【新增】刷新待合并的重复日志提示（建议在 app 进入后台时调用）
- (void)flushPendingDuplicates;

@end
