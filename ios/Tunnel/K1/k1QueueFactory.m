//
//  K1QueueFactory.m
//  Gnwj
//
//  Created by Z0 on 05/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1QueueFactory.h"

static dispatch_queue_t queue = NULL;
static char *queueKey = "com.Gnwj.K1.processqueue";

@implementation K1QueueFactory

+ (dispatch_queue_t)getQueue_K1
{
    if ( !queue ) {
        queue = dispatch_queue_create(queueKey, 0);
        dispatch_queue_set_specific(queue, queueKey, &queueKey, NULL);
    }
    return queue;
}

+ (BOOL)onQueue_K1
{
    return dispatch_get_specific(&queueKey) != NULL;
}

+ (void)excuteOnQueueSynchronizedly_K1:( void (^)(void) )block
{
    if ( [self onQueue_K1] ) {
        block();
    }
    else {
        dispatch_sync([self getQueue_K1], block);
    }
}

@end
