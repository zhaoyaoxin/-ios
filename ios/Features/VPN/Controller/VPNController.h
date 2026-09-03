#import <dispatch/dispatch.h>

#ifndef VPNController_h
#define VPNController_h

#ifdef __OBJC__
#import <Foundation/Foundation.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

/// 预热：初始化队列/状态，不保证 preferences 已写完。
/// 返回值：0 = 已受理；<0 = 失败。
extern int GN_LoadSys(int Mode);

/// 启动加速。参数不变。
/// 规则 JSON 可选字段 accel_route_mode:
///   "abroad"(默认)/1 = 国内加速国外（全隧道+排除国内CIDR）
///   "china"/2        = 国外加速国内（仅纳入国内CIDR）
/// 即使系统已是 Connected，也会写入本次 Path/Rule 并重启隧道。
/// 返回值：0 = 已受理（须等 GN_WaitForConnected）；
///        <0 = 同步失败（非法参数等）。
extern int GN_Start(const char* JsonPathResult, const char* JsonGamesRules);

/// 停止加速。取消未完成的启动等待。进程内无 manager 时会从 preferences 加载再停。
/// 返回值：0 = 已请求断开；<0 = 未初始化。
extern int GN_Stop(int Mode);

/// 系统 VPN 是否已 Connected（只读，不启动隧道）。
extern bool GN_StartOK(void);

extern bool GN_GetTrafficInfo(uint64_t* pSendBytes, uint64_t* pReceiveBytes);
extern const char* GN_GetSpeedInfo(int Mode);

#ifdef __cplusplus
}
#endif

#ifdef __OBJC__
typedef void (^GNVPNWaitCompletion)(BOOL connected, NSString * _Nullable errorMessage);
#ifdef __cplusplus
extern "C" {
#endif
/// 等到本次启动真正 Connected，或失败/超时。须在 GN_Start 返回 0 之后调用。
/// 不以调用瞬间的系统 Connected 作为成功（避免沿用旧隧道）。
/// timeoutSeconds <= 0 时使用 VPN_Start_Connected_Timeout_Sec（Headers.h）。
/// 配置/系统授权阶段单独使用 VPN_Start_Config_Timeout_Sec，与 Connected 超时互不影响。
/// 注意：必须置于 extern "C" 内 —— 定义在 VPNController.mm，调用方含纯 ObjC 的
/// GnwjBridgeHandler.m，不加会因 C++ 名字修饰导致链接期符号找不到。
void GN_WaitForConnected(NSTimeInterval timeoutSeconds, GNVPNWaitCompletion completion);
#ifdef __cplusplus
}
#endif
#endif

#endif /* VPNController_h */
