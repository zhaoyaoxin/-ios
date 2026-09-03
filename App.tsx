import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  PanResponder,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  BoostMode,
  BottomNavigationBar,
} from './src/components/BottomNavigationBar';
import { LanguageBottomSheet } from './src/components/LanguageBottomSheet';
import { SideDrawer } from './src/components/SideDrawer';
import { RedeemCodeBottomSheet } from './src/components/RedeemCodeBottomSheet';
import { useI18n } from './src/i18n';
import { AccountSecurityScreen } from './src/screens/AccountSecurityScreen';
import { BindAccountScreen } from './src/screens/BindAccountScreen';
import { LaunchGateScreen } from './src/screens/LaunchGateScreen';
import { GameSelectionScreen } from './src/screens/GameSelectionScreen';
import { HelpSupportScreen } from './src/screens/HelpSupportScreen';
import { InAppWebViewScreen } from './src/screens/InAppWebViewScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MembershipPurchaseScreen } from './src/screens/MembershipPurchaseScreen';
import { OrderRecordsScreen } from './src/screens/OrderRecordsScreen';
import { PasswordSettingsScreen } from './src/screens/PasswordSettingsScreen';
import { SecondaryPageScreen } from './src/screens/SecondaryPageScreen';
import { HomeAnimationScreen } from './src/screens/StartupScreen';
import { runStartupTasks } from './src/startup/startupTasks';
import { clearAuthToken, getAuthToken } from './src/services/authTokenStorage';
import { clearAuthUser } from './src/services/authUserStorage';
import { HttpsRequestError } from './src/services/httpsClient';
import { forceStopAcceleration } from './src/services/accelerationService';
import {
  startHeartbeat,
  stopHeartbeat,
} from './src/services/heartbeatService';
import { filterGamesByMode, loadIosGames } from './src/services/gameService';
import {
  getSelectedGameId,
  resolveSelectedGame,
  saveSelectedGameId,
} from './src/services/selectedGameStorage';
import { redeemPasscode } from './src/services/redeemCodeService';
import {
  bindCurrentEmail,
  bindCurrentPhone,
  changeCurrentProductType,
  loadClientInitialization,
  loadCurrentAuthUser,
  loadOrderPage,
  loginWithPassword,
  loginWithVerificationCode,
  resetCurrentPasswordByEmail,
  restoreCurrentAuthUser,
  sendEmailBindingCode,
  sendPhoneBindingCode,
  sendVerificationCode,
  setCurrentUserPassword,
  toggleCurrentProductPause,
} from './src/services/verificationAuthService';
import { requestTencentCaptchaTicket } from './src/services/tencentCaptchaService';
import { useDesignScale } from './src/utils/designScale';
import { useAuthStore } from './src/store/authStore';
import { useClientStore } from './src/store/clientStore';
import { PRIVACY_AGREEMENT_URL } from './src/config/links';
import type { IosGame } from './src/api/types';

type MainRoute =
  | 'home'
  | 'membership'
  | 'profile'
  | 'login'
  | 'account-security'
  | 'bind-phone'
  | 'bind-email'
  | 'password-settings'
  | 'region-selection'
  | 'game-selection'
  | 'privacy-agreement'
  | 'purchase'
  | 'order-records'
  | 'help-support';
type AccelerationMode = Exclude<BoostMode, 'switch'>;

const DRAWER_ITEMS = [
  { id: 'account-security', title: '账号与安全' },
  { id: 'language', title: '语言设置' },
  { id: 'accelerator-app', title: '加速 APP' },
  { id: 'orders', title: '订单记录' },
  { id: 'faq', title: '常见问题' },
  { id: 'support', title: '联系客服' },
  { id: 'about', title: '关于光年' },
  { id: 'redeem-code', title: '兑换码' },
] as const;

