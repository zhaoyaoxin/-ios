import {
  createInstallMacAddress,
  getOrCreateInstallMacAddress,
} from '../src/services/deviceIdentity';

const createMemoryStorage = (initialValue?: unknown) => {
  const values = new Map<string, unknown>();
  if (initialValue !== undefined) {
    values.set('lottielite.install_mac_address', initialValue);
  }
  return {
    get: (key: string) => values.get(key),
    set: jest.fn((entries: Record<string, string>) => {
      Object.entries(entries).forEach(([key, value]) => values.set(key, value));
    }),
  };
};

test('creates a locally administered MAC address', () => {
  expect(createInstallMacAddress(() => 0.5)).toBe('02:80:80:80:80:80');
});

test('persists the generated address and reuses it', () => {
  const storage = createMemoryStorage();
  const first = getOrCreateInstallMacAddress(storage);
  const second = getOrCreateInstallMacAddress(storage);

  expect(first).toMatch(/^02(?::[0-9A-F]{2}){5}$/);
  expect(second).toBe(first);
  expect(storage.set).toHaveBeenCalledTimes(1);
});

test('replaces an invalid stored value', () => {
  const storage = createMemoryStorage('invalid-address');

  expect(getOrCreateInstallMacAddress(storage)).toMatch(
    /^02(?::[0-9A-F]{2}){5}$/,
  );
  expect(storage.set).toHaveBeenCalledTimes(1);
});
