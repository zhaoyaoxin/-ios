// DownloadSpeedTester.h
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * 测速结果对象（单位：Kbps）
 */
@interface DownloadSpeedResult : NSObject

@property (nonatomic, readonly) int64_t fileSizeBytes;
@property (nonatomic, readonly) double fileSizeKB;
@property (nonatomic, readonly) NSTimeInterval durationMs;
@property (nonatomic, readonly) double averageSpeedKbps;
@property (nonatomic, strong, readonly) NSDate *startTime;
@property (nonatomic, strong, readonly) NSDate *endTime;

- (instancetype)initWithFileSize:(int64_t)fileSizeBytes
                      durationMs:(NSTimeInterval)durationMs
                       startTime:(NSDate *)startTime
                         endTime:(NSDate *)endTime;

@end

/**
 * 错误码
 */
typedef NS_ENUM(NSInteger, SpeedTestErrorCode) {
    SpeedTestInvalidURL = 1000,
    SpeedTestDownloadFailed,
};

/// 错误域
FOUNDATION_EXPORT NSString * const SpeedTestErrorDomain;

/**
 * 回调定义
 */
typedef void (^SpeedTestProgressHandler)(double progress, double speedKbps);
typedef void (^SpeedTestCompletionHandler)(DownloadSpeedResult * _Nullable result, NSError * _Nullable error);

/**
 * 网络测速器
 */
@interface DownloadSpeedTester : NSObject

- (void)startWithURLString:(NSString *)urlString
                   timeout:(NSTimeInterval)timeout
          updateIntervalMs:(NSTimeInterval)updateIntervalMs
                onProgress:(nullable SpeedTestProgressHandler)progressHandler
              onComplete:(SpeedTestCompletionHandler)completionHandler;

- (void)cancel;

@end

NS_ASSUME_NONNULL_END
