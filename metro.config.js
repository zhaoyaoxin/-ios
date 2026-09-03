const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const metroCacheRoot = path.join(__dirname, '.metro-cache');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // 转换缓存固定到项目目录，避免读写系统共享缓存时产生权限冲突。
  // 文件索引使用的 TMPDIR 必须在 Node 启动前设置，因此由 package.json 脚本负责。
  cacheStores: ({ FileStore }) => [
    new FileStore({ root: path.join(metroCacheRoot, 'transform') }),
  ],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
