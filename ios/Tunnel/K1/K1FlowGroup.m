//
//  K1FlowGroup.m
//  Gnwj
//
//  Created by Z0 on 01/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1FlowGroup.h"
#import "K1Protocol.h"
#import "N2IPPacket.h"
#import <KVOController/KVOController.h>
#import "K1API.h"
#import <stdatomic.h>
#import <NetworkExtension/NetworkExtension.h>

#define BadDelay (3000)

static _Atomic(uint32_t) s_global_heartbeat_tag = 1000;

@interface K1HeartBeatItem : NSObject
@property (nonatomic, assign) NSInteger packet_tag;
@property (nonatomic, assign) NSInteger packetId;
@property (nonatomic, copy) NSString *host;
@property (nonatomic, assign) NSTimeInterval sendTimestamp;
@property (nonatomic, assign) NSTimeInterval reciveTimestamp;
@property (nonatomic, assign) NSInteger return_packet_tag;
@end

@implementation K1HeartBeatItem
- (instancetype)initWithData:(NSData *)json
{
    self = [super init];
    if (self && json && [json length] >= heartBeat_r_SIZE)
    {
        struct K1_heartBeat_r_hdr heartBeat_return;
        
        [json getBytes:&heartBeat_return length:heartBeat_r_SIZE];
        self.return_packet_tag = heartBeat_return.packet_tag;
    }
    else
    {
        DDLogError(@"Invalid heartbeat data len: %lu", (unsigned long)[json length]);
        return nil;
    }
    return self;
}
- (NSString *)description {
    NSInteger delay = (self.reciveTimestamp - self.sendTimestamp) * 1000;
    return [NSString stringWithFormat:@"A_Back(host=%@,id=%ld,delay=%ldms)",
            self.host, (long)self.packetId, (long)delay];
}
@end

///////////////////////////////////////////////////////////////////////////////////////////////////

@interface K1DetectItem : NSObject
@property (nonatomic, assign) NSInteger delay;
@property (nonatomic, assign) NSInteger loss;
@property (nonatomic, strong) NSString *itemKey;
@end

@implementation K1DetectItem
- (instancetype)initWithJSONData:(NSData *)json {
    self = [super init];
    if (!(self && json && [json length] >= detect_r_SIZE)) {
        DDLogError(@"Invalid detect data len: %lu", (unsigned long)[json length]);
        return nil;
    }
    struct K1_detect_r_hdr detect_return;
    [json getBytes:&detect_return length:detect_r_SIZE];
    // detect_index 编码入口下标；exit 为出口 Id，用于 per-(entrance,exit) 打分
    self.itemKey = [NSString stringWithFormat:@"%u|%u",
                    (unsigned)detect_return.detect_index,
                    (unsigned)detect_return.exit];
    self.delay = detect_return.delay > BadDelay ? BadDelay : detect_return.delay;
    self.loss = 0;
    return self;
}
- (NSString *)description {
    return [NSString stringWithFormat:@"%@ D:%ldms L:%ld%%", self.itemKey, (long)self.delay, (long)self.loss];
}
@end

///////////////////////////////////////////////////////////////////////////////////////////////////

@implementation K1ResolveResultItem
- (NSString *)description {
    return [NSString stringWithFormat:@"entrance:%@→exit:%@ flowLevel:%ld score:%ld",
            self.entrance_OneFlowGroup.ip, self.exit_OneFlowGroup.nat,
            (long)self.flowLevel_OneFlowGroup, (long)self.score_OneFlowGroup];
}
@end

///////////////////////////////////////////////////////////////////////////////////////////////////

#define kMaxTimeoutHeartBeatCount (6)

@interface K1FlowGroup () <K1UDPSocketDelegate>
@property (nonatomic, assign) NSInteger heartBeatCount;
@property (nonatomic, assign) NSTimeInterval resolveDuration;
@property (nonatomic, strong) NSMutableDictionary *heartBeatResultMap;
@property (nonatomic, strong) NSMutableDictionary *BDetectResultMap;
@property (nonatomic, strong) NSMutableDictionary *socketMap;
@property (nonatomic, strong) NSMutableSet *readySocketIps;
@property (nonatomic, assign) NSInteger timeoutHeartBeatCounter;
@property (nonatomic, assign) NSTimeInterval lastHeartBeatStamp;
@property (nonatomic, strong) dispatch_source_t timer;
@property (nonatomic, strong) dispatch_source_t resolveTimer;
@property (nonatomic, strong) K1UDPSocket *socket;
@property (nonatomic, assign) BOOL detectionStarted;
@property (nonatomic, assign) BOOL resolveFinished;
@property (nonatomic, assign) NSUInteger resolveEpoch; // 作废上一轮 dispatch_after / 超时回调
@property (nonatomic, strong) NSMutableArray<NWUDPSession *> *observedSessions;
/// 每个入口 IP 剩余可试端口（已打乱）；用尽则放弃该入口
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSMutableArray<NSNumber *> *> *entrancePortsLeft;
/// 原始端口快照，供「全部失败后仍随机选一个」兜底
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<NSNumber *> *> *entrancePortsOriginal;
/// 已做过兜底随机绑口的入口，避免 Failed 后无限重试
@property (nonatomic, strong) NSMutableSet<NSString *> *entrancePortFallbackUsed;
@end

