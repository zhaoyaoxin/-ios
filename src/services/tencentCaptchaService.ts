import { NativeModules } from 'react-native';

type TencentCaptchaResult = { ticket?: string } | string;
type TencentCaptchaModule = {
  verify?: () => Promise<TencentCaptchaResult>;
};

/**
 * 调用 iOS 腾讯验证码桥接模块。原生模块接入后应返回 ticket；
 * 未安装模块时明确提示，避免用空 ticket 请求短信接口。
 */
export async function requestTencentCaptchaTicket() {
  const captcha = NativeModules.TencentCaptcha as
    | TencentCaptchaModule
    | undefined;
  if (!captcha?.verify) {
    throw new Error('腾讯验证码组件尚未配置，请联系开发人员');
  }
  const result = await captcha.verify();
  const ticket = typeof result === 'string' ? result : result?.ticket;
  if (!ticket?.trim()) {
    throw new Error('安全验证未完成，请重试');
  }
  return ticket.trim();
}
