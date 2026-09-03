//
//  K1Protocol.h
//  Gnwj
//
//  Created by Z0 on 05/09/2025.
//  Copyright © 2025 gnwj. All rights reserved.
//

#import <Foundation/Foundation.h>

#define K1TokenRequest          (10)
#define K1TokenResponds         (11)
#define K1DetectRequest         (20)
#define K1DetectResponds        (21)
#define K1IPFowardRequest       (30)
#define K1IPFowardResponds      (31)
#define K1HeartRequest          (50)
#define K1HeartResponds         (51)

#define kNatIPv4Len             (20)

#pragma pack(1)

typedef struct K1_proto_hdr {
    uint32_t length;
    uint16_t type;
    uint8_t version; // 协议版本
    uint8_t rsrvd;   // 保留字段，固定填0
} K1_proto_hdr_t;

typedef struct K1_ip_hdr {
    uint32_t exit;
    uint16_t d_x; // 下行 KB
    uint16_t u_x; // 上行 KB
    uint32_t flow_id;
    uint8_t flow_level;
    char nat_ipv4[kNatIPv4Len];
} K1_ip_hdr_t;

typedef struct K1_ip_hdr_k1 {
    uint32_t exit;
    uint32_t nat_ip;
    uint16_t d_x; // 下行 KB
    uint16_t u_x; // 上行 KB
    uint32_t flow_id;
    uint8_t flow_level;
    uint8_t rsrvd_1;
    uint16_t rsrvd_2;
} K1_ip_hdr_k1_t;

// 新增：探测请求头部结构体
typedef struct K1_detect_hdr {
    uint16_t detect_index;
    uint8_t detect_type;
    uint8_t flow_level;
    uint32_t flow_id;
    uint32_t exit;
    uint32_t nat_ip;
    uint32_t target;
} K1_detect_hdr_t;

//探测返回信息
typedef struct K1_detect_r_hdr {
    uint16_t detect_index;
    uint16_t delay;
    uint32_t flow_id;
    uint32_t exit;
    uint32_t nat_ip;
    uint32_t target;
} K1_detect_r_hdr_t;

//心跳返回信息
typedef struct K1_heartBeat_r_hdr {
    uint32_t packet_tag;
} K1_heartBeat_r_hdr_t;

#pragma pack()

#define PROTO_HEADER_SIZE sizeof(K1_proto_hdr_t)

#define detect_r_SIZE sizeof(K1_detect_r_hdr_t)

#define heartBeat_r_SIZE sizeof(K1_heartBeat_r_hdr_t)


@interface K1Protocol : NSObject

+ (NSData *)heartBeatPacketWithMessage_K0:(NSString *)message;

+ (NSData *)heartBeatPacketWithIndex_k1:(uint32_t)index;

+ (NSData *)IPPacketWithExit_K0:(NSString *)exit
                          tx:(uint16_t)tx
                          rx:(uint16_t)rx
                      flowId:(uint32_t)flowId
                   flowLevel:(uint8_t)flowLevel
                     natIPv4:(NSString *)natIPv4
                    IPPacket:(NSData *)IPPacket;

+ (NSData *)detectPacketWithExit_K0:(NSString *)exit
                          flowId:(NSInteger)flowId
                       flowLevel:(NSInteger)flowLevel
                         natIPv4:(NSString *)netIPv4
                        targetIP:(NSString *)targetIP
                            flag:(NSString *)flag;

+ (NSData *)IPPacketWithExit_k1:(uint32_t)exit
                          natIP:(uint32_t)natIP
                          tx:(uint16_t)tx
                          rx:(uint16_t)rx
                      flowId:(uint32_t)flowId
                   flowLevel:(uint8_t)flowLevel
                    IPPacket:(NSData *)IPPacket;

//探测数据包 可以只 设置detectIndex  flowId  exit
//detectType =0  flowLevel =1   natIP =0  target=0
+ (NSData *)detectPacketWithExit_K1:(uint16_t)detectIndex
                             detectType:(uint8_t)detectType
                              flowLevel:(uint8_t)flowLevel
                                 flowId:(uint32_t)flowId
                                   exit:(uint32_t)exit
                                  natIP:(uint32_t)natIP
                                 target:(uint32_t)target;

+ (NSInteger)getTypeWithPacket:(NSData *)data;
+ (NSData *)getDataWithPacket:(NSData *)data;

@end
