/* eslint-env jest */

/**
 * react-native-webview 依赖原生 TurboModule，测试环境没有。
 * 统一替换成普通 View，渲染树结构保持可断言。
 */
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { __esModule: true, WebView: View, default: View };
});
