//
//  K1QueueFactory.h
//  Gnwj
//
//  Created by Z0 on 05/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface K1QueueFactory : NSObject

+ (dispatch_queue_t)getQueue_K1;
+ (BOOL)onQueue_K1;
+ (void)excuteOnQueueSynchronizedly_K1:( void (^)(void) )block;

@end
