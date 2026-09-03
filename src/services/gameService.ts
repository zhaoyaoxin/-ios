import { GnjiasuApiClient } from '../api';
import type { IosGame } from '../api/types';
import { APP_VERSION } from '../config/appVersion';
import { getAuthToken, saveAuthToken } from './authTokenStorage';

/** 与其他服务保持一致：新接口返回 0，部分旧接口仍返回 200。 */
const isSuccessCode = (code: number) => code === 0 || code === 200;

const apiClient = new GnjiasuApiClient({
  version: APP_VERSION,
  token: getAuthToken(),
  onTokenRefresh: saveAuthToken,
});

type GameApiClient = Pick<GnjiasuApiClient, 'getIosGames'>;

/** 拉取 iOS 游戏列表。返回项的 id 即加速所需的 gid。 */
export async function loadIosGames(
  client: GameApiClient = apiClient,
  options?: { signal?: AbortSignal },
): Promise<IosGame[]> {
  const response = await client.getIosGames(options);
  if (!isSuccessCode(response.code)) {
    throw new Error(response.message || '游戏列表获取失败');
  }
  return response.data ?? [];
}

/** 首页两种加速模式，对应两份互斥的游戏列表。 */
export type GameMode = 'game' | 'media';

/** 影音类游戏。接口未下发 is_media_mode 时按游戏类处理。 */
export const isMediaModeGame = (game: IosGame) => game.is_media_mode === true;

/** 按模式切分列表：游戏模式取非影音，影音模式取影音。 */
export function filterGamesByMode(games: IosGame[], mode: GameMode): IosGame[] {
  return games.filter(game => isMediaModeGame(game) === (mode === 'media'));
}

/** 优先使用当前语言的译名，缺失时回退接口默认字段。 */
export function resolveGameName(game: IosGame, locale: string): string {
  return game.translations?.[locale]?.name?.trim() || game.name;
}

/** 同上，用于地区/服别展示。 */
export function resolveGameArea(game: IosGame, locale: string): string {
  return game.translations?.[locale]?.area?.trim() || game.area;
}