@implementation K1FlowGroup

- (instancetype)init {
    self = [super init];
    if (self) {
        self.heartBeatCount = 4;
        self.resolveDuration = 5;
        self.observedSessions = [NSMutableArray array];
        self.entrancePortsLeft = [NSMutableDictionary dictionary];
        self.entrancePortsOriginal = [NSMutableDictionary dictionary];
        self.entrancePortFallbackUsed = [NSMutableSet set];

        // 必须与属性名 status_OneFlowGroup 一致，否则保活心跳永远不会启动
        // Ready 即开始保活（不必等首包 Active），避免“已选路但无流量时链路已死”
        [self.KVOController observe:self
                            keyPath:@"status_OneFlowGroup"
                            options:NSKeyValueObservingOptionOld|NSKeyValueObservingOptionNew
                              block:^(id _, id obj, NSDictionary *change) {
            K1FlowGroup *fg = obj;
            K1FlowGroupStatus old = [change[NSKeyValueChangeOldKey] integerValue];
            K1FlowGroupStatus new = [change[NSKeyValueChangeNewKey] integerValue];
            DDLogInfo(@"FlowGroup[%@] status: %ld → %ld", @(fg.groupId_OneFlowGroup), (long)old, (long)new);

            BOOL oldKeep = (old == K1FlowGroupStatusReady || old == K1FlowGroupStatusActive);
            BOOL newKeep = (new == K1FlowGroupStatusReady || new == K1FlowGroupStatusActive);
            if (newKeep && !oldKeep) {
                [fg startHeartBeat];
            } else if (!newKeep && oldKeep) {
                [fg stopHeartBeat];
            }
        }];
    }
    return self;
}

- (void)dealloc {
    [self cancelResolveTimeout];

    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }

    [self.KVOController unobserveAll];

    DDLogInfo(@"K1FlowGroup %@ deallocated", @(self.groupId_OneFlowGroup));
}

- (NSString *)description {
    return [NSString stringWithFormat:@"K1FlowGroup-%@", @(self.groupId_OneFlowGroup)];
}

#pragma mark - Cleanup & Reset

- (void)unobserveSocketSessions {
    for (NWUDPSession *sess in self.observedSessions) {
        [self.KVOController unobserve:sess];
    }
    [self.observedSessions removeAllObjects];
}

- (void)cleanupForNewResolve {
    [self cancelResolveTimeout];
    [self stopHeartBeat];
    // 只移除 socket session 观察，保留 status_OneFlowGroup 的 KVO
    [self unobserveSocketSessions];

    if (self.socketMap) {
        for (K1UDPSocket *sock in self.socketMap.allValues) {
            [sock disconnect];
        }
    }

    self.socket = nil;
    self.socketMap = [NSMutableDictionary dictionary];
    self.readySocketIps = [NSMutableSet set];
    self.heartBeatResultMap = [NSMutableDictionary dictionary];
    self.BDetectResultMap = [NSMutableDictionary dictionary];
    self.entrancePortsLeft = [NSMutableDictionary dictionary];
    self.entrancePortsOriginal = [NSMutableDictionary dictionary];
    self.entrancePortFallbackUsed = [NSMutableSet set];
    self.detectionStarted = NO;
    self.resolveFinished = NO;
    // 使上一轮未执行完的 dispatch_after / 超时回调全部失效
    self.resolveEpoch += 1;
}

#pragma mark - Resolving Lifecycle

- (void)setupResolveTimeout {
    [self cancelResolveTimeout];
    NSUInteger epoch = self.resolveEpoch;
    self.resolveTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(self.resolveTimer, dispatch_time(DISPATCH_TIME_NOW, 8.0 * NSEC_PER_SEC), DISPATCH_TIME_FOREVER, 0);
    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.resolveTimer, ^{
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf || strongSelf.resolveEpoch != epoch || strongSelf.resolveFinished) {
            return;
        }
        DDLogWarn(@"[FLOW-%@] Resolve timeout after 8s (detectionStarted=%d ready=%lu)",
                  @(strongSelf.groupId_OneFlowGroup),
                  strongSelf.detectionStarted,
                  (unsigned long)strongSelf.readySocketIps.count);
        // 部分入口已 Ready：只保留 Ready 入口再探测，避免未 Ready 口拖累 A/B
        if (!strongSelf.detectionStarted && strongSelf.readySocketIps.count > 0) {
            [strongSelf pruneNonReadyEntranceSockets];
            if (strongSelf.socketMap.count > 0) {
                [strongSelf sendDetectionPackets];
                return;
            }
        }
        [strongSelf finishResolving];
    });
    dispatch_resume(self.resolveTimer);
}

- (void)cancelResolveTimeout {
    if (self.resolveTimer) {
        dispatch_source_cancel(self.resolveTimer);
        self.resolveTimer = nil;
    }
}

