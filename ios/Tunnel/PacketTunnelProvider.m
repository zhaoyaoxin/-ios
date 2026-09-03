//
//  PacketTunnelProvider.m
//  PureNetworkExtension
//
//  Created by AI Assistant on 2025.
//  Copyright © 2025. All rights reserved.
//

#import "PacketTunnelProvider.h"
#import <SystemConfiguration/SystemConfiguration.h>
#import <netinet/in.h>
#import <netinet/ip.h>   // 定义 struct ip
#import <netinet/udp.h>  // 定义 struct udphdr
#import <netinet/tcp.h>  // 定义 struct tcphdr
#import <arpa/inet.h>
#import <ifaddrs.h>
#import <netdb.h>
#import "Headers.h"
#import "K1PacketRouter.h"
#import "N2IPPacket.h"


#import "GnwjLogger.h"


// 允许未匹配流量通过（重要：不能静默丢弃流量）
#define ALLOW_UNMATCHED_TRAFFIC 1

//该位置后续处理建议，增加一个例外列表，类似国内ip
//是否将不需要代理的数据包，转发到系统   1:转发。 0:不转发。建议配置为不转发，还可以依赖程序自身的重试机制  转发时会以虚拟网ip做源IP，结果更糟糕
#define ALLOW_SENDTO_SYS 0

@interface PacketTunnelProvider ()

@property (nonatomic, strong) dispatch_queue_t queue;
@property (nonatomic, strong) dispatch_source_t timer;
@property (nonatomic, assign) BOOL skipFirst;
@property (nonatomic, strong) K1PacketRouter *packetRouter;
@property (nonatomic, copy) void (^pendingStartCompletion)(NSError * _Nullable);
@property (nonatomic, assign) BOOL startCompletionInvoked;
@property (nonatomic, assign) NSInteger startSetupEpoch;
@property (nonatomic, assign) BOOL packetPumpEnabled;
@property (nonatomic, assign) BOOL tunnelStopping;

- (void)completeStartOnce:(NSError *)error epoch:(NSInteger)epoch startIO:(BOOL)startIO;
- (BOOL)isStartEpochValid:(NSInteger)epoch;
- (void)performTunnelSetupWithOptions:(NSDictionary *)options epoch:(NSInteger)epoch;
- (void)setupTunnelWithEpoch:(NSInteger)epoch;

@end

@implementation PacketTunnelProvider

#pragma mark - Checksum Calculation Functions

