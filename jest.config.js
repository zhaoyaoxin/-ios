module.exports = {
  preset: '@react-native/jest-preset',
  // react-native-webview 以未转译的源码发布，需要交给 Babel 处理；
  // 其余保持 preset 的默认忽略规则不变。
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-webview)/)',
  ],
  // preset 未设置 setupFilesAfterEnv，用它挂全局 mock 不会覆盖 preset 的 setupFiles。
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
