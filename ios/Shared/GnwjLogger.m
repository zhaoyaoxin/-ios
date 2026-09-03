// GnwjLogger.m
// 轻量级日志系统，无需 CocoaLumberjack，支持去重

#import "GnwjLogger.h"
#import <os/log.h>

// ==================== 配置区 ====================
#define GNWJ_APP_GROUP_ID        @"group.com.guangnianjissu.logs"  // 🔥 请确认你的 App Group ID
#define GNWJ_MAX_LOG_FILE_SIZE   (5*1024 * 1024)     // 5MB 自动轮转
#define GNWJ_LOG_LEVEL_ENABLED   GnwjLogLevelDebug   // 上线建议改为 Info 或 Warning
#define GNWJ_ENABLE_DEDUPE       1                   // 是否启用日志去重
#define GNWJ_MAX_DUPLICATE_COUNT 10                 // 最大合并次数（避免数字过大）
// ===============================================

@implementation GnwjLogger {
    NSURL *_logFileURL;
    dispatch_queue_t _logQueue;
    
    // 👇 日志去重相关变量
    NSString *_lastLogMessage;        // 上一条原始消息内容（不含时间戳）
    NSUInteger _duplicateCount;       // 当前重复次数
}

+ (instancetype)shared {
    static GnwjLogger *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[GnwjLogger alloc] init];
    });
    return instance;
}

- (instancetype)init {
    if (self = [super init]) {
        _logQueue = dispatch_queue_create("com.gnwj.logger.queue", DISPATCH_QUEUE_SERIAL);
        [self setupLogFileInSharedContainer];

        // 初始化去重状态
#if GNWJ_ENABLE_DEDUPE
        _lastLogMessage = nil;
        _duplicateCount = 0;
#endif

        // 异步检查是否需要轮转
        dispatch_async(_logQueue, ^{
            [self rotateLogIfNecessary];
        });
    }
    return self;
}

#pragma mark - Setup Log Directory