- (void)markResolveFailedWithResults:(NSArray *)results {
    [self cancelResolveTimeout];
    self.resolveFinished = YES;
    self.status_OneFlowGroup = K1FlowGroupStatusInvalid;
    self.socket = nil;
    self.resolveEntrance_OneFlowGroup = nil;
    self.resolveExit_OneFlowGroup = nil;
    [self.delegate_OneFlowGroup flowGroupFaildResolving:self];
    [self.delegate_OneFlowGroup finishResolvingWithAllResults:results ?: @[] fromFlowGroup:self];
}

/// 打乱入口端口列表（随机起点，失败再依次换下一个）；去重避免重复试同一端口
- (NSMutableArray<NSNumber *> *)shuffledPortsForEntrance:(K1M_ENTRANCE *)ent {
    NSMutableArray<NSNumber *> *ports = [NSMutableArray array];
    NSMutableSet<NSNumber *> *seen = [NSMutableSet set];
    for (id p in ent.port) {
        NSInteger v = 0;
        if ([p isKindOfClass:[NSNumber class]]) {
            v = [p integerValue];
        } else if ([p isKindOfClass:[NSString class]]) {
            v = [p integerValue];
        } else {
            continue;
        }
        if (v <= 0 || v > 65535) {
            continue;
        }
        NSNumber *num = @(v);
        if ([seen containsObject:num]) {
            continue;
        }
        [seen addObject:num];
        [ports addObject:num];
    }
    for (NSUInteger i = ports.count; i > 1; i--) {
        NSUInteger j = arc4random_uniform((uint32_t)i);
        [ports exchangeObjectAtIndex:(i - 1) withObjectAtIndex:j];
    }
    return ports;
}

- (void)tearDownSocketForEntranceIP:(NSString *)ip {
    if (!ip) {
        return;
    }
    K1UDPSocket *old = self.socketMap[ip];
    if (!old) {
        return;
    }
    if (old.session) {
        [self.KVOController unobserve:old.session];
        [self.observedSessions removeObject:old.session];
    }
    [old disconnect];
    [self.socketMap removeObjectForKey:ip];
    @synchronized(self.readySocketIps) {
        [self.readySocketIps removeObject:ip];
    }
}

/// 探测尚未开始时：若当前入口均已 Ready，则开始 A/B；若已无任何 socket 则失败
- (void)checkStartDetectionOrFailIfNeeded {
    if (self.detectionStarted || self.resolveFinished) {
        return;
    }
    if (self.socketMap.count == 0) {
        DDLogError(@"No usable entrance sockets for group %@", @(self.groupId_OneFlowGroup));
        [self cancelResolveTimeout];
        [self markResolveFailedWithResults:@[]];
        return;
    }
    if ([self.readySocketIps count] >= self.socketMap.count) {
        [self cancelResolveTimeout];
        [self sendDetectionPackets];
    }
}

/// 去掉尚未 Ready 的入口，保证 A/B 只打在可用端口上
- (void)pruneNonReadyEntranceSockets {
    NSArray *ips = [self.socketMap.allKeys copy];
    for (NSString *ip in ips) {
        BOOL ready = NO;
        @synchronized(self.readySocketIps) {
            ready = [self.readySocketIps containsObject:ip];
        }
        if (!ready) {
            DDLogWarn(@"Prune non-ready entrance %@ before A/B", ip);
            [self tearDownSocketForEntranceIP:ip];
        }
    }
}

/// 为入口绑定一个端口：随机序中取下一个；创建失败或 session 失败可再调以换端口
- (BOOL)bindNextPortForEntranceIP:(NSString *)ip epoch:(NSUInteger)epoch {
    if (!ip || self.resolveFinished || self.resolveEpoch != epoch || self.detectionStarted) {
        return NO;
    }
    NSMutableArray<NSNumber *> *left = self.entrancePortsLeft[ip];
    if (![left isKindOfClass:[NSMutableArray class]]) {
        return [self bindFallbackRandomPortForEntranceIP:ip epoch:epoch];
    }

    while (left.count > 0) {
        NSInteger port = [left.firstObject integerValue];
        [left removeObjectAtIndex:0];

        if ([self attachSocketForEntranceIP:ip port:port epoch:epoch allowPortRetry:YES]) {
            return YES;
        }
        DDLogWarn(@"Entrance %@:%ld attach failed, try next port (left=%lu)",
                  ip, (long)port, (unsigned long)left.count);
    }

    // 所有端口按序都不可用 → 仍随机选一个走后续 Ready/A+B 流程
    DDLogWarn(@"Entrance %@ all ports failed sequential try, fallback to random one", ip);
    return [self bindFallbackRandomPortForEntranceIP:ip epoch:epoch];
}

