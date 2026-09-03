import { Settings } from 'react-native';
import { create } from 'zustand';

export type AppLocale = 'zh-Hans' | 'zh-Hant';

const LOCALE_STORAGE_KEY = 'lottielite.locale';

const readLocale = (): AppLocale => {
  try {
    return Settings.get(LOCALE_STORAGE_KEY) === 'zh-Hant'
      ? 'zh-Hant'
      : 'zh-Hans';
  } catch {
    return 'zh-Hans';
  }
};

const phraseMap: Record<string, string> = {
  账号与安全: '帳號與安全',
  账号与密码: '帳號與密碼',
  账号问题: '帳號問題',
  账号: '帳號',
  手机号: '手機號',
  电子邮箱: '電子郵箱',
  登录密码: '登入密碼',
  登录: '登入',
  订单记录: '訂單記錄',
  订单列表: '訂單列表',
  订单号: '訂單號',
  第三方订单号: '第三方訂單號',
  常见问题: '常見問題',
  联系客服: '聯絡客服',
  客服: '客服',
  设备管理: '裝置管理',
  故障排查: '故障排查',
  语言设置: '語言設定',
  设置密码: '設定密碼',
  修改密码: '修改密碼',
  获取验证码: '取得驗證碼',
  验证码: '驗證碼',
  绑定: '綁定',
  未绑定: '未綁定',
  简体中文: '簡體中文',
  繁体中文: '繁體中文',
};

const characterMap: Record<string, string> = {
  账: '帳',
  号: '號',
  码: '碼',
  录: '錄',
  订: '訂',
  单: '單',
  设: '設',
  备: '備',
  邮: '郵',
  箱: '箱',
  绑: '綁',
  验: '驗',
  证: '證',
  获: '獲',
  取: '取',
  联: '聯',
  系: '繫',
  问: '問',
  题: '題',
  语: '語',
  言: '言',
  置: '置',
  购: '購',
  买: '買',
  续: '續',
  费: '費',
  暂: '暫',
  停: '停',
  启: '啟',
  动: '動',
  时: '時',
  间: '間',
  剩: '剩',
  余: '餘',
  效: '效',
  期: '期',
  页: '頁',
  面: '面',
  返: '返',
  回: '回',
  开: '開',
  关: '關',
  闭: '閉',
  显: '顯',
  示: '示',
  图: '圖',
  标: '標',
  选: '選',
  择: '擇',
  当: '當',
  前: '前',
  未: '未',
  过: '過',
  计: '計',
  发: '發',
  送: '送',
  输: '輸',
  入: '入',
  确: '確',
  认: '認',
  错: '錯',
  误: '誤',
  失: '失',
  败: '敗',
  成: '成',
  功: '功',
  新: '新',
  用: '用',
  户: '戶',
  务: '務',
  隐: '隱',
  私: '私',
  条: '條',
  款: '款',
  兑: '兌',
  换: '換',
  频: '頻',
  游: '遊',
  戏: '戲',
  区: '區',
  线: '線',
  智: '智',
  能: '能',
  体: '體',
  万: '萬',
  与: '與',
  为: '為',
  个: '個',
  门: '門',
  无: '無',
  后: '後',
  台: '臺',
  国: '國',
  陆: '陸',
  视: '視',
  乐: '樂',
  应: '應',
  场: '場',
  优: '優',
  化: '化',
  迟: '遲',
  态: '態',
  焕: '煥',
  经: '經',
  级: '級',
  处: '處',
  理: '理',
  支: '支',
  付: '付',
  资: '資',
  料: '料',
  详: '詳',
  细: '細',
  复: '復',
  制: '製',
  载: '載',
  据: '據',
  络: '絡',
  仅: '僅',
  从: '從',
  这: '這',
  里: '裡',
  寻: '尋',
  统: '統',
  总: '總',
};

export const toTraditionalChinese = (source: string) => {
  let result = source;
  Object.entries(phraseMap)
    .sort(([left], [right]) => right.length - left.length)
    .forEach(([simplified, traditional]) => {
      result = result.split(simplified).join(traditional);
    });
  return Array.from(result)
    .map(character => characterMap[character] ?? character)
    .join('');
};

type LocaleState = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

export const useLocaleStore = create<LocaleState>(set => ({
  locale: readLocale(),
  setLocale: locale => {
    try {
      Settings.set({ [LOCALE_STORAGE_KEY]: locale });
    } catch {
      // Jest 或原生 Settings 未就绪时仍更新当前会话。
    }
    set({ locale });
  },
}));

export function useI18n() {
  const locale = useLocaleStore(state => state.locale);
  return {
    locale,
    t: (source: string) =>
      locale === 'zh-Hant' ? toTraditionalChinese(source) : source,
  };
}
