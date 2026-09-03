import { Settings } from 'react-native';

import type { GameMode } from './gameService';

/**
 * 两种模式各记一条。
 * 共用一个键的话，切到另一模式会把上一模式的选择覆盖掉，来回切一次就丢了。
 */
const SELECTED_GAME_STORAGE_KEYS: Record<GameMode, string> = {
  game: 'lottielite.selected_game_id',
  media: 'lottielite.selected_media_id',
};

type GameStorage = {
  get: (key: string) => unknown;
  set: (values: Record<string, string>) => void;
};

const resolveStorage = (storage?: GameStorage) => storage ?? Settings;

/** 读取该模式下上次选中的游戏 id；没有记录或异常都返回 null。 */
export function getSelectedGameId(
  mode: GameMode,
  storage?: GameStorage,
): number | null {
  try {
    const value = resolveStorage(storage).get(
      SELECTED_GAME_STORAGE_KEYS[mode],
    );
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** 记住该模式下的选择，下次冷启动或切回该模式时复用。 */
export function saveSelectedGameId(
  mode: GameMode,
  gameId: number,
  storage?: GameStorage,
) {
  try {
    resolveStorage(storage).set({
      [SELECTED_GAME_STORAGE_KEYS[mode]]: String(gameId),
    });
  } catch {
    // 存储失败只影响下次的默认选中，不该打断当前选择。
  }
}

/**
 * 依据当前模式对应的列表决定选中哪个。
 *
 * 优先沿用本地记录；记录的 id 已不在列表里（下架、换环境、换模式）则回退到第一个。
 * 列表为空时返回 null。
 */
export function resolveSelectedGame<T extends { id: number }>(
  games: T[],
  storedId: number | null,
): T | null {
  if (games.length === 0) {
    return null;
  }
  return games.find(game => game.id === storedId) ?? games[0];
}