// IP 校验和计算实现 (添加k1_前缀避免与系统函数冲突)
uint16_t k1_cksum_ip(struct ip *ip, int len) {
    long sum = 0;  /* assume 32 bit long, 16 bit short */
    uint16_t *ptr = (uint16_t *)ip;
    while(len > 1){
        sum += *ptr++;
        if(sum & 0x80000000)   /* if high order bit set, fold */
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if(len)       /* take care of left over byte */
        sum += (unsigned short) *(unsigned char *)ip;
    
    while(sum>>16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    return (uint16_t)~sum;
}

// UDP 校验和计算实现 (添加k1_前缀避免与系统函数冲突)
uint16_t k1_udp_checksum_calc(const void *buff, size_t len, uint32_t src_addr, uint32_t dest_addr) {
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr, *ip_dst = (void *) &dest_addr;
    uint32_t sum;
    size_t length = len;
    
    // Calculate the sum
    sum = 0;
    while (len > 1) {
        sum += *buf++;
        if (sum & 0x80000000)
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if (len & 1)
        // Add the padding if the packet length is odd
        sum += *((uint8_t *) buf);
    
    // Add the pseudo-header
    sum += *(ip_src++);
    sum += *ip_src;
    
    sum += *(ip_dst++);
    sum += *ip_dst;
    
    sum += htons(IPPROTO_UDP);
    sum += htons(length);
    
    // Add the carries
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    // Return the one's complement of sum
    return (uint16_t)(~sum);
}

// TCP 校验和计算实现 (添加k1_前缀避免与系统函数冲突)
uint16_t k1_calc_tcp_checksum(const void *buff, size_t len, uint32_t src_addr, uint32_t dest_addr) {
    if (!buff || len == 0)
        return 0;
    
    const uint16_t *buf = buff;
    uint16_t *ip_src = (void *) &src_addr, *ip_dst = (void *) &dest_addr;
    uint32_t sum;
    size_t length = len;
    
    // Calculate the sum
    sum = 0;
    while (len > 1) {
        sum += *buf++;
        if (sum & 0x80000000)
            sum = (sum & 0xFFFF) + (sum >> 16);
        len -= 2;
    }
    
    if (len & 1)
        // Add the padding if the packet length is odd
        sum += *((uint8_t *) buf);
    
    // Add the pseudo-header
    sum += *(ip_src++);
    sum += *ip_src;
    
    sum += *(ip_dst++);
    sum += *ip_dst;
    
    sum += htons(0); // always zero
    sum += htons(IPPROTO_TCP);
    sum += htons(length);
    
    // Add the carries
    while (sum >> 16)
        sum = (sum & 0xFFFF) + (sum >> 16);
    
    // Return the one's complement of sum
    return (uint16_t)(~sum);
}

#pragma mark - Helper Methods

// 添加"直连"数据包校验和修复方法
// 修复不经过代理的数据包（routePacket_K1 返回 NO）的校验和问题
// 参数:
//   packet - 需要修复的数据包
// 返回:
//   修复后的数据包
- (NSMutableData *)fixChecksumForDirectPacket:(NSData *)packet
{
    NSMutableData *fixedPacket = [packet mutableCopy];
    uint8_t *bytes = fixedPacket.mutableBytes;
    size_t length = fixedPacket.length;
    
    // 验证IP校验和
    struct ip *iphdr = (struct ip *)bytes;
    int ip_hl = iphdr->ip_hl << 2;
    
    if (ip_hl >= sizeof(struct ip) && ip_hl <= length) {
        uint16_t originalChecksum = ntohs(iphdr->ip_sum);
        uint16_t calculatedChecksum = ntohs(k1_cksum_ip(iphdr, ip_hl));
        
        if (calculatedChecksum != 0) {
            DDLogWarn(@"[DIRECT] IP checksum error! Original: 0x%04x, Calculated: 0x%04x, Packet Length: %zu",
                     originalChecksum, calculatedChecksum, length);
            
            // 修复IP校验和
            iphdr->ip_sum = 0;
            iphdr->ip_sum = k1_cksum_ip(iphdr, ip_hl);
            
            // 验证修复后是否正确
            uint16_t fixedChecksum = k1_cksum_ip(iphdr, ip_hl);
            if (fixedChecksum == 0) {
                DDLogInfo(@"[DIRECT] IP checksum fixed successfully");
            } else {
                DDLogError(@"[DIRECT] Failed to fix IP checksum! Fixed: 0x%04x", ntohs(fixedChecksum));
            }
        }
        
        // 如果是UDP包，验证并修复UDP校验和
        if (iphdr->ip_p == IPPROTO_UDP) {
            struct udphdr *udphdr = (struct udphdr *)(bytes + ip_hl);
            size_t udp_length = ntohs(udphdr->uh_ulen);
            
            if (udp_length >= sizeof(struct udphdr) && udp_length <= length - ip_hl) {
                // 保存原始UDP校验和用于日志
                uint16_t originalUdpChecksum = udphdr->uh_sum;
                
                // 临时清零校验和以进行计算
                udphdr->uh_sum = 0;
                uint16_t calculatedUdpChecksum = k1_udp_checksum_calc(bytes + ip_hl, udp_length,
                                                                       iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
                
                if (calculatedUdpChecksum != 0) {
                    DDLogWarn(@"⚠️ [DIRECT] UDP checksum error! Original: 0x%04x, Calculated: 0x%04x",
                             originalUdpChecksum, calculatedUdpChecksum);
                    
                    // 修复UDP校验和
                    udphdr->uh_sum = 0;
                    udphdr->uh_sum = k1_udp_checksum_calc(bytes + ip_hl, udp_length,
                                                      iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
                    
                    // 验证修复后是否正确
                    uint16_t fixedUdpChecksum = k1_udp_checksum_calc(bytes + ip_hl, udp_length,
                                                                      iphdr->ip_src.s_addr, iphdr->ip_dst.s_addr);
                    if (fixedUdpChecksum == 0) {
                        DDLogInfo(@"[DIRECT] UDP checksum fixed successfully");
                    } else {
                        DDLogError(@"[DIRECT] Failed to fix UDP checksum! Fixed: 0x%04x", fixedUdpChecksum);
                    }
                }
            } else {
                DDLogError(@"[DIRECT] Invalid UDP length: %zu (IP header length: %d, Total length: %zu)",
                          udp_length, ip_hl, length);
            }
        }
        
        // 如果是TCP包，验证并修复TCP校验和
        if (iphdr->ip_p == IPPROTO_TCP) {
            struct tcphdr *tcphdr = (struct tcphdr *)(bytes + ip_hl);
            size_t tcp_header_len = tcphdr->th_off << 2;
            size_t tcp_payload_len = length - ip_hl - tcp_header_len;
            
            if (tcp_header_len >= sizeof(struct tcphdr) && tcp_header_len <= length - ip_hl) {
                // 保存原始TCP校验和用于日志
                uint16_t originalTcpChecksum = tcphdr->th_sum;
                
                // 临时清零校验和以进行计算
                tcphdr->th_sum = 0;
                uint16_t calculatedTcpChecksum = k1_calc_tcp_checksum(bytes + ip_hl,
                                                                       tcp_header_len + tcp_payload_len,
                                                                       iphdr->ip_src.s_addr,
                                                                       iphdr->ip_dst.s_addr);
                
                if (calculatedTcpChecksum != 0) {
                    DDLogWarn(@"[DIRECT] TCP checksum error! Original: 0x%04x, Calculated: 0x%04x",
                             originalTcpChecksum, calculatedTcpChecksum);
                    
                    // 修复TCP校验和
                    tcphdr->th_sum = 0;
                    tcphdr->th_sum = k1_calc_tcp_checksum(bytes + ip_hl,
                                                      tcp_header_len + tcp_payload_len,
                                                      iphdr->ip_src.s_addr,
                                                      iphdr->ip_dst.s_addr);
                    
                    // 验证修复后是否正确
                    uint16_t fixedTcpChecksum = k1_calc_tcp_checksum(bytes + ip_hl,
                                                                       tcp_header_len + tcp_payload_len,
                                                                       iphdr->ip_src.s_addr,
                                                                       iphdr->ip_dst.s_addr);
                    if (fixedTcpChecksum == 0) {
                        DDLogInfo(@"[DIRECT] TCP checksum fixed successfully");
                    } else {
                        DDLogError(@"[DIRECT] Failed to fix TCP checksum! Fixed: 0x%04x", fixedTcpChecksum);
                    }
                }
            } else {
                DDLogError(@"[DIRECT] Invalid TCP header length: %zu (IP header length: %d, Total length: %zu)",
                          tcp_header_len, ip_hl, length);
            }
        }
    } else {
        DDLogError(@"[DIRECT] Invalid IP header length: %d (length: %zu)", ip_hl, length);
    }
    
    return fixedPacket;
}

#pragma mark - Tunnel Setup and Management

- (void)setUpLogger
{
#if LOG_OPEN
    
    [[GnwjLogger shared] info:@"info:App 启动成功"];
    [[GnwjLogger shared] debug:@"debug:setUpLogger"];
    [[GnwjLogger shared] warning:@"warning:低电量提醒"];
    [[GnwjLogger shared] error:@"error:网络连接失败"];


    // 读取并打印所有日志
    //NSLog(@"📋 当前日志内容:\n%@", [[GnwjLogger shared] readLogContent]);
    
    /*
    // 只添加 OS Logger（最简单的配置）
    [DDLog addLogger:[DDOSLogger sharedInstance]];
    
    // 2. 获取日志目录路径（示例：App Group 路径）
    NSURL *sharedContainer = [[NSFileManager defaultManager]
        containerURLForSecurityApplicationGroupIdentifier:@"group.com.guangnianjissu.logs"];

    if (!sharedContainer) {
        NSLog(@"🛑 Failed to get shared container! Check entitlements.");
        return;
    }

    NSString *logPath = [sharedContainer.path stringByAppendingPathComponent:@"Logs"];

    // 3. 创建目录
    NSError *error = nil;
    BOOL success = [[NSFileManager defaultManager] createDirectoryAtPath:logPath
                          withIntermediateDirectories:YES
                                           attributes:nil
                                                error:&error];
    if (!success) {
        NSLog(@"🛑 Create log directory failed: %@", error.localizedDescription);
        return;
    }

    // 4. 创建自定义文件管理器（关键步骤）
    //DDLogFileManager *logFileManager = [[DDLogFileManagerDefault alloc] initWithLogsDirectory:logPath];
    
    // 文件日志（使用默认格式）
    DDFileLogger *fileLogger = [[DDFileLogger alloc] init];
    
    //fileLogger.logFileManager = logFileManager; // ✅ 正确方式
    
    fileLogger.rollingFrequency = 60 * 60 * 24;
    fileLogger.logFileManager.maximumNumberOfLogFiles = 7;
    [DDLog addLogger:fileLogger];

    LOG_Info(@"Logger initialized");
    */
#endif
}

- (void)completeStartOnce:(NSError *)error epoch:(NSInteger)epoch startIO:(BOOL)startIO
{
    void (^cb)(NSError *) = nil;
    BOOL shouldStartIO = NO;
    @synchronized (self) {
        if (epoch != self.startSetupEpoch) {
            return;
        }
        if (self.startCompletionInvoked) {
            return;
        }
        self.startCompletionInvoked = YES;
        cb = self.pendingStartCompletion;
        self.pendingStartCompletion = nil;
        if (startIO && !error && !self.tunnelStopping) {
            self.packetPumpEnabled = YES;
            shouldStartIO = YES;
        }
    }
    if (self.packetRouter) {
        self.packetRouter.onAllPathsResolved = nil;
    }
    if (shouldStartIO) {
        [self startHeartBeat];
        [self startReadingPackets];
    }
    if (cb) {
        cb(error);
    }
}

- (BOOL)isStartEpochValid:(NSInteger)epoch
{
    @synchronized (self) {
        return epoch == self.startSetupEpoch && !self.startCompletionInvoked;
    }
}

- (void)performTunnelSetupWithOptions:(NSDictionary *)options epoch:(NSInteger)epoch
{
    if (![self isStartEpochValid:epoch]) {
        return;
    }

    [self setUpLogger];
    LOG_INFO(@"tunnel start!!");
    LOG_ExpObj(options);
    NSLog(@"GN_Tunnel:tunnel start! PID: %d", getpid());
    
    self.queue = dispatch_queue_create("PacketTunnelProvider", DISPATCH_QUEUE_SERIAL);

    NSMutableDictionary *mergedOptions = [NSMutableDictionary dictionary];
    NETunnelProviderProtocol *proto = (NETunnelProviderProtocol *)self.protocolConfiguration;
    if ([proto.providerConfiguration isKindOfClass:[NSDictionary class]]) {
        [mergedOptions addEntriesFromDictionary:proto.providerConfiguration];
    }
    if ([options isKindOfClass:[NSDictionary class]]) {
        [mergedOptions addEntriesFromDictionary:options];
    }

    NSLog(@"GN_Tunnel:Full Options: %@", mergedOptions);
    self.packetRouter = [[K1PacketRouter alloc] initWithOptions:mergedOptions tunnel:self];
    if (!self.packetRouter) {
        NSError *err = [NSError errorWithDomain:@"GnwjNetTunnel"
                                           code:1001
                                       userInfo:@{NSLocalizedDescriptionKey: @"Failed to init packet router (check Path/Rule/Accel_Route_Mode)"}];
        LOG_ERROR(@"%@", err.localizedDescription);
        [self completeStartOnce:err epoch:epoch startIO:NO];
        return;
    }
    self.packetRouter.delegate = self;

    __weak typeof(self) weakSelf = self;
    dispatch_async(self.queue, ^{
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf) {
            return;
        }
        if (![strongSelf isStartEpochValid:epoch]) {
            return;
        }
        [strongSelf setupTunnelWithEpoch:epoch];
    });
}

- (void)startTunnelWithOptions:(NSDictionary *)options completionHandler:(void (^)(NSError * _Nullable))completionHandler
{
    NSInteger epoch = 0;
    @synchronized (self) {
        self.startSetupEpoch += 1;
        epoch = self.startSetupEpoch;
        self.startCompletionInvoked = NO;
        self.tunnelStopping = NO;
        self.packetPumpEnabled = NO;
        self.pendingStartCompletion = completionHandler;
    }
#ifdef DEBUG
    NSTimeInterval delayTime = VPN_Start_Debug_Attach_Sec;
    if (delayTime > 0) {
        NSLog(@"Waiting %.0fs for Xcode Attach to Process...", delayTime);
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delayTime * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
            [self performTunnelSetupWithOptions:options epoch:epoch];
        });
    } else {
        [self performTunnelSetupWithOptions:options epoch:epoch];
    }
#else
    [self performTunnelSetupWithOptions:options epoch:epoch];
#endif
}

- (void)stopTunnelWithReason:(NEProviderStopReason)reason completionHandler:(void (^)(void))completionHandler
{
    NSInteger epoch = 0;
    @synchronized (self) {
        self.tunnelStopping = YES;
        self.packetPumpEnabled = NO;
        epoch = self.startSetupEpoch;
    }
    [self stopHeartBeat];
    
    NSError *cancelErr = [NSError errorWithDomain:@"GnwjNetTunnel"
                                             code:1006
                                         userInfo:@{NSLocalizedDescriptionKey: @"Tunnel stopped before start completed"}];
    [self completeStartOnce:cancelErr epoch:epoch startIO:NO];
    @synchronized (self) {
        self.startSetupEpoch += 1;
    }
    if (self.packetRouter) {
        self.packetRouter.onAllPathsResolved = nil;
        [self.packetRouter stop_K1];
    }
    
    NSLog(@"GN_Tunnel:tunnel stop completionHandler!");
    [super stopTunnelWithReason:reason completionHandler:completionHandler];
}

- (void)setupTunnelWithEpoch:(NSInteger)epoch
{
    if (!self.packetRouter) {
        NSError *err = [NSError errorWithDomain:@"GnwjNetTunnel"
                                           code:1002
                                       userInfo:@{NSLocalizedDescriptionKey: @"packetRouter is nil"}];
        [self completeStartOnce:err epoch:epoch startIO:NO];
        return;
    }

    NEPacketTunnelNetworkSettings *settings = [self.packetRouter createTunnelNetworkSettings];
    
    __weak typeof(self) weakSelf = self;
    [self setTunnelNetworkSettings:settings completionHandler:^(NSError * _Nullable error) {
        __strong typeof(weakSelf) strongSelf = weakSelf;
        if (!strongSelf) {
            return;
        }
        if (![strongSelf isStartEpochValid:epoch]) {
            return;
        }
        
        if (error) {
            LOG_ERROR(@"Error occurred while setTunnelNetworkSettings: %@", error);
            [strongSelf completeStartOnce:error epoch:epoch startIO:NO];
            return;
        }

        if (!strongSelf.packetRouter) {
            NSError *nilErr = [NSError errorWithDomain:@"GnwjNetTunnel"
                                                  code:1002
                                              userInfo:@{NSLocalizedDescriptionKey: @"packetRouter is nil after settings"}];
            [strongSelf completeStartOnce:nilErr epoch:epoch startIO:NO];
            return;
        }

        NSUInteger groupCount = [strongSelf.packetRouter flowGroupCount];
        if (groupCount == 0) {
            NSError *emptyErr = [NSError errorWithDomain:@"GnwjNetTunnel"
                                                    code:1007
                                                userInfo:@{NSLocalizedDescriptionKey: @"No flow groups in Path"}];
            [strongSelf completeStartOnce:emptyErr epoch:epoch startIO:NO];
            return;
        }

        strongSelf.packetRouter.onAllPathsResolved = ^(BOOL anyReady) {
            __strong typeof(weakSelf) innerSelf = weakSelf;
            if (!innerSelf) {
                return;
            }
            if (!anyReady) {
                NSError *pathErr = [NSError errorWithDomain:@"GnwjNetTunnel"
                                                       code:1004
                                                   userInfo:@{NSLocalizedDescriptionKey: @"Path resolve failed"}];
                [innerSelf completeStartOnce:pathErr epoch:epoch startIO:NO];
                return;
            }
            [innerSelf completeStartOnce:nil epoch:epoch startIO:YES];
        };

        [strongSelf.packetRouter start_K1];
        NSLog(@"GN_Tunnel:tunnel start start_K1 groups=%zu", (unsigned long)groupCount);

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(VPN_Start_Path_Resolve_Timeout_Sec * NSEC_PER_SEC)),
                       strongSelf.queue ?: dispatch_get_main_queue(), ^{
            __strong typeof(weakSelf) timeoutSelf = weakSelf;
            if (!timeoutSelf) {
                return;
            }
            BOOL anyReady = NO;
            for (K1FlowGroup *group in timeoutSelf.packetRouter.flowGroups) {
                if (group.status_OneFlowGroup == K1FlowGroupStatusReady ||
                    group.status_OneFlowGroup == K1FlowGroupStatusActive) {
                    anyReady = YES;
                    break;
                }
            }
            if (anyReady) {
                [timeoutSelf completeStartOnce:nil epoch:epoch startIO:YES];
            } else {
                NSError *timeoutErr = [NSError errorWithDomain:@"GnwjNetTunnel"
                                                          code:1005
                                                      userInfo:@{NSLocalizedDescriptionKey: @"Path resolve timeout"}];
                [timeoutSelf completeStartOnce:timeoutErr epoch:epoch startIO:NO];
            }
        });
    }];
}

