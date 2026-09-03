//
//  K1Protocol.m
//  Gnwj
//
//  Created by Z0 on 05/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import "K1Protocol.h"
#import "K1Kit.h"

@implementation K1Protocol

+ (uint32_t)exitFromString:(NSString *)exit
{
    NSArray *values = [exit componentsSeparatedByString:@"-"];
    if ( [values count] != 2 ) {
        LOG_ERROR(@"invalidit Exit: %@", exit);
        return 0;
    }
    
    uint32_t a = [values[0] intValue];
    uint32_t b = [values[1] intValue];
    return a << 16 | b;
}

+ (NSData *)wrapWithType:(NSInteger)type
                 payload:(NSData *)payload
{
    NSMutableData *data = [NSMutableData data];

    uint32_t len = (uint32_t)[payload length] + PROTO_HEADER_SIZE;
    struct K1_proto_hdr hdr;
    hdr.length = CFSwapInt32HostToLittle(len);
    hdr.type = (uint32_t)type;
    hdr.version =1;
    hdr.rsrvd=0;
    [data appendBytes:&hdr length:PROTO_HEADER_SIZE];
    [data appendData:payload];
    return data;
}

+ (NSData *)heartBeatPacketWithMessage_K0:(NSString *)message
{
    NSData *payload = [message dataUsingEncoding:NSUTF8StringEncoding];
    return [self wrapWithType:K1HeartRequest payload:payload];
}

+ (NSData *)IPPacketWithExit_K0:(NSString *)exitStr
                          tx:(uint16_t)tx
                          rx:(uint16_t)rx
                      flowId:(uint32_t)flowId
                   flowLevel:(uint8_t)flowLevel
                     natIPv4:(NSString *)natIPv4
                    IPPacket:(NSData *)IPPacket
{
    NSMutableData *data = [NSMutableData data];
    struct K1_ip_hdr hdr;
    hdr.exit = [self exitFromString:exitStr];
    hdr.d_x = rx;
    hdr.u_x = tx;
    hdr.flow_id = flowId;
    hdr.flow_level = flowLevel;
    if ( [natIPv4 length] > 0 ) {
        memcpy(hdr.nat_ipv4, [natIPv4 cStringUsingEncoding:NSASCIIStringEncoding], kNatIPv4Len);
    }
    else {
        LOG_INFO(@"nat ipv4 can't be nil");
        return nil;
    }

    [data appendBytes:&hdr length:sizeof(struct K1_ip_hdr)];
    [data appendData:IPPacket];
    return [self wrapWithType:K1IPFowardRequest payload:data];
}

+ (NSData *)IPPacketWithExit_k1:(uint32_t)exit
                          natIP:(uint32_t)natIP
                          tx:(uint16_t)tx
                          rx:(uint16_t)rx
                      flowId:(uint32_t)flowId
                   flowLevel:(uint8_t)flowLevel
                    IPPacket:(NSData *)IPPacket
{
    if (!IPPacket || IPPacket.length == 0) {
        return nil;
    }
    NSMutableData *data = [NSMutableData data];
    struct K1_ip_hdr_k1 hdr;
    hdr.exit = exit;
    hdr.nat_ip = natIP;
    hdr.d_x = rx;
    hdr.u_x = tx;
    hdr.flow_id = flowId;
    hdr.flow_level = flowLevel;
    hdr.rsrvd_1 =0;
    hdr.rsrvd_2=0;
 

    [data appendBytes:&hdr length:sizeof(struct K1_ip_hdr_k1)];
    [data appendData:IPPacket];
    return [self wrapWithType:K1IPFowardRequest payload:data];
}

+ (NSData *)detectPacketWithExit_K0:(NSString *)exit
                          flowId:(NSInteger)flowId
                       flowLevel:(NSInteger)flowLevel
                         natIPv4:(NSString *)natIPv4
                        targetIP:(NSString *)targetIP
                            flag:(NSString *)flag
{
    NSMutableDictionary *reqParams = [NSMutableDictionary dictionary];
    reqParams[@"flow_id"] = @(flowId);
    reqParams[@"flow_level"] = @(flowLevel);
    reqParams[@"exit"] = @([self exitFromString:exit]);
    [reqParams setValue:natIPv4 forKey:@"nat_ip"];
    [reqParams setValue:targetIP forKey:@"target_ip"];
    //[reqParams setValue:flag forKey:@"flag"];
    
    LOG_ExpObj(reqParams);
    NSData *payload = [NSJSONSerialization dataWithJSONObject:reqParams options:0 error:NULL];
    return [self wrapWithType:K1DetectRequest payload:payload];
}

+ (NSData *)heartBeatPacketWithIndex_k1:(uint32_t)index
{
    // 将 index 转为小端（匹配协议头一致性）
    uint32_t indexLE = index;

    // 构造 payload
    NSData *payload = [NSData dataWithBytes:&indexLE length:sizeof(indexLE)];

    // 使用通用包装器打包为完整协议包
    return [self wrapWithType:K1HeartRequest payload:payload];
}

//探测数据包 可以只 设置detectIndex  flowId  exit
//detectType =0  flowLevel =1   natIP =0  target=0
+ (NSData *)detectPacketWithExit_K1:(uint16_t)detectIndex
                             detectType:(uint8_t)detectType
                              flowLevel:(uint8_t)flowLevel
                                 flowId:(uint32_t)flowId
                                   exit:(uint32_t)exit
                                  natIP:(uint32_t)natIP
                                 target:(uint32_t)target
{
    struct K1_detect_hdr hdr = {0};

        hdr.detect_index = detectIndex;
        hdr.detect_type  = detectType;
        hdr.flow_level   = flowLevel;
        hdr.flow_id      = flowId;
        hdr.exit         = exit;
        hdr.nat_ip       =natIP;
        hdr.target       = target;

        NSData *payload = [NSData dataWithBytes:&hdr length:sizeof(hdr)];
        return [self wrapWithType:K1DetectRequest payload:payload];
}

+ (NSInteger)getTypeWithPacket:(NSData *)data
{
    if (!data || [data length] < PROTO_HEADER_SIZE) return 0;
    struct K1_proto_hdr hdr;
    [data getBytes:&hdr length:PROTO_HEADER_SIZE];
    return hdr.type;
}

+ (NSData *)getDataWithPacket:(NSData *)data
{
    if (!data || [data length] <= PROTO_HEADER_SIZE) return nil;
    return [data subdataWithRange:NSMakeRange(PROTO_HEADER_SIZE, data.length - PROTO_HEADER_SIZE)];
}

@end
