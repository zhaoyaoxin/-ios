import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnouncementBar } from '../components/AnnouncementBar';
import { ThemeAlertDialog } from '../components/ThemeAlertDialog';
import { useI18n } from '../i18n';
import {
  logAcceleration,
  startAcceleration,
  StartupBusinessError,
  stopAcceleration,
} from '../services/accelerationService';
import { useDesignScale } from '../utils/designScale';

const animationSource = require('../../assets/main-animation.json');
const mediaActionBarIconSource = require('../../assets/media-action-bar-icon.png');
const mediaActionBarArrowSource = require('../../assets/media-action-bar-arrow.png');
const gameActionBarIconSource = require('../../assets/game-action-bar-icon.png');
const gameActionBarSwitchSource = require('../../assets/game-action-bar-switch.png');
const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);
const SPEED_TRANSITION_DURATION_MS = 800;
const CARD_ENTER_DURATION_MS = 200;
const CARD_EXIT_DURATION_MS = 140;

type AccelerationState = 'idle' | 'starting' | 'running' | 'stopping';
export type AccelerationMode = 'game' | 'media';

type StartupErrorDialog = {
  code: -1 | -2 | -3 | -4 | -99;
  message: string;
};

const formatElapsedTime = (elapsedSeconds: number) => {
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
};

type HomeAnimationScreenProps = {
  closeCardsRequest?: number;
  openCardsRequest?: number;
  onCardsVisibilityChange?: (visible: boolean) => void;
  onModeChange?: (mode: AccelerationMode) => void;
  onMenuPress: () => void;
  onRegionPress?: () => void;
  /** 点击首页横幅进入游戏选择页。 */
  onGamePress?: () => void;
  onSupportPress?: () => void;
  onEnablePausableTime?: () => Promise<void>;
  onChangeToOverseasMembership?: () => Promise<void>;
  onPurchasePress?: () => void;
  selectedMode?: AccelerationMode;
  selectedRegionName?: string;
  /** 已选游戏名。未选择时横幅回退显示地区。 */
  selectedGameName?: string;
  /** 已选游戏 id，即启动加速接口需要的 gid。未选中时无法加速。 */
  selectedGameId?: number | null;
  /** 递增该值即强制掐断当前加速，用于心跳收到会员到期/强制下线指令时。 */
  stopAccelerationRequest?: number;
};