/// 兜底：端口都试过后仍随机挑一个绑定，继续走 Ready → A+B（不再因 Failed 换口）
- (BOOL)bindFallbackRandomPortForEntranceIP:(NSString *)ip epoch:(NSUInteger)epoch {
    if (!ip || self.resolveFinished || self.resolveEpoch != epoch || self.detectionStarted) {
        return NO;
    }
    if ([self.entrancePortFallbackUsed containsObject:ip]) {
        return NO;
    }
    [self.entrancePortFallbackUsed addObject:ip];

    NSArray<NSNumber *> *orig = self.entrancePortsOriginal[ip];
    if (![orig isKindOfClass:[NSArray class]] || orig.count == 0) {
        [self tearDownSocketForEntranceIP:ip];
        return NO;
    }

    NSUInteger idx = arc4random_uniform((uint32_t)orig.count);
    NSInteger port = [orig[idx] integerValue];
    DDLogWarn(@"Entrance %@ fallback random port %ld (ignore prior failures)", ip, (long)port);

    if ([self attachSocketForEntranceIP:ip port:port epoch:epoch allowPortRetry:NO]) {
        return YES;
    }

    // 随机到的口 create 也失败：再扫一遍原始列表，能建起哪个用哪个
    for (NSNumber *p in orig) {
        if ([p integerValue] == port) {
            continue;
        }
        if ([self attachSocketForEntranceIP:ip port:[p integerValue] epoch:epoch allowPortRetry:NO]) {
            DDLogWarn(@"Entrance %@ fallback secondary port %ld", ip, (long)[p integerValue]);
            return YES;
        }
    }

    [self tearDownSocketForEntranceIP:ip];
    DDLogError(@"Entrance %@ fallback also failed to create any socket", ip);
    return NO;
}

/// 创建并观察 session；allowPortRetry=YES 时 Failed 会换下一端口
- (BOOL)attachSocketForEntranceIP:(NSString *)ip
                             port:(NSInteger)port
                            epoch:(NSUInteger)epoch
                   allowPortRetry:(BOOL)allowPortRetry {
    [self tearDownSocketForEntranceIP:ip];

    K1UDPSocket *sock = [[K1UDPSocket alloc] initWithHost_K1:ip port:port];
    if (!sock) {
        return NO;
    }

    sock.delegate_k1 = self;
    self.socketMap[ip] = sock;
    DDLogInfo(@"Entrance %@ using port %ld (retryAllowed=%d remaining=%lu)",
              ip, (long)port, allowPortRetry,
              (unsigned long)[self.entrancePortsLeft[ip] count]);

    NWUDPSession *session = sock.session;
    if (!session) {
        [self tearDownSocketForEntranceIP:ip];
        return NO;
    }

    [self.observedSessions addObject:session];
    __weak typeof(self) weakSelf = self;
    [self.KVOController observe:session
                        keyPath:@"state"
                        options:NSKeyValueObservingOptionNew|NSKeyValueObservingOptionInitial
                          block:^(id _, id obj, NSDictionary *change) {
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf || strongSelf.resolveEpoch != epoch || strongSelf.resolveFinished) {
            return;
        }
        NWUDPSession *sess = obj;
        K1UDPSocket *current = strongSelf.socketMap[ip];
        if (!current || current.session != sess) {
            return;
        }

        if (sess.state == NWUDPSessionStateReady) {
            @synchronized(strongSelf.readySocketIps) {
                [strongSelf.readySocketIps addObject:ip];
            }
            [strongSelf checkStartDetectionOrFailIfNeeded];
            return;
        }

        if ((sess.state == NWUDPSessionStateFailed ||
             sess.state == NWUDPSessionStateCancelled) &&
            !strongSelf.detectionStarted) {
            @synchronized(strongSelf.readySocketIps) {
                if ([strongSelf.readySocketIps containsObject:ip]) {
                    return;
                }
            }
            DDLogWarn(@"Entrance %@:%ld session failed/cancelled (retryAllowed=%d)",
                      ip, (long)current.port, allowPortRetry);
            if (allowPortRetry) {
                // 异步换口，避免在 KVO 回调栈内同步递归 attach
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (strongSelf.resolveEpoch != epoch ||
                        strongSelf.resolveFinished ||
                        strongSelf.detectionStarted) {
                        return;
                    }
                    BOOL ok = [strongSelf bindNextPortForEntranceIP:ip epoch:epoch];
                    if (!ok) {
                        [strongSelf tearDownSocketForEntranceIP:ip];
                        DDLogWarn(@"Entrance %@ no port left after fail", ip);
                    }
                    [strongSelf checkStartDetectionOrFailIfNeeded];
                });
                return;
            }
            // 兜底绑口 session 已死：移出以免卡住其它入口开探测
            [strongSelf tearDownSocketForEntranceIP:ip];
            DDLogWarn(@"Entrance %@ fallback session dead, drop entrance", ip);
            [strongSelf checkStartDetectionOrFailIfNeeded];
        }
    }];
    return YES;
}