type HomeShellProps = {
  active: boolean;
  onNavigate: (route: Exclude<MainRoute, 'home'>) => void;
  /** 心跳收到下线指令时递增，用于强制掐断正在进行的加速。 */
  stopAccelerationRequest?: number;
  /** 已选游戏名，展示在首页横幅上。 */
  selectedGameName?: string;
  /** 已选游戏 id，作为启动加速的 gid。 */
  selectedGameId?: number | null;
  /** 加速模式由 MainFlow 持有：默认选中项依赖它。 */
  accelerationMode: AccelerationMode;
  onModeChange: (mode: AccelerationMode) => void;
};

function HomeShell({
  active,
  onNavigate,
  stopAccelerationRequest = 0,
  selectedGameName,
  selectedGameId = null,
  accelerationMode,
  onModeChange,
}: HomeShellProps) {
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [floatingCardsOpen, setFloatingCardsOpen] = useState(false);
  // 地区选择页完成后只需更新该状态，首页横条会同步展示所选地区名称。
  const [selectedRegionName] = useState('中国香港');
  const [closeCardsRequest, setCloseCardsRequest] = useState(0);
  const [openCardsRequest, setOpenCardsRequest] = useState(0);
  const [redeemSheetOpen, setRedeemSheetOpen] = useState(false);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const design = useDesignScale();
  const clearUser = useAuthStore(state => state.clearUser);

  // 每个抽屉 item 保留独立事件；账号与安全项进入对应页面。
  const drawerItems = useMemo(
    () =>
      DRAWER_ITEMS.map(item => ({
        ...item,
        title: t(item.title),
        onPress:
          item.id === 'account-security'
            ? () => onNavigate('account-security')
            : item.id === 'language'
            ? () => setLanguageSheetOpen(true)
            : item.id === 'redeem-code'
            ? () => setRedeemSheetOpen(true)
            : item.id === 'orders'
            ? () => onNavigate('order-records')
            : item.id === 'faq' || item.id === 'support'
            ? () => onNavigate('help-support')
            : undefined,
      })),
    [onNavigate, t],
  );

  const handleModeChange = useCallback(
    (mode: AccelerationMode) => {
      onModeChange(mode);
      // 选完模式顺手收起卡片；StartupScreen 只在卡片可见时才播收起动画。
      setCloseCardsRequest(value => value + 1);
    },
    [onModeChange],
  );

  // 创建左侧边缘右滑手势。useMemo 保证设备尺寸不变时复用同一个
  // PanResponder，避免组件每次渲染都重新创建手势对象。
  const edgeGesture = useMemo(
    () =>
      PanResponder.create({
        // 横向右滑超过设计值 8，同时纵向偏移小于设计值 18 时接管手势。
        // 纵向限制可以避免用户上下滚动时误触发侧边抽屉。
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx > design.size(8) && Math.abs(gesture.dy) < design.size(18),
        onPanResponderRelease: (_, gesture) => {
          // 松手时满足以下任一条件便打开抽屉：
          // 1. 向右滑动距离超过设计值 42；2. 向右快速甩动，速度超过 0.5。
          if (gesture.dx > design.size(42) || gesture.vx > 0.5) {
            setDrawerOpen(true);
          }
        },
        // 允许系统或其他更高优先级的手势中途接管当前触摸事件。
        onPanResponderTerminationRequest: () => true,
      }),
    // 设备尺寸变化时 design 会更新，此时重新计算适配后的手势阈值。
    [design],
  );

  return (
    <View testID="app-home" style={styles.root}>
      <HomeAnimationScreen
        closeCardsRequest={closeCardsRequest}
        onCardsVisibilityChange={setFloatingCardsOpen}
        onModeChange={handleModeChange}
        onMenuPress={() => setDrawerOpen(true)}
        onSupportPress={() => onNavigate('help-support')}
        onPurchasePress={() => onNavigate('purchase')}
        onEnablePausableTime={async () => {
          const user = await toggleCurrentProductPause('enable');
          useAuthStore.getState().setUser(user);
        }}
        onChangeToOverseasMembership={async () => {
          const user = await changeCurrentProductType(4);
          useAuthStore.getState().setUser(user);
        }}
        onRegionPress={() => onNavigate('region-selection')}
        onGamePress={() => onNavigate('game-selection')}
        openCardsRequest={openCardsRequest}
        stopAccelerationRequest={stopAccelerationRequest}
        selectedGameName={selectedGameName}
        selectedGameId={selectedGameId}
        selectedMode={accelerationMode}
        selectedRegionName={selectedRegionName}
      />
      <View
        {...edgeGesture.panHandlers}
        accessibilityLabel="从左向右滑动打开侧边抽屉"
        pointerEvents={drawerOpen ? 'none' : 'auto'}
        style={[styles.edgeGestureTarget, { width: design.width(24) }]}
        testID="drawer-edge-gesture"
      />
      <SideDrawer
        items={drawerItems}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onMembershipPress={() => {
          setDrawerOpen(false);
          onNavigate('purchase');
        }}
        onTogglePause={async action => {
          const user = await toggleCurrentProductPause(action);
          useAuthStore.getState().setUser(user);
        }}
        onLogout={() => {
          clearAuthToken();
          clearAuthUser();
          clearUser();
          setDrawerOpen(false);
          onNavigate('login');
        }}
      />
      <RedeemCodeBottomSheet
        onClose={() => setRedeemSheetOpen(false)}
        onSubmit={async code => {
          const user = await redeemPasscode(code, useAuthStore.getState().user);
          useAuthStore.getState().setUser(user);
        }}
        open={redeemSheetOpen}
      />
      <LanguageBottomSheet
        onClose={() => setLanguageSheetOpen(false)}
        open={languageSheetOpen}
      />
      {active ? (
        <BottomNavigationBar
          boostMode={floatingCardsOpen ? 'switch' : accelerationMode}
          onBoostPress={
            floatingCardsOpen
              ? () => setCloseCardsRequest(value => value + 1)
              : accelerationMode === 'game'
              ? () => setOpenCardsRequest(value => value + 1)
              : undefined
          }
          onMembershipPress={() => onNavigate('membership')}
          onProfilePress={() => onNavigate('profile')}
        />
      ) : null}
    </View>
  );
}

