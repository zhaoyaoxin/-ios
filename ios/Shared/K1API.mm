// K1API.mm (Important: Use .mm extension!)
#include <arpa/inet.h> // inet_pton
#import "K1API.h"

// 假设这些是全局变量或配置项
int g_New_Path = 0;
int g_LoadMode = 0;
int g_Socks5 = 0;
bool b_Get_Socks5_OK = false;

#pragma mark - K1M_TRAFFIC_GROUP

@implementation K1M_TRAFFIC_GROUP

- (instancetype)init {
    self = [super init];
    if (self) {
        _dest = @[];
        _entrance = @[];
        _exits = @[];
        _id = @0;
        _offset = @0;
        _traffic_level = @1; // 默认级别
    }
    return self;
}

@end

#pragma mark - K1M_ENTRANCE

@implementation K1M_ENTRANCE

- (instancetype)init {
    self = [super init];
    if (self) {
        _ip = @"";
        _port = @[];
    }
    return self;
}

@end

#pragma mark - K1M_TRAFFIC_RULE

@implementation K1M_TRAFFIC_RULE

- (instancetype)init {
    self = [super init];
    if (self) {
        _destination_area_id = @[];
        _destination_isp_id = @[];
        _host = @"";
        _port = @"";
        _process = @"";
        _protocol = @"";
        _traffic_id = @0;
    }
    return self;
}

@end

#pragma mark - K1M_EXIT

@implementation K1M_EXIT

- (instancetype)init {
    self = [super init];
    if (self) {
        _addr = @"";
        _nat = @"";
    }
    return self;
}

- (NSData *)Id {
    if (!self.addr || self.addr.length == 0) {
        return [NSData dataWithBytes:(const void*)"\0\0\0\0" length:4];
    }
    return [K1_EXIT_F addrToBytes:self.addr];
}

- (NSData *)Ip_K1 {
    if (!self.nat || self.nat.length == 0) {
        return [NSData dataWithBytes:(const void*)"\0\0\0\0" length:4];
    }
    return [K1_EXIT_F ipToBytesK1:self.nat];
}

- (uint32_t)Id_u32 {
    return [K1_EXIT_F toUInt32:self.Id];
}

- (uint32_t)Ip_K1_u32 {
    return [K1_EXIT_F toUInt32:self.Ip_K1];
}

@end

#pragma mark - K1M_SPEED_START_INFO

@implementation K1M_SPEED_START_INFO

- (instancetype)init {
    self = [super init];
    if (self) {
        _blacklist = @[];
        _dns_rule_info = @[];
        _flow_id = @0;
        _vni_array = @[];
    }
    return self;
}

@end

#pragma mark - K1M_DNS_RULE

@implementation K1M_DNS_RULE

- (instancetype)init {
    self = [super init];
    if (self) {
        _domain = @[];
        _server = @"";
        _traffic_id = @0;
    }
    return self;
}

@end

#pragma mark - K1_EXIT_F

@implementation K1_EXIT_F

+ (NSData *)addrToBytes:(NSString *)addr {
    if (!addr || [addr isKindOfClass:[NSNull class]] || addr.length == 0) {
        return [NSData dataWithBytes:(const void*)"\0\0\0\0" length:4];
    }

    NSArray *components = [addr componentsSeparatedByString:@"-"];
    if ([components count] != 2) {
        NSLog(@"Invalid format for addr: %@", addr);
        return [NSData dataWithBytes:(const void*)"\0\0\0\0" length:4];
    }

    NSInteger netNum = [components[0] integerValue];
    NSInteger devNum = [components[1] integerValue];

    uint32_t result = ((uint32_t)netNum << 16) | (uint32_t)devNum;

    //转换为小端模式
    uint8_t bytes[4];
    bytes[0] = (result >> 0) & 0xFF;  // LSB
    bytes[1] = (result >> 8) & 0xFF;
    bytes[2] = (result >> 16) & 0xFF;
    bytes[3] = (result >> 24) & 0xFF; // MSB

    return [NSData dataWithBytes:bytes length:4];
}

+ (NSData *)ipToBytesK1:(NSString *)ipAddress {
    uint8_t bytes[4] = {0}; // 初始化为 0.0.0.0

    if (!ipAddress || [ipAddress isKindOfClass:[NSNull class]] || ipAddress.length == 0) {
        return [NSData dataWithBytes:bytes length:4];
    }

    struct in_addr addr;
    if (inet_pton(AF_INET, [ipAddress UTF8String], &addr) == 1) {
        // 成功解析 IPv4
        uint32_t ipAsUInt = ntohl(addr.s_addr); // 转为主机序 uint32_t

        // 拆分为字节，并按反序排列：[3][2][1][0]
        bytes[0] = (ipAsUInt >> 0) & 0xFF;  // 最低字节（原第3位）
        bytes[1] = (ipAsUInt >> 8) & 0xFF;
        bytes[2] = (ipAsUInt >> 16) & 0xFF;
        bytes[3] = (ipAsUInt >> 24) & 0xFF; // 最高字节（原第0位）
    } else {
        NSLog(@"Invalid IP address: %@", ipAddress);
    }

    return [NSData dataWithBytes:bytes length:4];
}

+ (uint32_t)toUInt32:(NSData *)data {
    return [self toUInt32:data atOffset:0];
}

+ (uint32_t)toUInt32:(NSData *)data atOffset:(NSUInteger)offset
{
    if (!data || [data length] < offset + 4) {
            return 0;
        }
        const uint8_t *bytes = (const uint8_t *)[data bytes];
        
        return ((uint32_t)bytes[offset + 0]) |
               ((uint32_t)bytes[offset + 1] << 8) |
               ((uint32_t)bytes[offset + 2] << 16) |
               ((uint32_t)bytes[offset + 3] << 24);
}
@end
