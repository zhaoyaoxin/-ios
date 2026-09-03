#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>
@class DownloadSpeedTester;

@interface GnwjBridgeHandler : NSObject <WKScriptMessageHandler>

@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic, strong) DownloadSpeedTester *speedTester;

- (instancetype)initWithWebView:(WKWebView *)webView;
- (void)replyMessageId:(NSString *)messageId result:(id)result;

@end