type MainFlowProps = {
  initialRoute: MainRoute;
};

function MainFlow({ initialRoute }: MainFlowProps) {
  const { t } = useI18n();
  const [route, setRoute] = useState<MainRoute>(initialRoute);
  const [detailBackRoute, setDetailBackRoute] = useState<MainRoute>('home');
  const [stopAccelerationRequest, setStopAccelerationRequest] = useState(0);
  const [selectedGame, setSelectedGame] = useState<IosGame | null>(null);
  const [games, setGames] = useState<IosGame[]>([]);
  const [accelerationMode, setAccelerationMode] =
    useState<AccelerationMode>('game');

  /** 当前模式对应的列表：游戏模式取非影音，影音模式取影音。 */
  const modeGames = useMemo(
    () => filterGamesByMode(games, accelerationMode),
    [games, accelerationMode],
  );

  /** 选择页用的加载器。必须是稳定引用：内联箭头会让子组件的加载 effect
   *  每次渲染重跑，进而 setGames 触发本组件重渲染，形成死循环。 */
  const loadGames = useCallback(async () => {
    const list = await loadIosGames();
    setGames(list);
    return list;
  }, []);

  const loadModeGames = useCallback(async () => {
    const list = await loadGames();
    return filterGamesByMode(list, accelerationMode);
  }, [loadGames, accelerationMode]);

  useEffect(() => {
    loadGames().catch(() => {
      // 首页不因游戏列表失败而阻塞。
    });
  }, [loadGames]);

  /**
   * 列表或模式变化时确定选中项：
   * 优先沿用该模式的本地记录，记录的 id 不在当前模式列表里则回退到第一个。
   */
  useEffect(() => {
    if (games.length === 0) {
      return;
    }
    setSelectedGame(current => {
      if (current && modeGames.some(game => game.id === current.id)) {
        return current;
      }
      const next = resolveSelectedGame(
        modeGames,
        getSelectedGameId(accelerationMode),
      );
      if (next) {
        saveSelectedGameId(accelerationMode, next.id);
      }
      return next;
    });
  }, [accelerationMode, games, modeGames]);
  const setUser = useAuthStore(state => state.setUser);
  const currentUser = useAuthStore(state => state.user);
  const isOverseas = useClientStore(
    state => state.initialization?.is_overseas === true,
  );
  const isLoggedIn = useAuthStore(state => state.user !== null);

  // useI18n 每次渲染都返回新的 t，放进依赖会让心跳每渲染重启一次。
  const translateRef = useRef(t);
  translateRef.current = t;

  // 心跳：登录后持续向服务端证明账号在本机存活，并接收下线指令。
  // MainFlow 只在启动流程就绪后挂载，因此这里等价于「登录成功且启动就绪」。
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    const translate = translateRef.current;

    const forceLogout = () => {
      clearAuthToken();
      clearAuthUser();
      useAuthStore.getState().clearUser();
      setRoute('login');
    };

    startHeartbeat({
      onOutcome: outcome => {
        switch (outcome.type) {
          case 'force-logout':
            // 本地已退出登录时静默收尾，避免主动退出后弹出「被强制下线」。
            if (!useAuthStore.getState().user) {
              return;
            }
            forceLogout();
            setStopAccelerationRequest(value => value + 1);
            void forceStopAcceleration();
            Alert.alert(translate('您已被强制下线'));
            return;
          case 'multi-device':
            // 多设备登录只清登录态，不打断正在进行的加速。
            forceLogout();
            Alert.alert(translate('账号已在其他设备登录'));
            return;
          case 'expired':
            setStopAccelerationRequest(value => value + 1);
            void forceStopAcceleration();
            Alert.alert(
              translate('加速服务已过期'),
              translate('请前往会员页充值'),
              [
                { text: translate('取消'), style: 'cancel' },
                {
                  text: translate('去充值'),
                  onPress: () => setRoute('purchase'),
                },
              ],
            );
            return;
          default:
            // ok 与 transient 都不动登录态，下一轮继续。
            return;
        }
      },
    });

    return stopHeartbeat;
  }, [isLoggedIn]);

  return (
    <View style={styles.root}>
      {/* 首页保持挂载，使加速计时和 Lottie 播放不会因进入二级页面而重置。 */}
      <HomeShell
        active={route === 'home'}
        onNavigate={nextRoute => {
          setDetailBackRoute('home');
          setRoute(nextRoute);
        }}
        stopAccelerationRequest={stopAccelerationRequest}
        selectedGameName={selectedGame?.name}
        selectedGameId={selectedGame?.id ?? null}
        accelerationMode={accelerationMode}
        onModeChange={setAccelerationMode}
      />

      {route === 'membership' ? (
        <View style={styles.secondaryPageOverlay}>
          <MembershipPurchaseScreen
            onBack={() => setRoute('home')}
            onPurchase={async () => {
              // TODO: 支付渠道尚未接入，此处代表「一次充值完成」。
              // 充值完毕后用 restoreProfile 拉回最新会员权益并同步到全局。
              const user = await restoreCurrentAuthUser();
              setUser(user);
            }}
            testID="membership-screen"
            title={t('会员')}
          />
        </View>
      ) : null}

      {route === 'region-selection' ? (
        <View style={styles.secondaryPageOverlay}>
          <SecondaryPageScreen
            onBack={() => setRoute('home')}
            testID="region-selection-screen"
            title={t('选择地区')}
          />
        </View>
      ) : null}

      {route === 'privacy-agreement' ? (
        <View style={styles.secondaryPageOverlay}>
          <InAppWebViewScreen
            onBack={() => setRoute(detailBackRoute)}
            testID="privacy-agreement-screen"
            title={t('服务与隐私条款')}
            url={PRIVACY_AGREEMENT_URL}
          />
        </View>
      ) : null}

      {route === 'game-selection' ? (
        <View style={styles.secondaryPageOverlay}>
          <GameSelectionScreen
            onBack={() => setRoute('home')}
            onLoadGames={loadModeGames}
            onSelect={game => {
              setSelectedGame(game);
              saveSelectedGameId(accelerationMode, game.id);
              setRoute('home');
            }}
            selectedGameId={selectedGame?.id ?? null}
            testID="game-selection-screen"
            title={t('选择游戏')}
          />
        </View>
      ) : null}

      {route === 'profile' ? (
        <View style={styles.secondaryPageOverlay}>
          <AccountSecurityScreen
            onBack={() => setRoute('home')}
            onItemPress={itemId => {
              if (itemId === 'phone' && !currentUser?.phone?.trim()) {
                setDetailBackRoute('profile');
                setRoute('bind-phone');
              } else if (itemId === 'email' && !currentUser?.email?.trim()) {
                setDetailBackRoute('profile');
                setRoute('bind-email');
              } else if (itemId === 'password') {
                setDetailBackRoute('profile');
                setRoute('password-settings');
              } else if (itemId === 'orders') {
                setDetailBackRoute('profile');
                setRoute('order-records');
              } else if (itemId === 'faq' || itemId === 'support') {
                setDetailBackRoute('profile');
                setRoute('help-support');
              }
            }}
            onMembershipPress={() => {
              setDetailBackRoute('profile');
              setRoute('purchase');
            }}
            onTogglePause={async action => {
              const user = await toggleCurrentProductPause(action);
              useAuthStore.getState().setUser(user);
            }}
            showAllMembershipCards
            testID="profile-screen"
            title={t('我的')}
          />
        </View>
      ) : null}

      {route === 'login' ? (
        <View style={styles.secondaryPageOverlay}>
          <LoginScreen
            initialVerificationMode={isOverseas}
            onBack={() => setRoute('home')}
            onPressAgreement={() => {
              setDetailBackRoute('login');
              setRoute('privacy-agreement');
            }}
            onCodeLogin={async ({ account, code, registration }) => {
              const loginData = await loginWithVerificationCode(
                account,
                code,
                undefined,
                { registration },
              );
              setUser(loginData.user);
              if (!loginData.is_new) {
                setRoute('home');
              }
              return { isNew: loginData.is_new };
            }}
            onLogin={async ({ username, password }) => {
              const loginData = await loginWithPassword(username, password);
              setUser(loginData.user);
              setRoute('home');
            }}
            onSendCode={sendVerificationCode}
            onSetPassword={async password => {
              await setCurrentUserPassword(password);
              setRoute('home');
            }}
          />
        </View>
      ) : null}

      {route === 'account-security' ? (
        <View style={styles.secondaryPageOverlay}>
          <AccountSecurityScreen
            onBack={() => setRoute('home')}
            onItemPress={itemId => {
              if (itemId === 'phone' && !currentUser?.phone?.trim()) {
                setDetailBackRoute('account-security');
                setRoute('bind-phone');
              } else if (itemId === 'email' && !currentUser?.email?.trim()) {
                setDetailBackRoute('account-security');
                setRoute('bind-email');
              } else if (itemId === 'password') {
                setDetailBackRoute('account-security');
                setRoute('password-settings');
              } else if (itemId === 'orders') {
                setDetailBackRoute('account-security');
                setRoute('order-records');
              } else if (itemId === 'faq' || itemId === 'support') {
                setDetailBackRoute('account-security');
                setRoute('help-support');
              }
            }}
            onMembershipPress={() => {
              setDetailBackRoute('account-security');
              setRoute('purchase');
            }}
            onTogglePause={async action => {
              const user = await toggleCurrentProductPause(action);
              useAuthStore.getState().setUser(user);
            }}
          />
        </View>
      ) : null}

      {route === 'purchase' ? (
        <View style={styles.secondaryPageOverlay}>
          <MembershipPurchaseScreen
            onBack={() => setRoute(detailBackRoute)}
            onPurchase={async () => {
              // TODO: 支付渠道尚未接入，此处代表「一次充值完成」。
              // 充值完毕后用 restoreProfile 拉回最新会员权益并同步到全局。
              const user = await restoreCurrentAuthUser();
              setUser(user);
            }}
            testID="purchase-screen"
            title={t('购买会员')}
          />
        </View>
      ) : null}

      {route === 'bind-phone' || route === 'bind-email' ? (
        <View style={styles.secondaryPageOverlay}>
          <BindAccountScreen
            mode={route === 'bind-phone' ? 'phone' : 'email'}
            onBack={() => setRoute(detailBackRoute)}
            onRequestPhoneTicket={requestTencentCaptchaTicket}
            onSendEmailCode={sendEmailBindingCode}
            onSendPhoneCode={sendPhoneBindingCode}
            onSubmitEmail={async (email, code, password) => {
              const user = await bindCurrentEmail(email, code, password);
              setUser(user);
              setRoute(detailBackRoute);
            }}
            onSubmitPhone={async (phone, code) => {
              const user = await bindCurrentPhone(phone, code);
              setUser(user);
              setRoute(detailBackRoute);
            }}
          />
        </View>
      ) : null}

      {route === 'password-settings' ? (
        <View style={styles.secondaryPageOverlay}>
          <PasswordSettingsScreen
            onBack={() => setRoute(detailBackRoute)}
            onRequestPhoneTicket={requestTencentCaptchaTicket}
            onSendEmailCode={sendEmailBindingCode}
            onSendPhoneCode={sendPhoneBindingCode}
            onSubmitEmail={async (email, code, password) => {
              await resetCurrentPasswordByEmail(email, code, password);
              setRoute(detailBackRoute);
            }}
            onSubmitPhone={async password => {
              await setCurrentUserPassword(password);
              setRoute(detailBackRoute);
            }}
          />
        </View>
      ) : null}

      {route === 'order-records' ? (
        <View style={styles.secondaryPageOverlay}>
          <OrderRecordsScreen
            onBack={() => setRoute(detailBackRoute)}
            onLoadOrders={loadOrderPage}
          />
        </View>
      ) : null}

      {route === 'help-support' ? (
        <View style={styles.secondaryPageOverlay}>
          <HelpSupportScreen onBack={() => setRoute(detailBackRoute)} />
        </View>
      ) : null}
    </View>
  );
}