#pragma mark - Packet Processing

- (void)startReadingPackets
{
    [self readTun];
}

- (void)readTun
{
    if (!self.packetPumpEnabled || self.tunnelStopping) {
        return;
    }
    [self.packetFlow readPacketsWithCompletionHandler:^(NSArray<NSData *> * _Nonnull packets, NSArray<NSNumber *> * _Nonnull versions)
     {
        if (!self.packetPumpEnabled || self.tunnelStopping) {
            return;
        }
        DDLogInfo(@"Received %zu packets from system", packets.count);
        
        //__block NSUInteger chinaIPCount = 0;
        //__block NSUInteger foreignIPCount = 0;
        
        NSMutableArray<NSData *> *directPackets = [NSMutableArray array];
        NSMutableArray<NSNumber *> *directVersions = [NSMutableArray array];
        
        for (NSUInteger i = 0; i < packets.count; i++)
        {
            NSData *packet = packets[i];
            NSNumber *version = versions[i];
            
            // 只处理IPv4数据包
            if ([version intValue] != AF_INET)
            {
                DDLogDebug(@"⏩ Passing non-IPv4 packet (version: %@) directly back to system", version);
                [directPackets addObject:packet];
                [directVersions addObject:version];
                continue;
            }
            
            N2IPPacket *n2packet = [N2IPPacket packet_WithData:packet outgoing:YES];
            
            // 格式化IP地址
            struct in_addr srcAddr, dstAddr;
            srcAddr.s_addr = n2packet.source_IP;
            dstAddr.s_addr = n2packet.destination_IP;
            
            NSString *srcIPStr = [NSString stringWithUTF8String:inet_ntoa(srcAddr)];
            NSString *dstIPStr = [NSString stringWithUTF8String:inet_ntoa(dstAddr)];
            
            //uint32_t dstIP = n2packet.destination_IP;
            
            // 路由检查
            BOOL routed = [self.packetRouter routePacket_K1:packet];
            if (!routed)
            {
                DDLogInfo(@"[DIRECT] Processing packet: %@:%d -> %@:%d, Protocol: %@, Length: %zu bytes",
                         srcIPStr, n2packet.sourcePort_IP,
                         dstIPStr, n2packet.destinationPort_IP,
                         n2packet.is_TCP ? @"TCP" : (n2packet.is_UDP ? @"UDP" : @"OTHER"),
                         packet.length);
                
                #if ALLOW_SENDTO_SYS
                // === 修复：验证并修复"直连"数据包的校验和 ===
                NSMutableData *fixedPacket = [self fixChecksumForDirectPacket:packet];
                [directPackets addObject:fixedPacket];
                [directVersions addObject:version];
                continue;
                #else
                continue;
                #endif
            }
        }
        #if ALLOW_SENDTO_SYS
        // 将所有直连数据包写回系统
        if (directPackets.count > 0)
        {
            DDLogInfo(@"📤 Writing %zu direct packets back to system", directPackets.count);
            
            if (!self.packetFlow)
            {
                DDLogError(@"packetFlow is nil! Cannot send packet to system");
            }
            else
            {
                [self.packetFlow writePackets:directPackets withProtocols:directVersions];
                DDLogInfo(@"Successfully wrote %zu direct packets back to system", directPackets.count);
            }
        }
        #endif
        
        // 使用队列调度下一次读取，避免递归调用导致栈溢出
        dispatch_async(self.queue, ^{
            if (!self.packetPumpEnabled || self.tunnelStopping) {
                return;
            }
            [self readTun];
        });
    }];
}

