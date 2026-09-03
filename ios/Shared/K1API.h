// K1API.h
#import <Foundation/Foundation.h>

#pragma mark - Model Forward Declarations

@class K1M_TRAFFIC_GROUP;
@class K1M_ENTRANCE;
@class K1M_TRAFFIC_RULE;
@class K1M_EXIT;
@class K1M_SPEED_START_INFO;
@class K1M_DNS_RULE;

#pragma mark - Model Interfaces

@interface K1M_TRAFFIC_GROUP : NSObject
@property (nonatomic, strong) NSArray<K1M_TRAFFIC_RULE *> *dest;
@property (nonatomic, strong) NSArray<K1M_ENTRANCE *> *entrance;
@property (nonatomic, strong) NSArray<K1M_EXIT *> *exits;
@property (nonatomic, strong) NSNumber *id;                //规则id 取值"rgid"
@property (nonatomic, strong) NSNumber *offset;            //offset 取值"offset"   不存在时更新为id同值
@property (nonatomic, strong) NSNumber *traffic_level;     //traffic_level 取值"flow-level" 不存在时更新为id同值

- (instancetype)init;
@end

@interface K1M_ENTRANCE : NSObject
@property (nonatomic, strong) NSString *ip;
@property (nonatomic, strong) NSArray<NSNumber *> *port;

- (instancetype)init;
@end

@interface K1M_TRAFFIC_RULE : NSObject
@property (nonatomic, strong) NSArray<NSNumber *> *destination_area_id;
@property (nonatomic, strong) NSArray<NSNumber *> *destination_isp_id;
@property (nonatomic, strong) NSString *host;
@property (nonatomic, strong) NSString *port;
@property (nonatomic, strong) NSString *process;
@property (nonatomic, strong) NSString *protocol;
@property (nonatomic, strong) NSNumber *traffic_id;

- (instancetype)init;
@end

@interface K1M_EXIT : NSObject
@property (nonatomic, strong) NSString *addr;
@property (nonatomic, strong) NSString *nat;
// 新增：只读属性，基于 addr 和 nat 派生
@property (nonatomic, strong, readonly) NSData *Id;
@property (nonatomic, strong, readonly) NSData *Ip_K1;

@property (nonatomic, assign, readonly) uint32_t Id_u32;
@property (nonatomic, assign, readonly) uint32_t Ip_K1_u32;

- (instancetype)init;
@end

@interface K1M_SPEED_START_INFO : NSObject
@property (nonatomic, strong) NSArray<K1M_TRAFFIC_RULE *> *blacklist;
@property (nonatomic, strong) NSArray<K1M_DNS_RULE *> *dns_rule_info;
@property (nonatomic, strong) NSNumber *flow_id;
@property (nonatomic, strong) NSArray<K1M_TRAFFIC_GROUP *> *vni_array;

- (instancetype)init;
@end

@interface K1M_DNS_RULE : NSObject
@property (nonatomic, strong) NSArray<NSString *> *domain;
@property (nonatomic, strong) NSString *server;
@property (nonatomic, strong) NSNumber *traffic_id;

- (instancetype)init;
@end

@interface K1_EXIT_F : NSObject

//下面4个函数保持小端存储
/**
 *  将 "Net-Device" 格式的字符串（如 "192-168"）转换为 4 字节数据
 *  格式：Net_Number << 16 | Device_Number
 */
+ (NSData *)addrToBytes:(NSString *)addr;

/**
 *  将标准 IPv4 字符串（如 "192.168.1.1"）转换为反序字节数组
 *  输出顺序：[3][2][1][0] —— 即高位字节在后，低位在前（类似小端存储）
 */
+ (NSData *)ipToBytesK1:(NSString *)ipAddress;

+ (uint32_t)toUInt32:(NSData *)data;           // 从 offset 0 读取
+ (uint32_t)toUInt32:(NSData *)data atOffset:(NSUInteger)offset;

@end