function AppFlow() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<MainRoute | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    setError(null);
    setReady(false);
    setInitialRoute(null);

    runStartupTasks({
      signal: controller.signal,
    })
      .then(async () => {
        if (!mounted) {
          return;
        }
        const token = getAuthToken();

        // 令牌失效（切换环境、服务端注销、过期）不该卡在启动闸门，
        // 按未登录处理并清掉本地凭证，让用户直接看到登录页。
        const loadUserOrSignOut = async () => {
          if (!token) {
            return null;
          }
          try {
            return await loadCurrentAuthUser(undefined, {
              signal: controller.signal,
            });
          } catch (reason) {
            if (
              reason instanceof HttpsRequestError &&
              reason.status === 401
            ) {
              clearAuthToken();
              clearAuthUser();
              return null;
            }
            throw reason;
          }
        };

        // 初始化配置与用户资料互不依赖，并行请求以减少启动等待时间。
        const [initialization, user] = await Promise.all([
          loadClientInitialization(undefined, {
            signal: controller.signal,
          }),
          loadUserOrSignOut(),
        ]);
        useClientStore.getState().setInitialization(initialization);
        if (user) {
          useAuthStore.getState().setUser(user);
        } else {
          useAuthStore.getState().clearUser();
        }
        if (!mounted) {
          return;
        }
        setInitialRoute(user ? 'home' : 'login');
        setReady(true);
      })
      .catch(reason => {
        if (!mounted || controller.signal.aborted) {
          return;
        }
        setError(reason instanceof Error ? reason.message : '未知启动错误');
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [attempt]);

  if (!ready || !initialRoute) {
    return (
      <LaunchGateScreen
        error={error}
        onRetry={() => setAttempt(value => value + 1)}
      />
    );
  }

  return <MainFlow initialRoute={initialRoute} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1F3037" />
      <AppFlow />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  edgeGestureTarget: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  secondaryPageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3000,
  },
});
