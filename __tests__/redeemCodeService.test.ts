import {
  LEGACY_REDEEM_CODE_REGEX,
  redeemPasscode,
} from '../src/services/redeemCodeService';

jest.mock('../src/services/authTokenStorage', () => ({
  getAuthToken: jest.fn(() => 'token-value'),
  saveAuthToken: jest.fn(),
}));

jest.mock('../src/services/authUserStorage', () => ({
  saveAuthUser: jest.fn(),
}));

jest.mock('../src/services/deviceIdentity', () => ({
  getOrCreateInstallMacAddress: jest.fn(() => '02:AA:BB:CC:DD:EE'),
}));

const createClient = () => ({
  getProfile: jest.fn().mockResolvedValue({
    code: 0,
    message: 'ok',
    data: {
      user: { id: 6, product_id: 2 },
      mac: '02:AA:BB:CC:DD:EE',
      platform: 'ios',
    },
  }),
  redeemCard: jest.fn().mockResolvedValue({ code: 200, message: 'ok' }),
  redeemCode: jest.fn().mockResolvedValue({ code: 0, message: 'ok' }),
});

test('recognizes and submits a legacy domestic card code', async () => {
  const client = createClient();
  const delay = jest.fn(async () => undefined);
  const code = '12to3456h1234567';
  expect(LEGACY_REDEEM_CODE_REGEX.test(code)).toBe(true);

  await redeemPasscode(code, { product_id: 2 }, client, delay);

  expect(client.redeemCard).toHaveBeenCalledWith({
    token: 'token-value',
    code,
    is_domestic: true,
    mac: '02:AA:BB:CC:DD:EE',
    version: '0.0.1',
  });
  expect(client.redeemCode).not.toHaveBeenCalled();
  expect(delay).toHaveBeenCalledWith(2000);
  expect(client.getProfile).toHaveBeenCalled();
});

test('submits a regular passcode through the client code API', async () => {
  const client = createClient();
  await redeemPasscode(
    'NEW-CODE',
    { product_id: 4 },
    client,
    async () => undefined,
  );
  expect(client.redeemCode).toHaveBeenCalledWith('NEW-CODE');
  expect(client.redeemCard).not.toHaveBeenCalled();
});
