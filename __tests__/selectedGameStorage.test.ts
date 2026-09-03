import { filterGamesByMode } from '../src/services/gameService';
import {
  getSelectedGameId,
  resolveSelectedGame,
  saveSelectedGameId,
} from '../src/services/selectedGameStorage';
import type { IosGame } from '../src/api/types';

const createStorage = (initial: Record<string, string> = {}) => {
  const values = { ...initial };
  return {
    values,
    get: (key: string) => values[key],
    set: (next: Record<string, string>) => Object.assign(values, next),
  };
};

const games = [
  { id: 11, name: 'A' },
  { id: 22, name: 'B' },
  { id: 33, name: 'C' },
];

const asGame = (id: number, isMedia?: boolean) =>
  ({ id, name: `G${id}`, is_media_mode: isMedia } as unknown as IosGame);

test('没有本地记录时默认选中第一个', () => {
  expect(resolveSelectedGame(games, null)).toEqual({ id: 11, name: 'A' });
});

test('本地记录仍在列表中时沿用之前的选择', () => {
  expect(resolveSelectedGame(games, 22)).toEqual({ id: 22, name: 'B' });
});

test('本地记录已不在列表中时回退到第一个', () => {
  expect(resolveSelectedGame(games, 999)).toEqual({ id: 11, name: 'A' });
});

test('列表为空时没有可选项', () => {
  expect(resolveSelectedGame([], 22)).toBeNull();
});

test('游戏模式取非影音，影音模式取影音；缺字段按游戏类', () => {
  const list = [asGame(1, false), asGame(2, true), asGame(3)];

  expect(filterGamesByMode(list, 'game').map(g => g.id)).toEqual([1, 3]);
  expect(filterGamesByMode(list, 'media').map(g => g.id)).toEqual([2]);
});

test('两种模式各记一条，互不覆盖', () => {
  const storage = createStorage();
  expect(getSelectedGameId('game', storage)).toBeNull();
  expect(getSelectedGameId('media', storage)).toBeNull();

  saveSelectedGameId('game', 33, storage);
  saveSelectedGameId('media', 77, storage);

  expect(getSelectedGameId('game', storage)).toBe(33);
  expect(getSelectedGameId('media', storage)).toBe(77);
});

test('读取异常或脏数据都按未选择处理', () => {
  const broken = {
    get: () => {
      throw new Error('storage unavailable');
    },
    set: () => undefined,
  };
  expect(getSelectedGameId('game', broken)).toBeNull();

  expect(
    getSelectedGameId(
      'game',
      createStorage({ 'lottielite.selected_game_id': '' }),
    ),
  ).toBeNull();
  expect(
    getSelectedGameId(
      'game',
      createStorage({ 'lottielite.selected_game_id': 'abc' }),
    ),
  ).toBeNull();
});
