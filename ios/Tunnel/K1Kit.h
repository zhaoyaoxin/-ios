//
//  RuleKit.h
//  RuleKit
//
//  Created by ZL on 25/09/2025.
//  Copyright © 2025 ZL. All rights reserved.
//

// In this header, you should import all the public headers of your framework using statements like #import <RuleKit/PublicHeader.h>

#import "LogSetting.h"
#import "K1API.h"

#pragma mark - enums

typedef NS_ENUM(NSInteger, N2K1_ACCOUNT_STATUS)
{
    N2K1_ACCOUNT_STATUS_OK = 0,
    N2K1_ACCOUNT_STATUS_NO_PHONE = 1,
    N2K1_ACCOUNT_STATUS_NO_ALIPAY = 2,
    N2K1_ACCOUNT_STATUS_NO_ALL = 3,
};

#define N2K1_ALI_SIGN_TYPE_RSA    @"RSA"

typedef NS_ENUM(NSInteger, N2K1_BLACK_LIST_TYPE)
{
    N2K1_BLACK_LIST_TYPE_CHINA = 1,
    N2K1_BLACK_LIST_TYPE_OVERSEA = 2,
};

typedef NS_ENUM(NSInteger, N2K1_BOOL)
{
    N2K1_BOOL_YES = 1,
    N2K1_BOOL_NO = 2,
};

typedef NS_ENUM(NSInteger, N2K1_DNS_RULE_ID)
{
    N2K1_DNS_RULE_ID_VALUE = -1,
};

typedef NS_ENUM(NSInteger, N2K1_FLOW_LEVEL)
{
    N2K1_FLOW_LEVEL_LOW = 1,
    N2K1_FLOW_LEVEL_HIGH = 2,
};

#define N2K1_IP_TYPE_INT    @"int"
#define N2K1_IP_TYPE_SUBNET    @"subnet"
#define N2K1_IP_TYPE_RANGENET    @"rangenet"

#define N2K1_LANGUAGE_ZH_CN    @"zh-CN"
#define N2K1_LANGUAGE_EN    @"en"

#define N2K1_PLATFORM_IOS    @"IOS"
#define N2K1_PLATFORM_OSX    @"OSX"
#define N2K1_PLATFORM_ROUTER    @"ROUTER"
#define N2K1_PLATFORM_ANDROID    @"ANDROID"
#define N2K1_PLATFORM_MAS    @"OSX-MAS"
#define N2K1_PLATFORM_WINDOWS    @"WINDOWS"

typedef NS_ENUM(NSInteger, N2K1_PRODUCT_TYPE)
{
    N2K1_PRODUCT_TYPE_NORMAL = 1,
    N2K1_PRODUCT_TYPE_PRO = 2,
};

typedef NS_ENUM(NSInteger, N2K1_PROXY_MODE)
{
    N2K1_PROXY_MODE_L2 = 2,
    N2K1_PROXY_MODE_K1 = 3,
};

typedef NS_ENUM(NSInteger, N2K1_REGION_CODE)
{
    N2K1_REGION_CODE_CHINA = 1,
    N2K1_REGION_CODE_OTHER = 2,
};

typedef NS_ENUM(NSInteger, N2K1_RULE_TYPE)
{
    N2K1_RULE_TYPE_WINDOWS = 1,
    N2K1_RULE_TYPE_MAS = 2,
};

#define N2K1_SYS_PLAT_ROUTER    @"router"
#define N2K1_SYS_PLAT_MOBILE    @"mobile"
#define N2K1_SYS_PLAT_PC    @"pc"

#define N2K1_THIRD_LOGIN_PROVIDER_ALIPAY    @"Alipay"

#define N2K1_VERIFY_TYPE_REGISTER    @"REGISTER"
#define N2K1_VERIFY_TYPE_RESET_PASSWORD    @"RESET_PASSWORD"
#define N2K1_VERIFY_TYPE_FIRST_LOGIN    @"FIRST_LOGIN"

#pragma mark - models

