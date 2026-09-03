//
//  Headers.h
//  9
//
//  Created by Blankwonder on 8/9/25.
//  Copyright © 2025 Yach. All rights reserved.
//

#ifndef Headers_h
#define Headers_h

#define TCP_MTU (1400)

#define K1_HeartBeatInteval (2)

#define Default_ServerAddress @"gnwj-server"

#define BundleIdentifier_Tunnel @"com.guangnianjissu.ios.GnwjNetTunnel"

#define Identifier_AppGroup @"group.com.guangnianjissu.ios"
#define kAppGroupIdentifier @"group.com.guangnianjissu.ios"

#define DNS_8888 @"8.8.8.8"
#define DNS_86 @"114.114.114.114"

#define Path_Key @"Path_Key_Json"
#define Rule_Key @"Rule_Key_Json"

/// 加速路由画像：随 startVPNTunnel options / providerConfiguration / 规则 JSON 下发
/// 取值见 AccelRouteModeAbroad / AccelRouteModeChina
/// 解析优先级：规则 JSON(accel_route_mode) > options(Accel_Route_Mode) > 默认 abroad
#define Accel_Route_Mode_Key @"Accel_Route_Mode"

/// 国内加速国外：全隧道 + 排除私网 + 排除国内 CIDR
#define AccelRouteModeAbroad @"abroad"
/// 国外加速国内：仅纳入国内 CIDR + 排除私网（无 default 全收）
#define AccelRouteModeChina  @"china"

/// 规则 JSON 内可选字段，与 Accel_Route_Mode_Key 同义
#define Accel_Route_Mode_JSON_Key @"accel_route_mode"

#define V_Description @"GNWJ_A"

/// 启动加速等待超时（秒）。都是上限，连上/授权完成即返回，不会空等到满。
/// 配置阶段：save/load、首次系统「允许 VPN」对话框。首次授权后通常 1～2 秒结束。
#define VPN_Start_Config_Timeout_Sec        60.0
/// 已调用 startVPNTunnel 之后等到 Connected。须大于「选路超时 + DEBUG attach」。
#define VPN_Start_Connected_Timeout_Sec     35.0
/// Extension 选路 Ready 最长等待。宿主 Connected 超时必须大于此值。
#define VPN_Start_Path_Resolve_Timeout_Sec  20.0
#ifdef DEBUG
#define VPN_Start_Debug_Attach_Sec          5.0
#else
#define VPN_Start_Debug_Attach_Sec          0.0
#endif

#define TunnelTrafficCMD @"TunnelTrafficCMD"

#define China_IPFilePath [[[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:kAppGroupIdentifier].path stringByAppendingPathComponent:@"china_ip.txt"]

#define area_isp_Path [[[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:Identifier_AppGroup].path stringByAppendingPathComponent:@"area_isp.data"]

//是否启用日志 1:启用 0:关闭
#define LOG_OPEN  (1)

#endif /* Headers_h */
