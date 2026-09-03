//
//  K1UDPSocket.m
//  Gnwj
//
//  Created by Z0 on 06/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1UDPSocket.h"
#import "K1SocketFactory.h"
#import <KVOController/KVOController.h>
#import "K1Kit.h"
#import "GnwjLogger.h"


#define MAX_OUTGOING_BUFFER_SIZE 1000

@interface K1UDPSocket ()

@property (nonatomic, strong) NSMutableArray *outgoingBuffer;
@property (nonatomic, strong) FBKVOController *KVOController;

@end

@implementation K1UDPSocket

- (instancetype)initWithHost_K1:(NSString *)host port:(NSInteger)port {
    self = [super init];
    if (!host || port <= 0 || port > 65535) return nil;
    if (self) {
        self.host = host;
        self.port = port;

        NWHostEndpoint *endpoint = [NWHostEndpoint endpointWithHostname:host port:[@(port) stringValue]];
        self.session = [[K1SocketFactory currentFactory_K1].tunnelProvider createUDPSessionToEndpoint:endpoint fromEndpoint:nil];

        if (!self.session) {
            LOG_ERROR(@"Failed to create UDP session for %@:%ld", host, (long)port);
            return nil;
        }

        __weak typeof(self) weakSelf = self;
        [self.session setReadHandler:^(NSArray<NSData *> * _Nonnull datagrams, NSError * _Nullable error) {
            (void)weakSelf;
            if (error) {
                LOG_ERROR(@"UDP Read Error: %@", error.localizedDescription);
                return;
            }
            if (weakSelf && [weakSelf.delegate_k1 respondsToSelector:@selector(didReceiveDatas:from:)]) {
                [weakSelf.delegate_k1 didReceiveDatas:datagrams from:weakSelf];
            }
        } maxDatagrams:32];

        self.outgoingBuffer = [NSMutableArray arrayWithCapacity:100];
        self.KVOController = [[FBKVOController alloc] initWithObserver:self];
        [self.KVOController observe:_session keyPath:@"state" options:NSKeyValueObservingOptionNew|NSKeyValueObservingOptionInitial block:^(id  _Nullable observer, id  _Nonnull object, NSDictionary<NSString *,id> * _Nonnull change) {
            [(K1UDPSocket *)observer UDPSessionStateChanged:object];
        }];
    }
    return self;
}

- (void)writeDatas_K1:(NSArray *)datas {
    if (!datas || datas.count == 0) return;

    @synchronized(self.outgoingBuffer) {
        if (self.outgoingBuffer.count + datas.count > MAX_OUTGOING_BUFFER_SIZE) {
            DDLogWarn(@"Outgoing buffer full (%lu), dropping %lu packets", (unsigned long)self.outgoingBuffer.count, (unsigned long)datas.count);
            return;
        }
        [self.outgoingBuffer addObjectsFromArray:datas];
    }

    [self processOutgoingBuffer];
}

- (void)writeData_K1:(NSData *)data toHost:(NSString *)host port:(NSInteger)port {
    if (!data || !host || port <= 0) {
        DDLogWarn(@"Invalid input to writeData_K1:toHost:port:");
        return;
    }

    NWHostEndpoint *endpoint = [NWHostEndpoint endpointWithHostname:host port:[@(port) stringValue]];
    NWUDPSession *tempSession = [[K1SocketFactory currentFactory_K1].tunnelProvider createUDPSessionToEndpoint:endpoint fromEndpoint:nil];

    __weak typeof(self) weakSelf = self;
    [tempSession setReadHandler:^(NSArray<NSData *> *datagrams, NSError *error) {
        (void)weakSelf;
        if (error) {
            DDLogError(@"Temp UDP session read error: %@", error.localizedDescription);
        }
    } maxDatagrams:1];

    [tempSession writeDatagram:data completionHandler:^(NSError *error) {
        if (error) {
            DDLogError(@"DNS query failed to %@:%ld: %@", host, (long)port, error.localizedDescription);
        }
        [tempSession cancel];
    }];
}

- (void)processOutgoingBuffer {
    if (!self.session || self.session.state != NWUDPSessionStateReady) {
        DDLogDebug(@"Session not ready for sending. State: %ld, Endpoint: %@",
                   (long)(self.session ? self.session.state : -1),
                   self.session ? self.session.endpoint : nil);
        return;
    }

    NSArray *datas;
    @synchronized(self.outgoingBuffer) {
        if (self.outgoingBuffer.count == 0) return;
        datas = [self.outgoingBuffer copy];
        [self.outgoingBuffer removeAllObjects];
    }

    __weak typeof(self) weakSelf = self;
    [self.session writeMultipleDatagrams:datas completionHandler:^(NSError *error) {
        (void)weakSelf;
        if (error) {
            DDLogError(@"UDP Send Failed: %@ -> retrying", error.localizedDescription);
            @synchronized(weakSelf.outgoingBuffer) {
                [weakSelf.outgoingBuffer addObjectsFromArray:datas];
            }
        } else {
            DDLogDebug(@"Sent %lu datagrams successfully", (unsigned long)datas.count);
        }
    }];
}

- (void)UDPSessionStateChanged:(NWUDPSession *)session {
    DDLogInfo(@"UDP Session %@ state changed: %ld", session.endpoint, (long)session.state);
    
    if (session.state == NWUDPSessionStateReady) {
        [self processOutgoingBuffer];
    } else if (session.state == NWUDPSessionStateFailed || session.state == NWUDPSessionStateCancelled) {
        DDLogError(@"UDP Session failed/cancelled: %@", session.endpoint);
    }
}

- (void)disconnect {
    self.delegate_k1 = nil;
    if (self.session) {
        [self.session cancel];
        self.session = nil;
    }
}

@end