/*
- (BOOL)isChinaIP:(uint32_t)ip {
    static dispatch_once_t onceToken;
    static NSArray<NEIPv4Route *> *chinaRoutes = nil;
    
    dispatch_once(&onceToken, ^{
        chinaRoutes = [self ChinaIPRoutes];
    });
    
    // 特殊IP处理
    if (ip == htonl(INADDR_LOOPBACK) ||  // 127.0.0.1
        [self isPrivateIP:ip]) {         // 私有IP段
        return YES;
    }
    
    // 检查是否在中国IP段内
    uint32_t ipHostOrder = ntohl(ip);
    for (NEIPv4Route *route in chinaRoutes) {
        uint32_t network = ntohl(inet_addr([route destinationAddress]));
        uint32_t mask = ntohl(inet_addr([route subnetMask]));
        
        if ((ipHostOrder & mask) == (network & mask)) {
            return YES;
        }
    }
    
    return NO;
}

- (BOOL)isPrivateIP:(uint32_t)ip {
    uint32_t ipHostOrder = ntohl(ip);
    // 10.0.0.0/8
    if ((ipHostOrder & 0xFF000000) == 0x0A000000) return YES;
    
    // 172.16.0.0/12
    if ((ipHostOrder & 0xFFF00000) == 0xAC100000) return YES;
    
    // 192.168.0.0/16
    if ((ipHostOrder & 0xFFFF0000) == 0xC0A80000) return YES;
    
    return NO;
}
*/
#pragma mark - Heartbeat and Timer Management