- (void)startResolving_OneFlowGroup {
    // 防止重复启动
    if (self.status_OneFlowGroup == K1FlowGroupStatusDetecting ||
        self.status_OneFlowGroup == K1FlowGroupStatusResolving) {
        DDLogDebug(@"Already resolving, skip...");
        return;
    }

    [self cleanupForNewResolve];

    _timeoutHeartBeatCounter = 0;
    _heartDelay_OneFlowGroup = 0;
    _heartSent_OneFlowGroup = 0;
    _heartRecived_OneFlowGroup = 0;
    
    self.status_OneFlowGroup = K1FlowGroupStatusDetecting;
    DDLogInfo(@"Starting resolve for group ID: %@", @(self.groupId_OneFlowGroup));

    if (self.entrances_OneFlowGroup.count == 0 || self.exits_OneFlowGroup.count == 0) {
        DDLogError(@"No entrances/exits available");
        [self markResolveFailedWithResults:@[]];
        return;
    }

    NSUInteger epoch = self.resolveEpoch;
    for (K1M_ENTRANCE *ent in self.entrances_OneFlowGroup) {
        NSString *ip = ent.ip;
        if (![ip isKindOfClass:[NSString class]] || ip.length == 0) {
            DDLogWarn(@"Skip entrance with empty ip");
            continue;
        }
        if (![ent.port isKindOfClass:[NSArray class]] || ent.port.count == 0) {
            DDLogWarn(@"Skip entrance %@ with empty ports", ip);
            continue;
        }

        NSMutableArray<NSNumber *> *ports = [self shuffledPortsForEntrance:ent];
        if (ports.count == 0) {
            DDLogWarn(@"Skip entrance %@ with no valid ports", ip);
            continue;
        }
        self.entrancePortsOriginal[ip] = [ports copy];
        self.entrancePortsLeft[ip] = ports;

        if (![self bindNextPortForEntranceIP:ip epoch:epoch]) {
            DDLogWarn(@"Entrance %@ failed sequential+fallback bind", ip);
        }
    }

    if (self.socketMap.count == 0) {
        DDLogError(@"No usable entrance sockets for group %@", @(self.groupId_OneFlowGroup));
        [self markResolveFailedWithResults:@[]];
        return;
    }

    [self setupResolveTimeout];
    // 若 Initial 已全部 Ready，上面 bind 里可能已触发探测；此处再兜底一次
    [self checkStartDetectionOrFailIfNeeded];
}

- (void)sendDetectionPackets {
    if (self.detectionStarted || self.resolveFinished) {
        return;
    }
    // 开探测前再清一次非 Ready，保证 A/B 只走可用端口
    [self pruneNonReadyEntranceSockets];
    if (self.socketMap.count == 0) {
        DDLogError(@"[FLOW-%@] No ready entrance for A/B", @(self.groupId_OneFlowGroup));
        [self markResolveFailedWithResults:@[]];
        return;
    }

    self.detectionStarted = YES;
    DDLogInfo(@"[FLOW-%@] Sending A/B detection on %lu ready sockets",
              @(self.groupId_OneFlowGroup), (unsigned long)self.socketMap.count);

    NSTimeInterval interval = self.resolveDuration / (self.heartBeatCount + 1);
    NSInteger hbCount = self.heartBeatCount;
    NSUInteger epoch = self.resolveEpoch;
    __weak typeof(self) weakSelf = self;

    for (int i = 0; i < hbCount; i++) {
        dispatch_time_t when = dispatch_time(DISPATCH_TIME_NOW, (i + 1) * interval * NSEC_PER_SEC);
        dispatch_after(when, dispatch_get_main_queue(), ^{
            __strong typeof(weakSelf) strongSelf = weakSelf;
            if (!strongSelf ||
                strongSelf.resolveEpoch != epoch ||
                strongSelf.resolveFinished ||
                strongSelf.status_OneFlowGroup != K1FlowGroupStatusDetecting) {
                return;
            }
            for (K1M_ENTRANCE *ent in strongSelf.entrances_OneFlowGroup) {
                K1UDPSocket *sock = strongSelf.socketMap[ent.ip];
                if (!sock) {
                    continue;
                }
                // 仅对仍 Ready 的 session 发 A 探测
                if (!sock.session || sock.session.state != NWUDPSessionStateReady) {
                    continue;
                }
                uint32_t tag = atomic_fetch_add(&s_global_heartbeat_tag, 1);
                K1HeartBeatItem *item = [[K1HeartBeatItem alloc] init];
                item.host = ent.ip;
                item.packetId = i;
                item.sendTimestamp = CFAbsoluteTimeGetCurrent();
                item.packet_tag = tag;
                item.return_packet_tag = 888;

                NSData *data = [K1Protocol heartBeatPacketWithIndex_k1:tag];
                @synchronized(strongSelf.heartBeatResultMap) {
                    strongSelf.heartBeatResultMap[@(tag)] = item;
                }

                if (data.length > 0) {
                    [sock writeDatas_K1:@[data]];
                } else {
                    DDLogWarn(@"Empty heartbeat data for %@", ent.ip);
                }
            }
        });
    }

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.5 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf ||
            strongSelf.resolveEpoch != epoch ||
            strongSelf.resolveFinished ||
            strongSelf.status_OneFlowGroup != K1FlowGroupStatusDetecting) {
            return;
        }
        NSUInteger entIndex = 0;
        for (K1M_ENTRANCE *ent in strongSelf.entrances_OneFlowGroup) {
            K1UDPSocket *sock = strongSelf.socketMap[ent.ip];
            uint16_t detectIndex = (uint16_t)MIN(entIndex, (NSUInteger)UINT16_MAX);
            entIndex++;
            if (!sock) continue;
            
            for (K1M_EXIT *ext in strongSelf.exits_OneFlowGroup) {
                uint32_t exitVal = ext.Id_u32;
                uint32_t flowId = (uint32_t)(strongSelf.flowId_OneFlowGroup & 0xFFFFFFFF);
                
                // detect_index = 入口下标，回包 itemKey 与打分 BKey 对齐
                NSData *data = [K1Protocol detectPacketWithExit_K1:detectIndex
                                                          detectType:0
                                                           flowLevel:(uint8_t)strongSelf.flowLevel_OneFlowGroup
                                                              flowId:flowId
                                                                exit:exitVal
                                                               natIP:0
                                                              target:0];
                if (data.length > 0 &&
                    sock.session &&
                    sock.session.state == NWUDPSessionStateReady) {
                    [sock writeDatas_K1:@[data]];
                }
            }
        }
    });

    // 多留 1s 等最后一包 A 回包（末包约在 resolveDuration*(n/(n+1)) 发出）
    NSTimeInterval finishAfter = self.resolveDuration + 1.0;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, finishAfter * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf || strongSelf.resolveEpoch != epoch) {
            return;
        }
        [strongSelf finishResolving];
    });
}

