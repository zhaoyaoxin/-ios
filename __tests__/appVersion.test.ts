import packageMetadata from '../package.json';
import { APP_VERSION } from '../src/config/appVersion';

test('uses the version declared in package.json', () => {
  expect(APP_VERSION).toBe(packageMetadata.version);
});
