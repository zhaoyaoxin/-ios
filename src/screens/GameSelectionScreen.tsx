import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CommonPage } from '../components/CommonPage';
import type { IosGame } from '../api/types';
import { useI18n, type AppLocale } from '../i18n';
import {
  loadIosGames,
  resolveGameArea,
  resolveGameName,
} from '../services/gameService';
import { useDesignScale } from '../utils/designScale';

/** i18n 用 zh-Hans/zh-Hant，接口 translations 用 zh-CN/zh-TW。 */
const TRANSLATION_LOCALE: Record<AppLocale, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
};

type GameSelectionScreenProps = {
  onBack: () => void;
  /** 数据源。不传则走 gameService。 */
  onLoadGames?: () => Promise<IosGame[]>;
  onSelect: (game: IosGame) => void;
  /** 当前已选游戏 id，用于高亮。 */
  selectedGameId?: number | null;
  testID?: string;
  title: string;
};

/** 游戏选择页：选中的游戏 id 即加速接口需要的 gid。 */
export function GameSelectionScreen({
  onBack,
  onLoadGames,
  onSelect,
  selectedGameId = null,
  testID = 'game-selection-screen',
  title,
}: GameSelectionScreenProps) {
  const design = useDesignScale();
  const { locale, t } = useI18n();
  const [games, setGames] = useState<IosGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [keyword, setKeyword] = useState('');

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      setGames(onLoadGames ? await onLoadGames() : await loadIosGames());
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : '游戏列表获取失败',
      );
    } finally {
      setLoading(false);
    }
  }, [onLoadGames]);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  const translationLocale = TRANSLATION_LOCALE[locale];

  const visibleGames = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) {
      return games;
    }
    return games.filter(game => {
      const name = resolveGameName(game, translationLocale).toLowerCase();
      return (
        name.includes(trimmed) ||
        game.en_name?.toLowerCase().includes(trimmed) ||
        game.alias?.toLowerCase().includes(trimmed)
      );
    });
  }, [games, keyword, translationLocale]);

  const renderGame = (game: IosGame) => {
    const selected = game.id === selectedGameId;
    const name = resolveGameName(game, translationLocale);
    const area = resolveGameArea(game, translationLocale);

    return (
      <Pressable
        accessibilityLabel={name}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        key={game.id}
        onPress={() => onSelect(game)}
        style={({ pressed }) => [
          styles.gameRow,
          {
            marginBottom: design.height(12),
            borderRadius: design.size(12),
            borderWidth: design.size(1),
            paddingHorizontal: design.width(14),
            paddingVertical: design.height(12),
          },
          selected && styles.gameRowSelected,
          pressed && styles.pressed,
        ]}
        testID={`${testID}-game-${game.id}`}
      >
        <Image
          resizeMode="cover"
          source={{ uri: game.icon || game.img }}
          style={{
            width: design.size(40),
            height: design.size(40),
            borderRadius: design.size(8),
          }}
        />
        <View style={[styles.gameText, { marginLeft: design.width(12) }]}>
          <Text
            numberOfLines={1}
            style={[styles.gameName, { fontSize: design.size(15) }]}
          >
            {name}
          </Text>
          {area ? (
            <Text
              numberOfLines={1}
              style={[
                styles.gameArea,
                { marginTop: design.height(4), fontSize: design.size(12) },
              ]}
            >
              {area}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <View
            style={[
              styles.tick,
              {
                width: design.size(6),
                height: design.size(11),
                borderRightWidth: design.size(2),
                borderBottomWidth: design.size(2),
                marginRight: design.width(4),
              },
            ]}
            testID={`${testID}-game-${game.id}-tick`}
          />
        ) : null}
      </Pressable>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centered} testID={`${testID}-loading`}>
          <ActivityIndicator color="#FFBF00" />
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.centered} testID={`${testID}-error`}>
          <Text style={[styles.hintText, { fontSize: design.size(13) }]}>
            {t(errorMessage)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={fetchGames}
            style={({ pressed }) => [
              styles.retryButton,
              {
                marginTop: design.height(16),
                paddingHorizontal: design.width(24),
                height: design.height(36),
                borderRadius: design.size(18),
              },
              pressed && styles.pressed,
            ]}
            testID={`${testID}-retry`}
          >
            <Text style={[styles.retryText, { fontSize: design.size(13) }]}>
              {t('重新加载')}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (visibleGames.length === 0) {
      return (
        <View style={styles.centered} testID={`${testID}-empty`}>
          <Text style={[styles.hintText, { fontSize: design.size(13) }]}>
            {keyword.trim() ? t('没有匹配的游戏') : t('暂无可选游戏')}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={{ paddingBottom: design.height(12) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {visibleGames.map(renderGame)}
      </ScrollView>
    );
  };

  return (
    <CommonPage onBack={onBack} testID={testID} title={title}>
      <View
        style={[
          styles.searchBox,
          {
            marginTop: design.height(16),
            marginBottom: design.height(14),
            height: design.height(38),
            borderRadius: design.size(19),
            paddingHorizontal: design.width(16),
          },
        ]}
      >
        <TextInput
          onChangeText={setKeyword}
          placeholder={t('搜索游戏')}
          placeholderTextColor="rgba(255, 255, 255, 0.35)"
          style={[styles.searchInput, { fontSize: design.size(13) }]}
          testID={`${testID}-search`}
          value={keyword}
        />
      </View>

      {renderBody()}
    </CommonPage>
  );
}

export default GameSelectionScreen;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFBF00',
  },
  retryText: {
    color: '#17303C',
    fontWeight: '600',
  },
  searchBox: {
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchInput: {
    padding: 0,
    color: '#FFFFFF',
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'transparent',
  },
  gameRowSelected: {
    backgroundColor: 'rgba(255, 191, 0, 0.12)',
    borderColor: '#FFBF00',
  },
  gameText: {
    flex: 1,
  },
  gameName: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  gameArea: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tick: {
    borderColor: '#FFBF00',
    transform: [{ rotate: '45deg' }],
  },
  pressed: {
    opacity: 0.7,
  },
});
