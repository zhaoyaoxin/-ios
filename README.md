# LottieLite iOS

一个精简的 React Native iOS 工程。首页 UI 已清空，可直接从 `App.tsx` 开始重新设计；Lottie 动画资源和安全 HTTPS 请求封装仍保留在项目中。

## 当前保留

- 深色空白应用画布，不包含首页内容或预设菜单界面
- 无内容侧边抽屉容器：保留滑入/滑出、遮罩关闭和安全区，可自行传入内容
- 首页左侧 24pt 隐形手势区：向右滑动即可打开空抽屉
- 两阶段启动流程：原生与 React 启动页无缝衔接，当前 Mock 3 秒后才进入首页
- 启动页品牌图按设计稿 143 × 20、距底部 110 放置，并随设备等比适配
- 375 × 812 设计稿适配工具：横纵位置分别缩放，图片和字号保持等比缩放
- 业务页面统一使用设计值 20 的内容边距；无底部导航的页面显示居中标题和返回按钮
- 首页头部左侧菜单按钮打开抽屉，右侧预留客服按钮，两者水平分布在页面两边
- 首页顶部按钮下方 26 展示 36 高的半透明渐变公告条
- 当前页面图标统一由 iOS Asset Catalog 编译管理，优先保证 iOS 加载稳定性
- 初始化成功后挂载首页；点击 JSON 动画会发送 3 秒 Mock 加速请求并从 0 平滑提速到 1，再次点击会发送停止请求并平滑减速到 0
- 首页底部导航：会员、突出 23 的 60 × 60 加速按钮及可配置文字、我的
- 会员和我的导航已接入独立空白页面，二级页面不展示底部导航栏
- 本地 Lottie JSON 动画资源
- HTTPS 请求封装：协议校验、10 秒超时和请求取消
- iOS ATS：禁止任意 HTTP 加载，无定位等无关权限声明
- 已安装 Lottie 和安全区依赖，方便新界面直接使用

## 环境

- Node.js 22.13 或更高版本
- Xcode 26（较旧的兼容版本也可按 React Native 官方要求使用）
- CocoaPods

## 首次运行

```bash
npm install
cd ios
pod install
cd ..
npm run ios
```

默认命令会明确启动 `iPhone 17 Pro` 模拟器，避免电脑连接真机时 React Native CLI 同时尝试真机构建并触发签名错误。

也可以用 Xcode 打开 `ios/LottieLite.xcworkspace`，选择模拟器后运行。

VPN 加速需要在 iPhone 真机测试。模拟器无法通过系统 `nehelper` 保存 VPN 配置，会返回 `NEVPNErrorDomain Code=5: IPC failed`。点击启动加速会先请求 `/startup`，模拟器或原生模块不可用均不会拦截该 HTTPS 请求；成功取得会话后若本机无法启动，则提示原因并调用 `/stop` 回滚会话。服务端业务错误按原有流程展示。修改原生桥接后需重新编译安装，仅刷新 Metro 不会更新原生能力标识。

真机运行时，在 Xcode 为 `LottieLite` 和 `GnwjNetTunnel` 两个 target 选择同一开发团队，确认签名包含 Network Extensions 的 Packet Tunnel 和共享 App Group 权限。当前主应用标识为 `com.guangnianjissu.ios`，扩展为 `com.guangnianjissu.ios.GnwjNetTunnel`，共享组为 `group.com.guangnianjissu.ios`（另有日志共享组 `group.com.guangnianjissu.logs`）；若替换标识，需同步修改两端 entitlement 和 `ios/Shared/Headers.h` 中的常量。首次加速时允许系统添加 VPN 配置。

## 常用检查

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
```

## 添加启动操作

在 `src/startup/startupTasks.ts` 的 `appStartupTasks` 数组中添加任务。任务会按顺序执行，全部成功后才进入首页：

```ts
{
  id: 'restore-session',
  label: '正在恢复登录状态…',
  run: async ({signal}) => {
    // 在这里恢复登录、加载远程配置或初始化数据库。
    // 网络请求请把 signal 继续传给请求函数，以支持启动取消。
  },
}
```

启动页当前至少展示 3 秒。以后加入 HTTP 请求后，只有“3 秒计时”和“全部请求”都完成才会进入首页；请求失败会停留在启动页并显示“重新尝试”。

## 代码位置

- `App.tsx`：空白应用入口，从这里开始写新首页
- `src/components/SideDrawer.tsx`：包含用户头部、横幅和数据驱动列表的侧边抽屉容器
- `src/components/BottomNavigationBar.tsx`：首页最高层级的底部导航容器
- `src/components/CommonPage.tsx`：通用二级页面容器，包含渐变背景、返回按钮、居中标题、安全区和内容插槽
- `src/screens/LaunchGateScreen.tsx`：React 启动页及初始化失败重试界面
- `src/screens/StartupScreen.tsx`：首页常驻 Lottie JSON 动画
- `src/screens/SecondaryPageScreen.tsx`：会员页和我的页的空白容器及右滑返回手势
- `src/startup/startupTasks.ts`：按顺序执行登录恢复、配置加载等启动任务
- `src/utils/designScale.ts`：统一的 375 × 812 设计尺寸换算
- `src/services/httpsClient.ts`：只允许 HTTPS 的请求封装
- `src/api/types.ts`：由接口文档整理的请求与响应 TypeScript 类型
- `src/api/client.ts`：React Native API 客户端，统一处理环境、Token、设备头和请求取消
- `assets/main-animation.json`：内置 Lottie 资源

## API 客户端示例

```ts
import { GnjiasuApiClient } from './src/api';

const api = new GnjiasuApiClient({
  environment: __DEV__ ? 'development' : 'production',
  version: '1.0.0',
  token: '登录后的 token',
});

const controller = new AbortController();
const result = await api.startAcceleration(
  { gid: 100 },
  { signal: controller.signal },
);
```

App 首次安装启动时会生成一个本地安装标识并保存到 iOS UserDefaults。接口字段虽然名为 `mac`，但不会读取设备真实 MAC；`GnjiasuApiClient` 会自动读取并填入该字段。
