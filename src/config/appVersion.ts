type PackageMetadata = {
  version?: unknown;
};

// Metro 会在打包时读取根目录 package.json，避免在多个服务中手动维护版本号。
const packageMetadata = require('../../package.json') as PackageMetadata;

export const APP_VERSION =
  typeof packageMetadata.version === 'string' && packageMetadata.version.trim()
    ? packageMetadata.version.trim()
    : '0.0.0';
