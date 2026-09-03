import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CommonPage } from '../components/CommonPage';
import type { IosCategory } from '../api/types';
import { useI18n } from '../i18n';
import { loadHelpCategories } from '../services/helpService';
import { useDesignScale } from '../utils/designScale';

type HelpSupportScreenProps = {
  onBack: () => void;
  onContactSupport?: () => void;
  onJoinGroup?: () => void;
  /** 咨询分类数据源。不传则走 helpService。 */
  onLoadCategories?: () => Promise<IosCategory[]>;
};

/** 帮助与客服页面：提供人工客服和客服 QQ 群两个入口。 */
export function HelpSupportScreen({
  onBack,
  onContactSupport,
  onJoinGroup,
  onLoadCategories,
}: HelpSupportScreenProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const [categories, setCategories] = useState<IosCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const list = onLoadCategories
        ? await onLoadCategories()
        : await loadHelpCategories();
      setCategories(list);
      // 默认选中第一个一级分类。
      setSelectedCategoryId(current =>
        list.some(item => item.id === current) ? current : list[0]?.id ?? null,
      );
    } catch (reason) {
      setErrorMessage(
        reason instanceof Error ? reason.message : '分类列表获取失败',
      );
    } finally {
      setLoading(false);
    }
  }, [onLoadCategories]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  /** 问题列表取当前一级分类下的二级分类。 */
  const questions = useMemo(
    () =>
      categories.find(item => item.id === selectedCategoryId)?.children ?? [],
    [categories, selectedCategoryId],
  );

  const buttonStyle = {
    height: design.height(32),
    borderWidth: design.size(1),
    borderRadius: design.size(30),
    gap: design.size(6),
  };

  return (
    <CommonPage
      onBack={onBack}
      testID="help-support-screen"
      title={t('帮助与客服')}
    >
      <View style={{ marginTop: design.height(20) }}>
        <Text
          style={[
            styles.description,
            {
              fontSize: design.size(14),
              lineHeight: design.size(17),
            },
          ]}
          testID="help-support-description"
        >
          {t(
            '客服工作时间段为08:30-23:00,您可以选择联系客服人员或提交问题反馈',
          )}
        </Text>

        <View
          style={[styles.actions, { marginTop: design.height(20) }]}
          testID="help-support-actions"
        >
          <Pressable
            accessibilityRole="button"
            onPress={onContactSupport}
            style={({ pressed }) => [
              styles.button,
              styles.contactButton,
              buttonStyle,
              { width: design.width(100) },
              pressed && styles.pressed,
            ]}
            testID="help-support-contact"
          >
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: design.size(14),
                  lineHeight: design.size(17),
                },
              ]}
            >
              {t('联系客服')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onJoinGroup}
            style={({ pressed }) => [
              styles.button,
              buttonStyle,
              {
                width: design.width(205),
                marginLeft: design.width(30),
              },
              pressed && styles.pressed,
            ]}
            testID="help-support-qq-group"
          >
            <Text
              numberOfLines={1}
              style={[
                styles.buttonText,
                {
                  fontSize: design.size(14),
                  lineHeight: design.size(17),
                },
              ]}
            >
              {t('客服QQ群:1025672495')}
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.feedbackModule,
            {
              marginTop: design.height(30),
              paddingVertical: design.height(10),
              paddingHorizontal: design.width(20),
              borderWidth: design.size(0.5),
              borderRadius: design.size(10),
            },
          ]}
          testID="help-support-feedback-module"
        >
          <Text
            style={[
              styles.feedbackTitle,
              {
                fontSize: design.size(14),
                lineHeight: design.size(17),
              },
            ]}
            testID="help-support-feedback-title"
          >
            {t('猜你想问')}
          </Text>
          <View
            style={[styles.categoryRow, { marginTop: design.height(14) }]}
            testID="help-support-question-categories"
          >
            {categories.map(category => {
              const selected = category.id === selectedCategoryId;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={category.id}
                  onPress={() => setSelectedCategoryId(category.id)}
                  style={styles.categoryButton}
                  testID={`help-support-category-${category.slug}`}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      {
                        color: selected
                          ? 'rgba(255, 255, 255, 1)'
                          : 'rgba(255, 255, 255, 0.6)',
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                  >
                    {t(category.name)}
                  </Text>
                  {selected ? (
                    <View
                      style={[
                        styles.categoryIndicator,
                        {
                          height: design.size(2),
                          marginTop: design.height(2),
                        },
                      ]}
                      testID={`help-support-category-${category.slug}-indicator`}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View
            style={{ marginTop: design.height(12) }}
            testID="help-support-question-list"
          >
            {loading ? (
              <ActivityIndicator
                color="#FFBF00"
                testID="help-support-questions-loading"
              />
            ) : null}
            {!loading && errorMessage ? (
              <Pressable
                accessibilityRole="button"
                onPress={fetchCategories}
                testID="help-support-questions-retry"
              >
                <Text
                  style={[
                    styles.answerText,
                    { fontSize: design.size(12), lineHeight: design.size(16) },
                  ]}
                >
                  {`${t(errorMessage)}　${t('点击重试')}`}
                </Text>
              </Pressable>
            ) : null}
            {!loading && !errorMessage && questions.length === 0 ? (
              <Text
                style={[
                  styles.answerText,
                  { fontSize: design.size(12), lineHeight: design.size(16) },
                ]}
                testID="help-support-questions-empty"
              >
                {t('暂无相关问题')}
              </Text>
            ) : null}
            {questions.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.questionItem,
                  { paddingVertical: design.height(8) },
                ]}
                testID={`help-support-question-${index}`}
              >
                <View style={styles.questionHeader}>
                  <Text
                    style={[
                      styles.questionNumber,
                      {
                        width: design.width(20),
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                  <Text
                    style={[
                      styles.questionText,
                      {
                        fontSize: design.size(12),
                        lineHeight: design.size(14),
                      },
                    ]}
                    testID={`help-support-question-${index}-title`}
                  >
                    {t(item.name)}
                  </Text>
                  <Image
                    accessibilityElementsHidden
                    resizeMode="contain"
                    source={{ uri: 'DrawerListArrow' }}
                    style={[
                      styles.questionArrow,
                      { width: design.size(18), height: design.size(18) },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </CommonPage>
  );
}

const styles = StyleSheet.create({
  description: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  contactButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackModule: {
    width: '100%',
    alignSelf: 'stretch',
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  feedbackTitle: {
    alignSelf: 'flex-start',
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  categoryRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  categoryButton: {
    alignItems: 'stretch',
  },
  categoryText: {
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryIndicator: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  questionItem: { width: '100%' },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  questionNumber: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  questionText: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
  },
  questionArrow: { marginLeft: 8 },
  answerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  pressed: { opacity: 0.7 },
});