- (NSString *)bKeyForEntranceIndex:(NSUInteger)entIndex exitId:(uint32_t)exitId {
    return [NSString stringWithFormat:@"%u|%u", (unsigned)entIndex, (unsigned)exitId];
}

- (BOOL)isUsableResolveResult:(K1ResolveResultItem *)result {
    if (!result || !result.entrance_OneFlowGroup.ip) {
        return NO;
    }
    K1UDPSocket *sock = self.socketMap[result.entrance_OneFlowGroup.ip];
    if (!sock) {
        return NO;
    }
    // 至少 A 或 B 有真实探测数据，避免全 BadDelay 假成功
    return (result.A_Delay < BadDelay) || (result.B_Delay < BadDelay);
}

- (void)finishResolving {
    if (self.resolveFinished) {
        return;
    }
    self.resolveFinished = YES;
    [self cancelResolveTimeout];

    // 从未发出探测（socket 未 Ready / 超时）→ 直接失败，禁止假 Ready
    if (!self.detectionStarted) {
        DDLogError(@"[FLOW-%@] finish without detection, mark fail", @(self.groupId_OneFlowGroup));
        [self markResolveFailedWithResults:@[]];
        return;
    }

    self.status_OneFlowGroup = K1FlowGroupStatusResolving;

    // 计算 A 段质量
    NSMutableDictionary *totalReplyMap = [NSMutableDictionary dictionary];
    NSMutableDictionary *totalDelayMap = [NSMutableDictionary dictionary];
    
    NSArray *hbItems = nil;
    @synchronized(self.heartBeatResultMap) {
        hbItems = [self.heartBeatResultMap.allValues copy];
    }
    
    for (K1HeartBeatItem *eachItem in hbItems) {
        if (eachItem.reciveTimestamp <= 0) {
            continue;
        }
        NSString *key = eachItem.host;
        NSInteger delay = (eachItem.reciveTimestamp - eachItem.sendTimestamp) * 1000;
        if (delay < 0) {
            LOG_ERROR(@"delay < 0 %ld, %@", (long)delay, eachItem);
            continue;
        }
        
        NSInteger currentDelay = [totalDelayMap[key] integerValue];
        totalDelayMap[key] = @(currentDelay + delay);
        
        NSInteger currentReply = [totalReplyMap[key] integerValue];
        totalReplyMap[key] = @(currentReply + 1);
    }
    
    NSDictionary *bMap = nil;
    @synchronized(self.BDetectResultMap) {
        bMap = [self.BDetectResultMap copy];
    }
    
    NSInteger hbCount = MAX(self.heartBeatCount, 1);
    NSMutableArray *allResults = [NSMutableArray array];
    NSUInteger entIndex = 0;
    for (K1M_ENTRANCE *eachEntrance in self.entrances_OneFlowGroup) {
        for (K1M_EXIT *eachExit in self.exits_OneFlowGroup) {
            K1ResolveResultItem *result = [K1ResolveResultItem new];
            result.entrance_OneFlowGroup = eachEntrance;
            result.exit_OneFlowGroup = eachExit;
            result.flowLevel_OneFlowGroup = self.flowLevel_OneFlowGroup;
            NSString *AKey = eachEntrance.ip;
            NSString *BKey = [self bKeyForEntranceIndex:entIndex exitId:eachExit.Id_u32];
            
            NSInteger ADelayTotal = [totalDelayMap[AKey] integerValue];
            NSInteger AReplyTotal = [totalReplyMap[AKey] integerValue];
            
            if (AReplyTotal == 0) {
                result.A_Delay = BadDelay;
            } else {
                // 按实际回包数求平均，避免丢包时延时被低估
                result.A_Delay = ADelayTotal / (float)AReplyTotal;
            }
            
            result.A_Lost = (hbCount - MIN(AReplyTotal, hbCount)) * 100 / hbCount;
            result.A_Score = result.A_Delay * (1 + result.A_Lost / 100.0);
            
            K1DetectItem *item = bMap[BKey];
            if (!item) {
                result.B_Delay = BadDelay;
                result.B_Lost = 100;
            } else {
                result.B_Lost = item.loss;
                result.B_Delay = item.delay;
            }
            
            result.B_Score = result.B_Delay * (1 + result.B_Lost / 100.0);
            result.score_OneFlowGroup = result.A_Score + result.B_Score;
            [allResults addObject:result];
        }
        entIndex++;
    }
    
    NSArray *orderedResults = [allResults sortedArrayUsingComparator:^NSComparisonResult(K1ResolveResultItem *obj1, K1ResolveResultItem *obj2) {
        if (obj1.score_OneFlowGroup > obj2.score_OneFlowGroup) {
            return NSOrderedDescending;
        }
        if (obj1.score_OneFlowGroup < obj2.score_OneFlowGroup) {
            return NSOrderedAscending;
        }
        return NSOrderedSame;
    }];
    
    for (K1ResolveResultItem *one_Result in orderedResults) {
        K1M_ENTRANCE *ent = one_Result.entrance_OneFlowGroup;
        K1M_EXIT *ext = one_Result.exit_OneFlowGroup;
        DDLogInfo(@"Path info: FlowGroup=%@ FlowLevel:%ld Entrance:%@ Exit:%@(%u) A:%ld/%ld B:%ld/%ld score:%ld usable:%d",
                  @(self.groupId_OneFlowGroup),
                  (long)one_Result.flowLevel_OneFlowGroup,
                  ent.ip,
                  ext.addr,
                  ext.Id_u32,
                  (long)one_Result.A_Delay, (long)one_Result.A_Lost,
                  (long)one_Result.B_Delay, (long)one_Result.B_Lost,
                  (long)one_Result.score_OneFlowGroup,
                  [self isUsableResolveResult:one_Result]);
    }
    
    K1ResolveResultItem *bestResolve = nil;
    for (K1ResolveResultItem *cand in orderedResults) {
        if ([self isUsableResolveResult:cand]) {
            bestResolve = cand;
            break;
        }
    }
    
    if (bestResolve) {
        self.resolveEntrance_OneFlowGroup = bestResolve.entrance_OneFlowGroup;
        self.resolveExit_OneFlowGroup = bestResolve.exit_OneFlowGroup;
        
        self.socket = self.socketMap[bestResolve.entrance_OneFlowGroup.ip];
        if (!self.socket) {
            DDLogError(@"[FLOW-%@] best path has no socket, fail", @(self.groupId_OneFlowGroup));
            [self markResolveFailedWithResults:orderedResults];
            return;
        }
        self.socket.delegate_k1 = self;
        bestResolve.port_OneFlowGroup = self.socket.port;

        // 关掉未选中入口，避免多余 UDP session 占资源/收错包
        NSString *bestIp = bestResolve.entrance_OneFlowGroup.ip;
        NSArray *allIps = [self.socketMap.allKeys copy];
        for (NSString *ip in allIps) {
            if (bestIp && [ip isEqualToString:bestIp]) {
                continue;
            }
            K1UDPSocket *other = self.socketMap[ip];
            if (other.session) {
                [self.KVOController unobserve:other.session];
                [self.observedSessions removeObject:other.session];
            }
            [other disconnect];
            [self.socketMap removeObjectForKey:ip];
        }
        
        self.status_OneFlowGroup = K1FlowGroupStatusReady;
        [self.delegate_OneFlowGroup successResolving:bestResolve fromFlowGroup:self];
        
        DDLogInfo(@"Path Success: FlowGroup=%@ Entrance:%@:%ld Exit:%@ A:%ld B:%ld score:%ld",
                  @(self.groupId_OneFlowGroup),
                  bestResolve.entrance_OneFlowGroup.ip,
                  (long)bestResolve.port_OneFlowGroup,
                  bestResolve.exit_OneFlowGroup.addr,
                  (long)bestResolve.A_Delay,
                  (long)bestResolve.B_Delay,
                  (long)bestResolve.score_OneFlowGroup);
        
        [self.delegate_OneFlowGroup finishResolvingWithAllResults:orderedResults fromFlowGroup:self];
    } else {
        DDLogError(@"[FLOW-%@] No usable path after resolve", @(self.groupId_OneFlowGroup));
        [self markResolveFailedWithResults:orderedResults];
    }
}

