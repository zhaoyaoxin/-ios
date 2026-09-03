import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COUNTRY_CODES, type CountryCode } from '../data/countryCodes';
import { useDesignScale } from '../utils/designScale';
import { useI18n } from '../i18n';

type CountryCodePickerProps = {
  onChange: (country: CountryCode) => void;
  value: CountryCode;
};

function CountryCodePickerComponent({
  onChange,
  value,
}: CountryCodePickerProps) {
  const design = useDesignScale();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const closePicker = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
  }, []);

  const filteredCountries = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase().replace(/^\+/, '');
    if (!keyword) {
      return COUNTRY_CODES;
    }
    return COUNTRY_CODES.filter(
      country =>
        country.name.toLowerCase().includes(keyword) ||
        country.code.includes(keyword) ||
        country.display
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase()),
    );
  }, [searchQuery]);

  const selectCountry = useCallback(
    (country: CountryCode) => {
      onChange(country);
      closePicker();
    },
    [closePicker, onChange],
  );

  return (
    <>
      <Pressable
        accessibilityLabel={`选择地区号，当前${value.display}`}
        accessibilityRole="button"
        hitSlop={design.size(6)}
        onPress={() => {
          setSearchQuery('');
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          { paddingHorizontal: design.width(12), gap: design.width(6) },
          pressed && styles.pressed,
        ]}
        testID="country-code-trigger"
      >
        <Text style={[styles.triggerText, { fontSize: design.size(14) }]}>
          {value.display}
        </Text>
        <Text style={[styles.chevron, { fontSize: design.size(10) }]}>⌄</Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={closePicker}
        statusBarTranslucent
        transparent
        visible={open}
      >
        <View style={styles.modalRoot} testID="country-code-modal">
          <Pressable
            accessibilityLabel="关闭地区号选择"
            onPress={closePicker}
            style={StyleSheet.absoluteFill}
            testID="country-code-backdrop"
          />
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.sheet,
              {
                maxHeight: design.deviceHeight * 0.7,
                borderTopLeftRadius: design.size(20),
                borderTopRightRadius: design.size(20),
                paddingTop: design.height(16),
              },
            ]}
          >
            <Text
              style={[
                styles.title,
                {
                  fontSize: design.size(16),
                  lineHeight: design.size(22),
                  paddingHorizontal: design.width(20),
                  paddingBottom: design.height(12),
                },
              ]}
            >
              {t('选择国家或地区')}
            </Text>
            <TextInput
              accessibilityLabel="搜索国家、地区或区号"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setSearchQuery}
              placeholder={t('搜索国家、地区或区号')}
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              returnKeyType="search"
              style={[
                styles.searchInput,
                {
                  height: design.height(40),
                  marginHorizontal: design.width(20),
                  marginBottom: design.height(10),
                  borderRadius: design.size(8),
                  paddingHorizontal: design.width(12),
                  fontSize: design.size(14),
                },
              ]}
              testID="country-code-search"
              value={searchQuery}
            />
            <FlatList
              data={filteredCountries}
              initialNumToRender={16}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              keyExtractor={item => item.code}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.emptyText,
                    {
                      fontSize: design.size(13),
                      paddingVertical: design.height(30),
                    },
                  ]}
                  testID="country-code-empty"
                >
                  {t('没有匹配的国家或地区')}
                </Text>
              }
              maxToRenderPerBatch={16}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityLabel={`${item.name} ${item.display}`}
                  accessibilityRole="button"
                  onPress={() => selectCountry(item)}
                  style={({ pressed }) => [
                    styles.countryItem,
                    {
                      minHeight: design.height(46),
                      paddingHorizontal: design.width(20),
                    },
                    item.code === value.code && styles.selectedItem,
                    pressed && styles.pressed,
                  ]}
                  testID={`country-code-item-${item.code}`}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.countryName, { fontSize: design.size(14) }]}
                  >
                    {t(item.name)}
                  </Text>
                  <Text
                    style={[
                      styles.countryDisplay,
                      { fontSize: design.size(14) },
                    ]}
                  >
                    {item.display}
                  </Text>
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
              windowSize={7}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

export const CountryCodePicker = memo(CountryCodePickerComponent);

const styles = StyleSheet.create({
  trigger: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.35)',
  },
  triggerText: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  chevron: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: '#1C3947',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    fontWeight: '700',
    textAlign: 'center',
  },
  searchInput: {
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontFamily: 'PingFang SC',
    textAlign: 'center',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedItem: {
    backgroundColor: 'rgba(255, 149, 56, 0.15)',
  },
  countryName: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'PingFang SC',
  },
  countryDisplay: {
    color: 'rgba(255, 149, 56, 1)',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.65,
  },
});
