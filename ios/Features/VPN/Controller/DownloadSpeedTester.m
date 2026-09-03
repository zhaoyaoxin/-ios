// DownloadSpeedTester.m
#import "DownloadSpeedTester.h"

NSString * const SpeedTestErrorDomain = @"com.yourcompany.DownloadSpeedTester";

@interface DownloadSpeedTester () <NSURLSessionDownloadDelegate>
@property (nonatomic, strong, nullable) NSURLSessionDownloadTask *task;
@property (nonatomic, strong, nullable) NSURLSession *session;
@property (nonatomic, strong, nullable) NSDate *startTime;
@property (nonatomic, assign) int64_t totalBytesExpected;
@property (nonatomic, assign) int64_t totalBytesReceived;
@property (nonatomic, assign) NSTimeInterval lastUpdateTime;
@property (nonatomic, assign) int64_t lastBytesReceived;
@property (nonatomic, assign) NSTimeInterval updateIntervalMs;
@property (nonatomic, copy, nullable) SpeedTestProgressHandler progressHandler;
@property (nonatomic, copy, nullable) SpeedTestCompletionHandler completionHandler;
@property (nonatomic, copy, nullable) NSString *tempFilePath; // 用 NSString 保存路径
@end

@implementation DownloadSpeedResult

- (instancetype)initWithFileSize:(int64_t)fileSizeBytes
                      durationMs:(NSTimeInterval)durationMs
                       startTime:(NSDate *)startTime
                         endTime:(NSDate *)endTime {
    self = [super init];
    if (self) {
        _fileSizeBytes = fileSizeBytes;
        _durationMs = durationMs;
        _startTime = [startTime copy];
        _endTime = [endTime copy];
        _fileSizeKB = (double)fileSizeBytes / 1024.0;
        _averageSpeedKbps = ((double)fileSizeBytes * 8.0) / 1000.0 / (durationMs / 1000.0);
    }
    return self;
}

@end

@implementation DownloadSpeedTester

- (void)startWithURLString:(NSString *)urlString
                   timeout:(NSTimeInterval)timeout
          updateIntervalMs:(NSTimeInterval)updateIntervalMs
                onProgress:(SpeedTestProgressHandler)progressHandler
              onComplete:(SpeedTestCompletionHandler)completionHandler {

    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) {
        NSError *error = [NSError errorWithDomain:SpeedTestErrorDomain
                                             code:SpeedTestInvalidURL
                                         userInfo:@{NSLocalizedDescriptionKey: @"无效的测速URL"}];
        dispatch_async(dispatch_get_main_queue(), ^{
            completionHandler(nil, error);
        });
        return;
    }

    // ✅ 允许重新启动：如果已有任务正在运行，则取消它
    if (self.task && self.task.state == NSURLSessionTaskStateRunning) {
        NSLog(@"⚠️ 检测到正在运行的任务，自动取消...");
        [self cancel]; // cancel 会触发 delegate 并最终设 task=nil
    } else if (self.task) {
        // 任务存在但非运行中（已完成/失败），直接重用即可
        NSLog(@"🔄 上次任务已结束，准备启动新测速");
    }

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    config.timeoutIntervalForResource = timeout;
    config.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;

    self.session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];

    self.task = [self.session downloadTaskWithURL:url];
    [self.task resume];

    // 初始化状态
    self.startTime = [NSDate date];
    self.totalBytesExpected = 0;
    self.totalBytesReceived = 0;
    self.lastUpdateTime = 0;
    self.lastBytesReceived = 0;
    self.updateIntervalMs = updateIntervalMs > 0 ? updateIntervalMs : 1000.0;
    self.tempFilePath = nil;
    self.progressHandler = [progressHandler copy];
    self.completionHandler = [completionHandler copy];

    NSLog(@"✅ 开始测速: %@ | 超时: %.1f 秒", urlString, timeout);
}

- (void)cancel {
    if (self.task && self.task.state != NSURLSessionTaskStateCompleted) {
        [self.task cancel];
    }
    self.task = nil; // ✅ 立即置为 nil
}

- (void)dealloc {
    [self cancel];
    self.session = nil;
}

#pragma mark - URLSessionDownloadDelegate

- (void)URLSession:(NSURLSession *)session
      downloadTask:(NSURLSessionDownloadTask *)downloadTask
      didWriteData:(int64_t)bytesWritten
 totalBytesWritten:(int64_t)totalBytesWritten
totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {

    // 更新总字节数
    self.totalBytesReceived = totalBytesWritten;
    if (self.totalBytesExpected == 0 && totalBytesExpectedToWrite > 0) {
        self.totalBytesExpected = totalBytesExpectedToWrite;
    }

    NSTimeInterval now = [[NSDate date] timeIntervalSinceDate:self.startTime];
    NSTimeInterval elapsedMs = now * 1000;
    
    // 计算进度：如果总大小未知，使用已下载字节数估算（假设下载至少1MB）
    double progress = 0;
    if (self.totalBytesExpected > 0) {
        progress = (double)totalBytesWritten / (double)self.totalBytesExpected;
    } else if (totalBytesWritten > 0) {
        // 如果总大小未知，使用已下载的字节数来估算进度（假设至少下载10MB）
        progress = MIN((double)totalBytesWritten / (10.0 * 1024.0 * 1024.0), 0.99);
    }

    NSTimeInterval timeSinceLastUpdate = elapsedMs - self.lastUpdateTime;
    // 使用保存的更新间隔
    if (timeSinceLastUpdate >= self.updateIntervalMs) {
        int64_t deltaBytes = totalBytesWritten - self.lastBytesReceived;
        double speedKbps = (deltaBytes * 8.0) / 1000.0 / (timeSinceLastUpdate / 1000.0);

        self.lastUpdateTime = elapsedMs;
        self.lastBytesReceived = totalBytesWritten;

        if (self.progressHandler) {
            double roundedSpeed = round(speedKbps * 10.0) / 10.0;
            double roundedProgress = round(progress * 100.0) / 100.0;
            dispatch_async(dispatch_get_main_queue(), ^{
                self.progressHandler(roundedProgress, roundedSpeed);
            });
        }
    }
}

- (void)URLSession:(NSURLSession *)session
 downloadTask:(NSURLSessionDownloadTask *)downloadTask
didFinishDownloadingToURL:(NSURL *)location {

    self.tempFilePath = location.path;

    NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:self.tempFilePath error:nil];
    NSNumber *size = attrs ? attrs[NSFileSize] : @0;

    NSLog(@"📥 文件已下载到: %@", self.tempFilePath);
    NSLog(@"📊 文件大小: %.2f KB", [size doubleValue] / 1024.0);
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    
    // ======== 🔐 清理临时文件 ========
    if (self.tempFilePath) {
        BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:self.tempFilePath];
        if (exists) {
            NSError *fileError = nil;
            BOOL success = [[NSFileManager defaultManager] removeItemAtPath:self.tempFilePath error:&fileError];
            if (success) {
                NSLog(@"🗑️ ✅ 成功删除临时文件: %@", self.tempFilePath);
            } else {
                NSLog(@"❌ 删除失败！路径: %@", self.tempFilePath);
                NSLog(@"   Error Domain: %@", fileError.domain);
                NSLog(@"   Error Code: %ld", (long)fileError.code);
            }
        } else {
            NSLog(@"ℹ️ 文件已被系统清理或不存在: %@", self.tempFilePath);
        }
        self.tempFilePath = nil;
    }

    // ======== 📊 构造结果 ========
    if (!self.startTime) {
        NSError *startError = [NSError errorWithDomain:SpeedTestErrorDomain
                                                  code:SpeedTestDownloadFailed
                                              userInfo:@{NSLocalizedDescriptionKey: @"测速未启动"}];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.completionHandler) {
                self.completionHandler(nil, startError);
            }
            // ✅ 关键：任务结束，清除 task 引用
            self.task = nil;
        });
        return;
    }

    NSDate *endTime = [NSDate date];
    NSTimeInterval durationMs = [endTime timeIntervalSinceDate:self.startTime] * 1000;
    int64_t finalBytes = self.lastBytesReceived > 0 ? self.lastBytesReceived : self.totalBytesReceived;

    if (finalBytes > 0) {
        DownloadSpeedResult *result = [[DownloadSpeedResult alloc] initWithFileSize:finalBytes
                                                                         durationMs:durationMs
                                                                          startTime:self.startTime
                                                                            endTime:endTime];

        if (error) {
            if ([error.domain isEqualToString:NSURLErrorDomain]) {
                switch (error.code) {
                    case NSURLErrorCancelled:
                        NSLog(@"🛑 测速被取消，返回阶段性结果：%.2f Kbps", result.averageSpeedKbps);
                        break;
                    case NSURLErrorTimedOut:
                        NSLog(@"⏱️ 测速超时，返回阶段性结果：%.2f Kbps", result.averageSpeedKbps);
                        break;
                    default:
                        NSLog(@"⚠️ 下载中断，返回阶段性结果: %.2f Kbps | Error: %@",
                              result.averageSpeedKbps, error.localizedDescription);
                        break;
                }
            } else {
                NSLog(@"ℹ️ 其他错误，返回阶段性结果: %.2f Kbps", result.averageSpeedKbps);
            }
        } else {
            NSLog(@"✅ 测速成功完成！平均速度: %.2f Kbps", result.averageSpeedKbps);
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.completionHandler) {
                self.completionHandler(result, nil);
            }
            // ✅ 任务结束，允许下次启动
            self.task = nil;
        });

    } else {
        NSString *failReason = error ? error.localizedDescription : @"未知错误";
        NSError *failureError = [NSError errorWithDomain:SpeedTestErrorDomain
                                                   code:SpeedTestDownloadFailed
                                               userInfo:@{NSLocalizedDescriptionKey: failReason}];

        NSLog(@"❌ 测速失败：未接收到任何数据 | %@", failReason);

        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.completionHandler) {
                self.completionHandler(nil, failureError);
            }
            // ✅ 同样清除 task
            self.task = nil;
        });
    }
}

@end