@class N2K1_ENTRANCE;
@class N2K1_TRAFFIC_RULE;
@class N2K1_EXIT;
@class N2K1_SPEED_START_INFO;
@class N2K1_REPORT;
@class N2K1_USER_INFO;
@class N2K1_DNS_RULE;

@interface N2K1_ENTRANCE
@property (nonatomic, strong) NSString *            ip;
@property (nonatomic, strong) NSArray *                ports;
@end

@interface N2K1_TRAFFIC_RULE
@property (nonatomic, strong) NSArray *                destination_area_id;
@property (nonatomic, strong) NSArray *                destination_ip_domain;
@property (nonatomic, strong) NSArray *                destination_isp_id;
@property (nonatomic, strong) NSArray * /* N2K1_EXIT * */     exits;
@property (nonatomic, strong) NSNumber *            id;
@property (nonatomic, strong) NSArray *                port;
@property (nonatomic, strong) NSArray *                process;
@property (nonatomic, strong) NSArray *                protocol;
@property (nonatomic, strong) NSNumber *            traffic_id;
@property (nonatomic, strong) NSNumber *            traffic_level;
@end

@interface N2K1_EXIT
@property (nonatomic, strong) NSString *            addr;
@property (nonatomic, strong) NSString *            nat;
@end

@interface N2K1_SPEED_START_INFO
@property (nonatomic, strong) NSArray * /* N2K1_TRAFFIC_RULE * */     blacklist;
@property (nonatomic, strong) NSArray * /* N2K1_DNS_RULE * */     dns_rule_info;
@property (nonatomic, strong) NSArray * /* N2K1_EXIT * */     dns_rule_exits;
@property (nonatomic, strong) NSNumber *            dns_rule_traffic_level;
@property (nonatomic, strong) NSNumber *            down_stream_limit;
@property (nonatomic, strong) NSArray * /* N2K1_ENTRANCE * */     entrance;
@property (nonatomic, strong) NSNumber *            flow_id;
@property (nonatomic, strong) NSArray * /* N2K1_TRAFFIC_RULE * */     rules;
@property (nonatomic, strong) NSNumber *            up_stream_limit;
@end

@interface N2K1_REPORT
@property (nonatomic, strong) NSNumber *            down_traffic;
@property (nonatomic, strong) NSNumber *            flow_id;
@property (nonatomic, strong) NSString *            mac;
@property (nonatomic, strong) NSNumber *            uid;
@property (nonatomic, strong) NSNumber *            up_traffic;
@end

@interface N2K1_USER_INFO
@property (nonatomic, strong) NSNumber * /* N2K1_ACCOUNT_STATUS */        account_status;
@property (nonatomic, strong) NSNumber *            country_code;
@property (nonatomic, strong) NSString *            email;
@property (nonatomic, strong) NSString *            expire_date;
@property (nonatomic, strong) NSNumber *            expired;
@property (nonatomic, strong) NSString *            feedback;
@property (nonatomic, strong) NSNumber *            flow_size;
@property (nonatomic, strong) NSString *            nick_name;
@property (nonatomic, strong) NSString *            package_name;
@property (nonatomic, strong) NSNumber *            package_size;
@property (nonatomic, strong) NSString *            phone_number;
@property (nonatomic, strong) NSNumber * /* N2K1_PRODUCT_TYPE */        product_id;
@property (nonatomic, strong) NSNumber * /* N2K1_REGION_CODE */        region;
@property (nonatomic, strong) NSNumber *            rest_traffic;
@property (nonatomic, strong) NSNumber * /* N2K1_BOOL */        share_open;
@property (nonatomic, strong) NSString *            share_text;
@property (nonatomic, strong) NSString *            share_tips;
@property (nonatomic, strong) NSString *            share_tips_url;
@property (nonatomic, strong) NSNumber *            uid;
@property (nonatomic, strong) NSString *            username;
@end

@interface N2K1_DNS_RULE 
@property (nonatomic, strong) NSArray *                destination_domain;
@property (nonatomic, strong) NSString *            dns_server;
@property (nonatomic, strong) NSNumber *            traffic_id;
@end