- (BOOL)inputPacket_OneFlowGroup:(NSData *)packet {
    // Timeout/Invalid/Detecting 等均不可转发（Timeout 枚举值 > Ready，不能用 < Ready）
    if (self.status_OneFlowGroup != K1FlowGroupStatusReady &&
        self.status_OneFlowGroup != K1FlowGroupStatusActive) {
        DDLogDebug(@"Drop packet: not ready (%ld)", (long)self.status_OneFlowGroup);
        return NO;
    }
    if (!self.socket || !self.resolveExit_OneFlowGroup) {
        DDLogError(@"Drop packet: missing socket/exit");
        return NO;
    }
    if (self.status_OneFlowGroup == K1FlowGroupStatusReady) {
        self.status_OneFlowGroup = K1FlowGroupStatusActive;
    }

    NSData *wrapped = [K1Protocol IPPacketWithExit_k1:self.resolveExit_OneFlowGroup.Id_u32
                                              natIP:self.resolveExit_OneFlowGroup.Ip_K1_u32
                                                  tx:self.tx_OneFlowGroup
                                                  rx:self.rx_OneFlowGroup
                                              flowId:(uint32_t)self.flowId_OneFlowGroup
                                           flowLevel:(uint8_t)self.flowLevel_OneFlowGroup
                                            IPPacket:packet];
    if (wrapped.length == 0) {
        DDLogError(@"Failed to wrap IP packet (flowId=%@)", @(self.flowId_OneFlowGroup));
        return NO;
    }

    [self.socket writeDatas_K1:@[wrapped]];
    return YES;
}

