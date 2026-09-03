import { useClientStore } from '../src/store/clientStore';

afterEach(() => useClientStore.getState().clearInitialization());

test('stores the latest client initialization response', () => {
  const initialization = { ip: '127.0.0.1', banners: [] } as never;
  useClientStore.getState().setInitialization(initialization);
  expect(useClientStore.getState().initialization).toBe(initialization);
});