- (void)setupLogFileInSharedContainer {
    NSURL *container = [[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:GNWJ_APP_GROUP_ID];
    if (!container) {
        NSLog(@"GnwjLogger App Group 获取失败，请检查 entitlements");
        return;
    }

    NSURL *logsDir = [container URLByAppendingPathComponent:@"logs" isDirectory:YES];
    _logFileURL = [logsDir URLByAppendingPathComponent:@"app.log"];

    NSError *error = nil;
    if (![[NSFileManager defaultManager] fileExistsAtPath:logsDir.path]) {
        [[NSFileManager defaultManager] createDirectoryAtPath:logsDir.path
                                      withIntermediateDirectories:YES
                                                       attributes:nil
                                                            error:&error];
        if (error) {
            fprintf(stderr, "GnwjLogger: 创建目录失败: %s\n", error.localizedDescription.UTF8String);
        }
    }

    NSLog(@"GnwjLogger 日志路径: %@", _logFileURL.path);
}

#pragma mark - Logging Methods

- (void)debug:(NSString *)format, ... {
    if (GNWJ_LOG_LEVEL_ENABLED > GnwjLogLevelDebug) return;
    va_list args;
    va_start(args, format);
    NSString *msg = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    [self logMessage:msg level:GnwjLogLevelDebug];
}

- (void)info:(NSString *)format, ... {
    if (GNWJ_LOG_LEVEL_ENABLED > GnwjLogLevelInfo) return;
    va_list args;
    va_start(args, format);
    NSString *msg = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    [self logMessage:msg level:GnwjLogLevelInfo];
}

- (void)warning:(NSString *)format, ... {
    if (GNWJ_LOG_LEVEL_ENABLED > GnwjLogLevelWarning) return;
    va_list args;
    va_start(args, format);
    NSString *msg = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    [self logMessage:msg level:GnwjLogLevelWarning];
}

- (void)error:(NSString *)format, ... {
    if (GNWJ_LOG_LEVEL_ENABLED > GnwjLogLevelError) return;
    va_list args;
    va_start(args, format);
    NSString *msg = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    [self logMessage:msg level:GnwjLogLevelError];
}

- (void)logMessage:(NSString *)message level:(GnwjLogLevel)level {
    if (level < GNWJ_LOG_LEVEL_ENABLED) return;

    dispatch_async(_logQueue, ^{
        NSString *formatted = [self formatMessage:message level:level];
        [self writeLogString:formatted];
        [self rotateLogIfNecessary];
    });
}

#pragma mark - Private Helpers

- (NSString *)formatMessage:(NSString *)msg level:(GnwjLogLevel)level {
    NSDateFormatter *df = [[NSDateFormatter alloc] init];
    df.dateFormat = @"yyyy-MM-dd HH:mm:ss.SSS";

    NSString *levelStr;
    switch (level) {
        case GnwjLogLevelDebug:   levelStr = @"D"; break;
        case GnwjLogLevelInfo:    levelStr = @"I"; break;
        case GnwjLogLevelWarning: levelStr = @"W"; break;
        case GnwjLogLevelError:   levelStr = @"E"; break;
        default:                  levelStr = @"?"; break;
    }

    return [NSString stringWithFormat:@"[%@][%@] %@\n",
            [df stringFromDate:[NSDate date]],
            levelStr,
            msg];
}

#pragma mark - Write & Rotate

- (void)writeLogString:(NSString *)string {
    @try {
        // 提取真实消息部分用于比对（跳过时间戳和级别）
        NSRange bracketRange = [string rangeOfString:@"] " options:NSBackwardsSearch];
        if (bracketRange.location == NSNotFound) {
            [self _writeRawData:[string dataUsingEncoding:NSUTF8StringEncoding]];
            return;
        }
        NSString *rawMessage = [string substringFromIndex:bracketRange.location + 2];

#if GNWJ_ENABLE_DEDUPE
        // 检查是否与上一条完全相同
        if (_duplicateCount > 0 && [_lastLogMessage isEqualToString:rawMessage]) {
            _duplicateCount = MIN(_duplicateCount + 1, GNWJ_MAX_DUPLICATE_COUNT);
            return; // 不写入，等待下一次变化或 flush
        } else {
            // 即将写新日志，先输出之前的重复统计
            if (_duplicateCount > 1) {
                NSString *dupMsg = [NSString stringWithFormat:@"[... repeated %lu times]\n", (unsigned long)_duplicateCount];
                [self _writeRawData:[dupMsg dataUsingEncoding:NSUTF8StringEncoding]];
            }
            // 更新为新消息
            _lastLogMessage = [rawMessage copy];
            _duplicateCount = 1;
        }
#endif

        // 正常写入当前日志
        [self _writeRawData:[string dataUsingEncoding:NSUTF8StringEncoding]];

    } @catch (NSException *exception) {
        fprintf(stderr, "GnwjLogger: Exception during write: %s\n", exception.reason.UTF8String);
    }
}

- (void)_writeRawData:(NSData *)data {
    if (!data) return;

    NSFileManager *fm = [NSFileManager defaultManager];
    BOOL exists = [fm fileExistsAtPath:self->_logFileURL.path];

#if DEBUG
    // 输出到控制台（绕过 <private>）
    static os_log_t log = NULL;
    if (!log) {
        log = os_log_create("com.gnwj.logger", "debug");
    }
    os_log(log, "%{public}s", [NSString stringWithUTF8String:data.bytes].UTF8String);
#endif


    if (exists) {
        NSFileHandle *fh = [NSFileHandle fileHandleForWritingAtPath:self->_logFileURL.path];
        if (fh) {
            @try {
                [fh seekToEndOfFile];
                [fh writeData:data];
                [fh closeFile];
            } @catch (NSException *e) {
                fprintf(stderr, "GnwjLogger: Write handle failed: %s\n", e.reason.UTF8String);
            }
        } else {
            // fallback: 读取原内容 + 拼接
            NSString *original = [NSString stringWithContentsOfURL:self->_logFileURL encoding:NSUTF8StringEncoding error:nil];
            NSString *combined = [original stringByAppendingString:[NSString stringWithUTF8String:data.bytes]];
            [combined writeToURL:self->_logFileURL atomically:YES encoding:NSUTF8StringEncoding error:nil];
        }
    } else {
        [data writeToURL:self->_logFileURL atomically:YES];
    }
}

- (void)rotateLogIfNecessary {
    if (!self->_logFileURL || ![[NSFileManager defaultManager] fileExistsAtPath:self->_logFileURL.path]) {
        return;
    }

    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:self->_logFileURL.path error:nil];
    uint64_t fileSize = [attrs fileSize];

    if (fileSize >= GNWJ_MAX_LOG_FILE_SIZE) {
        NSURL *backupURL = [self->_logFileURL URLByAppendingPathExtension:@"old"];
        NSError *error = nil;

        [[NSFileManager defaultManager] removeItemAtURL:backupURL error:nil];
        if ([[NSFileManager defaultManager] moveItemAtURL:self->_logFileURL toURL:backupURL error:&error]) {
            [[NSData data] writeToURL:self->_logFileURL atomically:YES];
        } else {
            fprintf(stderr, "⚠️ GnwjLogger: Rotation failed: %s\n", error.localizedDescription.UTF8String);
        }
    }
}

#pragma mark - Read & Clear

- (NSString *)readLogContent {
    if (!self->_logFileURL || ![[NSFileManager defaultManager] fileExistsAtPath:self->_logFileURL.path]) {
        return @"";
    }
    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfURL:self->_logFileURL encoding:NSUTF8StringEncoding error:&error];
    return error ? @"[Failed to read log content]" : content;
}

- (void)clearLogs {
    dispatch_async(self->_logQueue, ^{
        NSError *error = nil;
        [[NSFileManager defaultManager] removeItemAtURL:self->_logFileURL error:&error];
        [[NSData data] writeToURL:self->_logFileURL atomically:YES];

#if GNWJ_ENABLE_DEDUPE
        self->_lastLogMessage = nil;
        self->_duplicateCount = 0;
#endif

        if (error) {
            fprintf(stderr, "GnwjLogger: Clear failed: %s\n", error.localizedDescription.UTF8String);
        }
    });
}

#pragma mark - Duplicate Flush (Call on App Background)

- (void)flushPendingDuplicates {
    dispatch_sync(_logQueue, ^{
#if GNWJ_ENABLE_DEDUPE
        if (_duplicateCount > 1) {
            NSString *dupMsg = [NSString stringWithFormat:@"[... repeated %lu times]\n", (unsigned long)_duplicateCount];
            [self _writeRawData:[dupMsg dataUsingEncoding:NSUTF8StringEncoding]];
            _duplicateCount = 1; // 标记已刷新，避免重复打印
        }
#endif
    });
}

@end