- (void)startHeartBeat {
    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }
    
    self.timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, self.queue);
    dispatch_source_set_timer(self.timer, dispatch_time(DISPATCH_TIME_NOW, 0), 120ull * NSEC_PER_SEC, 0);
    dispatch_source_set_event_handler(self.timer, ^{
        if (!self.packetPumpEnabled || self.tunnelStopping) {
            return;
        }
        if (self.skipFirst) {
            [self.packetRouter doHeartBeat_K1];
        } else {
            self.skipFirst = YES;
        }
    });
    dispatch_resume(self.timer);
}

- (void)stopHeartBeat {
    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }
}

#pragma mark - K1PacketRouterDelegate

- (void)incomingIPPacket:(NSData *)packet fromRouter:(K1PacketRouter *)router
{
    if (!self.packetPumpEnabled || self.tunnelStopping || !packet) {
        return;
    }
    // 添加数据包头部信息日志
    if (packet.length >= 20) {
        const uint8_t *bytes = packet.bytes;
        uint32_t srcIP = ntohl(*(uint32_t *)(bytes + 12));
        uint32_t dstIP = ntohl(*(uint32_t *)(bytes + 16));
        
        DDLogInfo(@"Incoming packet: %zu bytes, %u.%u.%u.%u -> %u.%u.%u.%u",
                 packet.length,
                 (srcIP >> 24) & 0xFF, (srcIP >> 16) & 0xFF, (srcIP >> 8) & 0xFF, srcIP & 0xFF,
                 (dstIP >> 24) & 0xFF, (dstIP >> 16) & 0xFF, (dstIP >> 8) & 0xFF, dstIP & 0xFF);
    }
    
    // 确保 packetFlow 可用
    if (!self.packetFlow) {
        DDLogError(@"packetFlow is nil! Cannot send packet to system");
        return;
    }
    
    // 将数据包写回系统协议栈
    [self.packetFlow writePackets:@[packet]
                    withProtocols:@[@(AF_INET)]];
    
    DDLogInfo(@"Packet successfully sent to system protocol stack");
}

