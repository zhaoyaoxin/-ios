import React from 'react';

import { CommonPage } from '../components/CommonPage';

type SecondaryPageScreenProps = {
  onBack: () => void;
  testID: string;
  title: string;
};

/** 会员页和我的页暂时共用空内容，页面结构由 CommonPage 统一提供。 */
export function SecondaryPageScreen(props: SecondaryPageScreenProps) {
  return <CommonPage {...props} />;
}