- (void)stop_OneFlowGroup {
    [self stopHeartBeat];
    self.resolveEpoch += 1; // 作废进行中的探测回调
    self.status_OneFlowGroup = K1FlowGroupStatusInit;
    self.socket = nil;
    self.resolveFinished = YES;
    self.detectionStarted = NO;

    [self cancelResolveTimeout];
    [self unobserveSocketSessions];
    for (K1UDPSocket *sock in self.socketMap.allValues) {
        [sock disconnect];
    }
    self.socketMap = nil;
    self.readySocketIps = nil;
}

- (void)processRespData:(NSData *)data {
    if (!data || [data length] < PROTO_HEADER_SIZE) {
        DDLogWarn(@"Invalid packet length: %lu", (unsigned long)[data length]);
        return;
    }

    NSInteger type = [K1Protocol getTypeWithPacket:data];
    if (type == K1HeartResponds)
    {
        NSData *resp = [K1Protocol getDataWithPacket:data];
        K1HeartBeatItem *item = [[K1HeartBeatItem alloc] initWithData:resp];
        if (!item) {
            return;
        }
        
        NSInteger return_packet_tag = item.return_packet_tag;
        if (return_packet_tag == 0)
        {
            _timeoutHeartBeatCounter = 0;
            _heartRecived_OneFlowGroup += 1;
        }
        else
        {
            @synchronized(self.heartBeatResultMap)
            {
                K1HeartBeatItem *pending = self.heartBeatResultMap[@(return_packet_tag)];
                if (pending)
                {
                    pending.reciveTimestamp = CFAbsoluteTimeGetCurrent();
                }
            }
        }
    }
    else if (type == K1DetectResponds &&
             (self.status_OneFlowGroup == K1FlowGroupStatusDetecting ||
              self.status_OneFlowGroup == K1FlowGroupStatusResolving) &&
             !self.resolveFinished) {
        // Resolving 瞬间仍接受迟到的 B，直到 resolveFinished
        NSData *resp = [K1Protocol getDataWithPacket:data];
        K1DetectItem *item = [[K1DetectItem alloc] initWithJSONData:resp];
        if (item && item.itemKey.length > 0) {
            @synchronized(self.BDetectResultMap) {
                self.BDetectResultMap[item.itemKey] = item;
            }
        }
    }
    else if (type == K1IPFowardResponds) {
        NSData *pkt = [K1Protocol getDataWithPacket:data];
        if (pkt && pkt.length > 0) {
            [self.delegate_OneFlowGroup flowPacket:pkt fromFlowGroup:self];
        }
    }
}

- (void)didReceiveDatas:(NSArray *)datas from:(K1UDPSocket *)socket {
    for (NSData *d in datas) {
        [self processRespData:d];
    }
}

- (void)startHeartBeat {
    LOG_INFO(@"%@ start heart beat", self);
    if (self.timer == nil) {
        self.timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
        dispatch_source_set_timer(self.timer, DISPATCH_TIME_NOW, K1_HeartBeatInteval * NSEC_PER_SEC, 1 * NSEC_PER_SEC);

        __weak typeof(self) weakSelf = self;
        dispatch_source_set_event_handler(self.timer, ^{
            __strong typeof(weakSelf) strongSelf = weakSelf;
            if (!strongSelf) return;
            [strongSelf doHeartBeat];
        });

        dispatch_resume(self.timer);
    }
}

- (void)stopHeartBeat {
    LOG_INFO(@"%@ stop heart beat", self);
    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }
}

- (void)doHeartBeat {
    // Ready / Active 都保活（选路成功即可盯链路，不必等业务首包）
    if (self.status_OneFlowGroup != K1FlowGroupStatusReady &&
        self.status_OneFlowGroup != K1FlowGroupStatusActive) {
        return;
    }
    if (!self.socket || _timeoutHeartBeatCounter >= kMaxTimeoutHeartBeatCount) {
        DDLogWarn(@"%@ keepalive timeout, re-resolve", self);
        self.status_OneFlowGroup = K1FlowGroupStatusTimeout;
        [self startResolving_OneFlowGroup];
        return;
    }

    // session 未 Ready 时写出只会进缓冲/丢弃，仍计超时会导致误重选
    if (!self.socket.session || self.socket.session.state != NWUDPSessionStateReady) {
        DDLogWarn(@"%@ keepalive skipped: session not ready (state=%ld)",
                  self, (long)(self.socket.session ? self.socket.session.state : -1));
        _timeoutHeartBeatCounter++;
        return;
    }

    NSData *data = [K1Protocol heartBeatPacketWithIndex_k1:0];
    if (data.length == 0) {
        DDLogError(@"%@ keepalive empty packet", self);
        return;
    }
    [self.socket writeDatas_K1:@[data]];
    _timeoutHeartBeatCounter++;
    _lastHeartBeatStamp = CFAbsoluteTimeGetCurrent();
    _heartSent_OneFlowGroup++;
}

@end