#pragma mark - Provider Message Handling

- (void)handleProviderMessage:(id)message completionHandler:(void (^)(id _Nullable response))completionHandler {
    // 检查是否是流量统计命令
    if ([message isKindOfClass:[NSString class]] && [message isEqualToString:TunnelTrafficCMD]) {
        NSDictionary *trafficInfo = [self getTrafficInfo];
        completionHandler(trafficInfo);
        return;
    }
    
    // 处理其他命令...
    completionHandler(nil);
}

- (NSDictionary *)getTrafficInfo {
    if (!self.packetRouter) {
        return @{
            @"RX_bytes": @(0),
            @"TX_bytes": @(0)
        };
    }

    NSMutableDictionary *trafficInfo = [@{
        @"RX_bytes" : @(self.packetRouter.RX_bytes),
        @"TX_bytes": @(self.packetRouter.TX_bytes)
    } mutableCopy];

    // 选路结果随流量 IPC 一并回传宿主（atomic 读属性，写侧有 @synchronized）
    NSDictionary *pathInfo = self.packetRouter.mainSpeedPathInfo;
    if ([pathInfo isKindOfClass:[NSDictionary class]] && pathInfo.count > 0) {
        trafficInfo[@"Main_Speed_Path_Info"] = pathInfo;
    }

    return [trafficInfo copy];
}

#pragma mark - Override Methods

// 重写此方法以处理来自宿主应用的消息
- (void)handleAppMessage:(NSData *)message completionHandler:(void (^)(NSData * _Nullable response))completionHandler {
    NSString *cmd = [[NSString alloc] initWithData:message encoding:NSUTF8StringEncoding];
    if (cmd && [cmd isEqualToString:TunnelTrafficCMD]) {
        NSDictionary *trafficInfo = [self getTrafficInfo];
        
        // 将字典转换为JSON数据
        NSError *error;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:trafficInfo
                                                         options:0
                                                           error:&error];
        if (error) {
            LOG_ERROR(@"Failed to serialize traffic info: %@", error);
            completionHandler(nil);
            return;
        }
        
        completionHandler(jsonData);
        return;
    }
    
    // 调用父类处理其他消息
    [super handleAppMessage:message completionHandler:completionHandler];
}

@end