export function HomeAnimationScreen({
  closeCardsRequest = 0,
  openCardsRequest = 0,
  onCardsVisibilityChange,
  onModeChange,
  onMenuPress,
  onRegionPress,
  onGamePress,
  onSupportPress,
  onEnablePausableTime,
  onChangeToOverseasMembership,
  onPurchasePress,
  selectedMode = 'game',
  selectedRegionName = '中国香港',
  selectedGameName,
  selectedGameId = null,
  stopAccelerationRequest = 0,
}: HomeAnimationScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const lottieRef = useRef<LottieView>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const animationSpeed = useRef(new Animated.Value(0)).current;
  const lowerCardProgress = useRef(new Animated.Value(0)).current;
  const upperCardProgress = useRef(new Animated.Value(0)).current;
  const cardsAnimatingRef = useRef(false);
  const [accelerationState, setAccelerationState] =
    useState<AccelerationState>('idle');
  const [accelerationStartedAt, setAccelerationStartedAt] = useState<
    number | null
  >(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [startupErrorDialog, setStartupErrorDialog] =
    useState<StartupErrorDialog | null>(null);
  const startupDialogActionRef = useRef(false);

  useEffect(() => {
    if (accelerationStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }

    // 每次都用真实时间差计算，页面切换或 App 进入后台后计时也不会漂移。
    const updateElapsedTime = () => {
      setElapsedSeconds(
        Math.floor((Date.now() - accelerationStartedAt) / 1000),
      );
    };
    updateElapsedTime();
    const timer = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(timer);
  }, [accelerationStartedAt]);

  useEffect(
    () => () => {
      // 页面离开时同时终止 Mock/HTTPS 请求和速度动画，防止卸载后继续更新。
      requestControllerRef.current?.abort();
      animationSpeed.stopAnimation();
      lowerCardProgress.stopAnimation();
      upperCardProgress.stopAnimation();
    },
    [animationSpeed, lowerCardProgress, upperCardProgress],
  );

  const handleActionBarPress = useCallback(() => {
    // 卡片进出场期间忽略重复点击，避免两组序列动画相互覆盖。
    if (cardsAnimatingRef.current) {
      return;
    }
    cardsAnimatingRef.current = true;

    if (!cardsVisible) {
      setCardsVisible(true);
      onCardsVisibilityChange?.(true);
      lowerCardProgress.setValue(0);
      upperCardProgress.setValue(0);

      // 按需求先显示最下方卡片，再显示上方卡片。
      Animated.sequence([
        Animated.timing(lowerCardProgress, {
          toValue: 1,
          duration: CARD_ENTER_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.delay(50),
        Animated.timing(upperCardProgress, {
          toValue: 1,
          duration: CARD_ENTER_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        cardsAnimatingRef.current = false;
      });
      return;
    }

    // 收起时使用相反顺序，避免上方卡片越过下方卡片。
    Animated.sequence([
      Animated.timing(upperCardProgress, {
        toValue: 0,
        duration: CARD_EXIT_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.delay(40),
      Animated.timing(lowerCardProgress, {
        toValue: 0,
        duration: CARD_EXIT_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCardsVisible(false);
      onCardsVisibilityChange?.(false);
      cardsAnimatingRef.current = false;
    });
  }, [
    cardsVisible,
    lowerCardProgress,
    onCardsVisibilityChange,
    upperCardProgress,
  ]);

  const previousCloseRequestRef = useRef(closeCardsRequest);
  useEffect(() => {
    // 底部导航每次递增请求值时，复用横幅的卡片收起动画。
    if (closeCardsRequest !== previousCloseRequestRef.current && cardsVisible) {
      handleActionBarPress();
    }
    previousCloseRequestRef.current = closeCardsRequest;
  }, [cardsVisible, closeCardsRequest, handleActionBarPress]);

  const previousOpenRequestRef = useRef(openCardsRequest);
  useEffect(() => {
    // 游戏模式底部“模式选择”按钮递增请求值时，复用横幅的卡片展开动画。
    if (openCardsRequest !== previousOpenRequestRef.current && !cardsVisible) {
      handleActionBarPress();
    }
    previousOpenRequestRef.current = openCardsRequest;
  }, [cardsVisible, handleActionBarPress, openCardsRequest]);

  const changeAnimationSpeed = useCallback(
    (toValue: number) => {
      Animated.timing(animationSpeed, {
        toValue,
        duration: SPEED_TRANSITION_DURATION_MS,
        useNativeDriver: false,
      }).start();
    },
    [animationSpeed],
  );

  const previousStopRequestRef = useRef(stopAccelerationRequest);
  useEffect(() => {
    if (stopAccelerationRequest === previousStopRequestRef.current) {
      return;
    }
    previousStopRequestRef.current = stopAccelerationRequest;
    if (accelerationState === 'idle') {
      return;
    }
    // 服务端下线指令：直接掐断，不等待进行中的启动/停止请求回包。
    logAcceleration('首页：收到服务端强制停止指令');
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    changeAnimationSpeed(0);
    lottieRef.current?.pause();
    setAccelerationStartedAt(null);
    setAccelerationState('idle');
  }, [accelerationState, changeAnimationSpeed, stopAccelerationRequest]);

  const handleAnimationPress = useCallback(async () => {
    logAcceleration('首页按钮：点击', {
      accelerationState,
      selectedGameId,
    });
    // 请求执行期间忽略重复点击，避免启动和停止请求交叉覆盖状态。
    if (accelerationState === 'starting' || accelerationState === 'stopping') {
      logAcceleration('首页按钮：请求进行中，忽略重复点击');
      return;
    }

    // 没有选中游戏就拿不到 gid，服务端无法下发线路。
    if (accelerationState === 'idle' && selectedGameId === null) {
      logAcceleration('首页按钮：未选择游戏，取消启动');
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    logAcceleration('首页按钮：已创建本次请求控制器');

    try {
      if (accelerationState === 'idle') {
        logAcceleration('首页按钮：进入启动状态');
        setAccelerationState('starting');
        lottieRef.current?.play();
        changeAnimationSpeed(1);
        logAcceleration('首页按钮：动画开始播放，等待加速服务完成；暂不开始计时');
        await startAcceleration(controller.signal, selectedGameId!);
        // 只有服务端启动成功且原生 VPN 隧道连接成功后，才允许开始加速计时。
        setAccelerationStartedAt(Date.now());
        setAccelerationState('running');
        logAcceleration('首页按钮：启动成功，开始计时并切换为 running');
        return;
      }

      logAcceleration('首页按钮：进入停止状态');
      setAccelerationState('stopping');
      changeAnimationSpeed(0);
      logAcceleration('首页按钮：动画减速，等待停止服务完成');
      await stopAcceleration(controller.signal);
      lottieRef.current?.pause();
      setAccelerationStartedAt(null);
      setAccelerationState('idle');
      logAcceleration('首页按钮：停止成功，状态切换为 idle');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logAcceleration('首页按钮：请求已取消');
      } else {
        logAcceleration('首页按钮：加速操作失败，恢复稳定状态', {
          message: error instanceof Error ? error.message : String(error),
        });
        // 请求失败时回到操作前的稳定播放状态。
        const shouldKeepRunning = accelerationState === 'running';
        changeAnimationSpeed(shouldKeepRunning ? 1 : 0);
        if (!shouldKeepRunning) {
          // 启动未完成时失败：不能保留倒计时，也不应让动画继续停在播放态。
          setAccelerationStartedAt(null);
          lottieRef.current?.pause();
          logAcceleration('首页按钮：启动失败，未开始计时且动画已暂停');
          if (
            error instanceof StartupBusinessError &&
            [-1, -2, -3, -4, -99].includes(error.code)
          ) {
            setStartupErrorDialog({
              code: error.code as StartupErrorDialog['code'],
              message: error.message,
            });
            logAcceleration('首页按钮：已展示启动业务错误弹窗', {
              code: error.code,
            });
          } else {
            setStartupErrorDialog({
              code: -99,
              message:
                error instanceof Error ? error.message : '加速启动失败，请稍后重试',
            });
          }
        }
        setAccelerationState(shouldKeepRunning ? 'running' : 'idle');
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        logAcceleration('首页按钮：本次请求控制器已释放');
      }
    }
  }, [accelerationState, changeAnimationSpeed, selectedGameId]);

  /**
   * 重试只从用户点击弹窗确认进入：不会监听用户资料变化自动调用 startup，
   * 因此不会产生重复启动或渲染死循环。
   */
  const handleStartupErrorConfirm = useCallback(async () => {
    const dialog = startupErrorDialog;
    if (!dialog || startupDialogActionRef.current) {
      return;
    }
    startupDialogActionRef.current = true;
    setStartupErrorDialog(null);
    try {
      if (dialog.code === -1) {
        onPurchasePress?.();
        return;
      }
      if (dialog.code === -4) {
        onSupportPress?.();
        return;
      }
      if (dialog.code === -2) {
        await onEnablePausableTime?.();
        await handleAnimationPress();
        return;
      }
      if (dialog.code === -3) {
        await onChangeToOverseasMembership?.();
        await handleAnimationPress();
      }
      // -99 仅提示；确认后不执行后续动作。
    } catch (error) {
      logAcceleration('首页按钮：处理启动业务错误失败', {
        code: dialog.code,
        message: error instanceof Error ? error.message : String(error),
      });
      setStartupErrorDialog({
        code: -99,
        message: error instanceof Error ? error.message : '操作失败，请稍后重试',
      });
    } finally {
      startupDialogActionRef.current = false;
    }
  }, [
    handleAnimationPress,
    onChangeToOverseasMembership,
    onEnablePausableTime,
    onPurchasePress,
    onSupportPress,
    startupErrorDialog,
  ]);

  const isTransitioning =
    accelerationState === 'starting' || accelerationState === 'stopping';

  return (
    <ImageBackground
      resizeMode="cover"
      // 首页背景由 iOS Asset Catalog 解码和缓存，避免每次进入页面重复解析 JS 图片。
      source={{ uri: 'HomeBackground' }}
      style={styles.background}
    >
      {/* 背景图上覆盖半透明渐变，提升前景文字与按钮在复杂海报上的可读性。 */}
      <Image
        resizeMode="stretch"
        source={{ uri: 'HomeBackgroundOverlay' }}
        style={styles.backgroundOverlay}
      />
      <SafeAreaView
        style={[
          styles.root,
          {
            paddingHorizontal: design.width(20),
            paddingTop: design.height(20),
            paddingBottom: design.height(20),
          },
        ]}
        testID="home-animation-screen"
      >
        {/* 首页头部左右按钮共享同一行，并由页面的 20 padding 控制两侧位置。 */}
        <View style={[styles.header, { height: design.size(24) }]}>
          <Pressable
            accessibilityLabel="打开侧边抽屉"
            accessibilityRole="button"
            hitSlop={design.size(8)}
            onPress={onMenuPress}
            style={({ pressed }) => [
              styles.headerButton,
              {
                width: design.size(24),
                height: design.size(24),
              },
              pressed && styles.pressed,
            ]}
            testID="home-menu-button"
          >
            <Image
              resizeMode="contain"
              source={{ uri: 'HomeMenuIcon' }}
              style={{ width: design.size(24), height: design.size(24) }}
            />
          </Pressable>

          <Pressable
            accessibilityLabel="联系客服"
            accessibilityRole="button"
            hitSlop={design.size(8)}
            onPress={onSupportPress}
            style={({ pressed }) => [
              styles.headerButton,
              {
                width: design.size(24),
                height: design.size(24),
              },
              pressed && styles.pressed,
            ]}
            testID="home-support-button"
          >
            <Image
              resizeMode="contain"
              source={{ uri: 'HomeSupportIcon' }}
              style={{ width: design.size(24), height: design.size(24) }}
            />
          </Pressable>
        </View>

        {/* 公告条与顶部按钮底边保持设计值 26 的垂直距离。 */}
        <View style={{ marginTop: design.height(26) }}>
          <AnnouncementBar />
        </View>

        <Pressable
          accessibilityLabel={
            accelerationState === 'idle' ? '启动加速' : '停止加速'
          }
          accessibilityRole="button"
          accessibilityState={{
            busy: isTransitioning,
            disabled: isTransitioning,
          }}
          disabled={isTransitioning}
          onPress={handleAnimationPress}
          style={[
            styles.animationArea,
            {
              // 动画从公告横幅底边向下偏移设计值 100，并在页面中水平居中。
              marginTop: design.height(100),
              width: design.width(244),
              height: design.height(231),
            },
          ]}
          testID="home-animation-button"
        >
          <View
            style={[
              styles.glow,
              {
                width: design.size(190),
                height: design.size(190),
                borderRadius: design.size(95),
              },
            ]}
          />
          <AnimatedLottieView
            autoPlay={false}
            loop
            ref={lottieRef}
            resizeMode="contain"
            source={animationSource}
            speed={animationSpeed}
            style={{
              width: design.width(244),
              height: design.height(231),
            }}
            testID="home-json-animation"
          />
          <View pointerEvents="none" style={styles.animationCenterContent}>
            <Image
              resizeMode="contain"
              source={{ uri: 'AccelerationBoltIcon' }}
              style={{ width: design.width(29), height: design.height(49) }}
              testID="home-acceleration-icon"
            />
            <Text
              style={[
                styles.accelerationLabel,
                {
                  marginTop: design.height(12),
                  fontSize: design.size(11.73),
                  lineHeight: design.size(14),
                },
              ]}
              testID="home-acceleration-label"
            >
              {t(accelerationState === 'idle' ? '点击加速' : '加速时间')}
            </Text>
            <Text
              style={[
                styles.accelerationTime,
                {
                  fontSize: design.size(12),
                  lineHeight: design.size(17),
                },
              ]}
              testID="home-acceleration-time"
            >
              {formatElapsedTime(elapsedSeconds)}
            </Text>
          </View>
        </Pressable>

        {/* 游戏模式点击横条进入游戏选择；影音模式横条保持纯展示。 */}
        <Pressable
          accessibilityRole={selectedMode === 'game' ? 'button' : undefined}
          disabled={selectedMode !== 'game'}
          onPress={
            selectedMode === 'game' ? onGamePress ?? onRegionPress : undefined
          }
          style={[
            styles.animationActionBar,
            {
              marginTop: design.height(100),
              width: design.width(275),
              height: design.height(40),
              paddingHorizontal: design.width(20),
              paddingVertical: design.height(4),
              borderRadius: design.size(6),
            },
          ]}
          testID="home-animation-action-bar"
        >
          <>
            <View style={styles.mediaActionBarContent}>
              <Image
                accessibilityLabel={
                  selectedMode === 'media' ? '影音模式' : '游戏模式'
                }
                resizeMode="contain"
                source={
                  selectedMode === 'media'
                    ? mediaActionBarIconSource
                    : gameActionBarIconSource
                }
                style={{ width: design.size(24), height: design.size(24) }}
                testID={`home-animation-action-bar-${selectedMode}-icon`}
              />
              <Text
                style={[
                  styles.mediaActionBarTitle,
                  {
                    marginLeft: design.width(10),
                    fontSize: design.size(14),
                    lineHeight: design.size(17),
                  },
                ]}
                testID="home-animation-action-bar-mode-title"
              >
                {t(selectedMode === 'media' ? '回国影音模式' : '游戏模式')}
              </Text>
              {selectedMode === 'media' ? (
                <>
                  <View
                    style={[
                      styles.mediaActionBarDivider,
                      {
                        width: design.size(1),
                        height: design.size(12),
                        marginHorizontal: design.width(5),
                      },
                    ]}
                    testID="home-animation-action-bar-divider"
                  />
                  <Text
                    style={[
                      styles.mediaActionBarRoute,
                      {
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                    testID="home-animation-action-bar-route"
                  >
                    {t('智能选线')}
                  </Text>
                </>
              ) : null}
              {selectedMode === 'game' ? (
                <>
                  <View
                    style={[
                      styles.mediaActionBarDivider,
                      {
                        width: design.size(1),
                        height: design.size(12),
                        marginHorizontal: design.width(5),
                      },
                    ]}
                    testID="home-animation-action-bar-region-divider"
                  />
                  <Text
                    style={[
                      styles.mediaActionBarRoute,
                      {
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                    testID="home-animation-action-bar-region"
                  >
                    {selectedGameName || t(selectedRegionName)}
                  </Text>
                </>
              ) : null}
            </View>
            <Image
              accessibilityElementsHidden
              resizeMode="contain"
              source={
                selectedMode === 'media'
                  ? mediaActionBarArrowSource
                  : gameActionBarSwitchSource
              }
              style={{ width: design.size(18), height: design.size(18) }}
              testID={
                selectedMode === 'media'
                  ? 'home-animation-action-bar-arrow'
                  : 'home-animation-action-bar-switch'
              }
            />
          </>
        </Pressable>
      </SafeAreaView>

      {cardsVisible ? (
        <View pointerEvents="box-none" style={styles.floatingCardsLayer}>
          <Animated.View
            style={[
              styles.floatingCard,
              selectedMode === 'game' && styles.floatingCardGlowSelected,
              {
                bottom: design.height(60 + 23 + 26),
                width: design.width(335),
                height: design.height(108),
                borderRadius: design.size(16),
                shadowRadius: design.size(16),
                opacity: lowerCardProgress,
                transform: [
                  {
                    translateY: lowerCardProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [design.height(18), 0],
                    }),
                  },
                ],
              },
            ]}
            testID="home-floating-card-lower"
          >
            <Pressable
              accessibilityLabel={t('选择游戏模式')}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedMode === 'game' }}
              onPress={() => onModeChange?.('game')}
              style={[
                styles.floatingCardPressTarget,
                styles.floatingCardSurface,
                selectedMode === 'game' && styles.floatingCardSurfaceSelected,
                {
                  gap: design.height(16),
                  paddingHorizontal: design.width(30),
                  paddingVertical: design.height(20),
                  borderRadius: design.size(16),
                  borderWidth: design.size(0.8),
                },
              ]}
              testID="home-floating-card-game-option"
            >
              <View style={[styles.cardContentRow, { gap: design.width(25) }]}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.cardCircle,
                    {
                      width: design.size(50),
                      height: design.size(50),
                      borderRadius: design.size(25),
                    },
                  ]}
                  testID="home-floating-card-game-circle"
                >
                  <Image
                    accessibilityElementsHidden
                    resizeMode="contain"
                    source={require('../../assets/card-game-icon.png')}
                    style={{
                      width: design.size(24),
                      height: design.size(24),
                    }}
                  />
                </View>
                <View
                  style={[styles.cardTextColumn, { gap: design.height(12) }]}
                >
                  <Text
                    style={[
                      styles.cardTitle,
                      {
                        fontSize: design.size(16),
                        lineHeight: design.size(19),
                      },
                    ]}
                    testID="home-floating-card-game-title"
                  >
                    {t('游戏模式')}
                  </Text>
                  <Text
                    style={[
                      styles.cardDescription,
                      {
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                    testID="home-floating-card-game-description"
                  >
                    {t('专为国服游戏优化、告别卡顿与高延迟')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.cardSelectionRing,
                    {
                      width: design.size(19),
                      height: design.size(19),
                      borderRadius: design.size(9.5),
                      borderWidth: design.size(1.5),
                    },
                  ]}
                  testID="home-floating-card-game-selected"
                >
                  {selectedMode === 'game' ? (
                    <View
                      style={[
                        styles.cardSelectionDot,
                        {
                          width: design.size(9),
                          height: design.size(9),
                          borderRadius: design.size(4.5),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View
            style={[
              styles.floatingCard,
              selectedMode === 'media' && styles.floatingCardGlowSelected,
              {
                bottom: design.height(60 + 23 + 26 + 108 + 22),
                width: design.width(335),
                height: design.height(108),
                borderRadius: design.size(16),
                shadowRadius: design.size(16),
                opacity: upperCardProgress,
                transform: [
                  {
                    translateY: upperCardProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [design.height(18), 0],
                    }),
                  },
                ],
              },
            ]}
            testID="home-floating-card-upper"
          >
            <Pressable
              accessibilityLabel="选择回国影音模式"
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedMode === 'media' }}
              onPress={() => onModeChange?.('media')}
              style={[
                styles.floatingCardPressTarget,
                styles.floatingCardSurface,
                selectedMode === 'media' && styles.floatingCardSurfaceSelected,
                {
                  gap: design.height(16),
                  paddingHorizontal: design.width(30),
                  paddingVertical: design.height(20),
                  borderRadius: design.size(16),
                  borderWidth: design.size(0.8),
                },
              ]}
              testID="home-floating-card-media-option"
            >
              <View style={[styles.cardContentRow, { gap: design.width(25) }]}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.cardCircle,
                    {
                      width: design.size(50),
                      height: design.size(50),
                      borderRadius: design.size(25),
                    },
                  ]}
                  testID="home-floating-card-media-circle"
                >
                  <Image
                    accessibilityElementsHidden
                    resizeMode="contain"
                    source={require('../../assets/card-media-icon.png')}
                    style={{
                      width: design.size(24),
                      height: design.size(24),
                    }}
                  />
                </View>
                <View
                  style={[styles.cardTextColumn, { gap: design.height(12) }]}
                >
                  <Text
                    style={[
                      styles.cardTitle,
                      {
                        fontSize: design.size(16),
                        lineHeight: design.size(19),
                      },
                    ]}
                    testID="home-floating-card-media-title"
                  >
                    {t('回国影音模式')}
                  </Text>
                  <Text
                    style={[
                      styles.cardDescription,
                      {
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                    testID="home-floating-card-media-description"
                  >
                    {t('加速访问中国大陆影视、音乐等全场景应用。')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.cardSelectionRing,
                    {
                      width: design.size(19),
                      height: design.size(19),
                      borderRadius: design.size(9.5),
                      borderWidth: design.size(1.5),
                    },
                  ]}
                  testID="home-floating-card-media-selected"
                >
                  {selectedMode === 'media' ? (
                    <View
                      style={[
                        styles.cardSelectionDot,
                        {
                          width: design.size(9),
                          height: design.size(9),
                          borderRadius: design.size(4.5),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
      <ThemeAlertDialog
        cancelText="取消"
        confirmText={
          startupErrorDialog?.code === -1
            ? '充值'
            : startupErrorDialog?.code === -2
            ? '启动时长'
            : startupErrorDialog?.code === -3
            ? '切换会员'
            : startupErrorDialog?.code === -4
            ? '联系客服'
            : '确定'
        }
        message={startupErrorDialog?.message ?? ''}
        onClose={() => setStartupErrorDialog(null)}
        onConfirm={handleStartupErrorConfirm}
        title={
          startupErrorDialog?.code === -1
            ? '会员已过期'
            : startupErrorDialog?.code === -2
            ? '启动时长'
            : startupErrorDialog?.code === -3
            ? '切换会员'
            : '提示'
        }
        visible={Boolean(startupErrorDialog)}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    // 图片加载前使用深色占位，避免首帧短暂出现白屏。
    backgroundColor: '#1F3037',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
  animationArea: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  animationActionBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  mediaActionBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaActionBarTitle: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  mediaActionBarDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  mediaActionBarRoute: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  floatingCardsLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 900,
    elevation: 900,
  },
  floatingCard: {
    position: 'absolute',
    alignSelf: 'center',
    shadowColor: 'rgba(233, 147, 0, 1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
  },
  cardCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  cardTextColumn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardTitle: {
    color: 'rgba(255, 255, 255, 1)',
    fontStyle: 'normal',
    fontWeight: '700',
  },
  cardDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'normal',
    fontWeight: '500',
  },
  cardSelectionRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255, 255, 255, 1)',
  },
  cardSelectionDot: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  floatingCardGlowSelected: {
    // 半透明卡片会透出底层阴影，降低强度可保留外发光并避免主体染黄。
    shadowOpacity: 0.35,
  },
  floatingCardPressTarget: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  floatingCardSurface: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    borderColor: 'transparent',
    borderRadius: 16,
    backgroundColor: 'rgba(28, 57, 71, 0.8)',
  },
  floatingCardSurfaceSelected: {
    borderColor: 'rgba(254, 181, 15, 1)',
  },
  animationCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accelerationLabel: {
    color: 'rgba(254, 197, 79, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  accelerationTime: {
    color: 'rgba(254, 197, 79, 1)',
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(114, 238, 199, 0.07)',
  },
});
