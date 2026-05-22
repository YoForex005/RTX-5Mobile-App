/**
 * Settings Feature UI: AboutScreen
 *
 * Reference-style app About screen with RTX5 identity, rating, guide, and
 * developer contact actions.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { AppLogo } from '../../ui/components/AppLogo';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { SidebarDrawer } from '../../ui/components/SidebarDrawer';
import {
  ABOUT_LINK_CHEVRON,
  ABOUT_STAR,
  makeAboutStyles,
  type AboutStyles,
} from './AboutScreen.styles';
import {
  ABOUT_ACTIONS,
  ABOUT_CONTACT_CATEGORIES,
  ABOUT_EXTERNAL_LINKS,
  buildDeveloperMailto,
  formatAboutPlatform,
  getAboutStoreTarget,
  resolveAboutBuildLabel,
  type AboutAction,
  type AboutContactCategory,
} from './aboutViewModel';

type ExpoAndroidConfig = {
  package?: string;
  versionCode?: number | string;
};

type ExpoIosConfig = {
  buildNumber?: number | string;
};

const RATING_STARS = [0, 1, 2, 3, 4] as const;
const ABOUT_BOTTOM_TABS = [
  { label: 'Quotes', icon: 'swap-vertical-outline', route: '/(tabs)/quotes', active: true },
  { label: 'Charts', icon: 'stats-chart-outline', route: '/(tabs)/chart', active: false },
  { label: 'Trade', icon: 'trending-up-outline', route: '/(tabs)/trade', active: false },
  { label: 'History', icon: 'time-outline', route: '/(tabs)/history', active: false },
  { label: 'Messages', icon: 'chatbubbles-outline', route: '/settings/mailbox', active: false },
] as const;

export function AboutScreen() {
  const router = useRouter();
  const isDark = useUserPreferences((s) => s.themeMode) === 'dark';
  const styles = useMemo(() => makeAboutStyles(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const menuIconColor = isDark ? '#F8FAFC' : '#050505';
  const bottomIconColor = isDark ? '#CBD5E1' : '#5C5552';
  const actionChevronColor = isDark ? '#64748B' : ABOUT_LINK_CHEVRON;
  const androidConfig = Constants.expoConfig?.android as ExpoAndroidConfig | undefined;
  const iosConfig = Constants.expoConfig?.ios as ExpoIosConfig | undefined;
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const appVersion = Constants.expoConfig?.version ?? 'Local';
  const androidPackageName = androidConfig?.package ?? ABOUT_EXTERNAL_LINKS.androidPackageName;
  const buildLabel = resolveAboutBuildLabel({
    platform: Platform.OS,
    appVersion,
    androidVersionCode: androidConfig?.versionCode,
    iosBuildNumber: iosConfig?.buildNumber,
  });
  const platformLabel = formatAboutPlatform(Platform.OS);
  const [contactOpen, setContactOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [selectedContactCategory, setSelectedContactCategory] = useState<AboutContactCategory | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactConsent, setContactConsent] = useState(false);

  const handleOpenMenu = useCallback(() => {
    hideActionSheet();
    setSidebarOpen(true);
  }, [hideActionSheet, setSidebarOpen]);

  const openExternalUrl = async (url: string, failureTitle: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(failureTitle, 'No installed app can open this link on the current device.');
    }
  };

  const handleRateExperience = async () => {
    const target = getAboutStoreTarget(Platform.OS, {
      ...ABOUT_EXTERNAL_LINKS,
      androidPackageName,
      iosAppStoreId: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID,
    });

    try {
      await Linking.openURL(target.primaryUrl);
    } catch {
      try {
        await Linking.openURL(target.fallbackUrl);
      } catch {
        Alert.alert(`Open ${target.storeLabel}`, 'The store listing could not be opened on this device.');
      }
    }
  };

  const handleAboutAction = (action: AboutAction) => {
    switch (action.id) {
      case 'rate-experience':
        void handleRateExperience();
        return;
      case 'user-guide':
        router.push('/settings/user-guide');
        return;
      case 'contact-developer':
        setContactOpen(true);
        return;
    }
  };

  const handleSendDeveloperMessage = () => {
    const mailtoUrl = buildDeveloperMailto({
      appName,
      appVersion,
      platform: platformLabel,
      category: selectedContactCategory,
      requesterName: contactName,
      requesterEmail: contactEmail,
      title: contactTitle,
      message: contactMessage,
      developerEmail: process.env.EXPO_PUBLIC_DEVELOPER_EMAIL ?? ABOUT_EXTERNAL_LINKS.developerEmail,
    });

    void openExternalUrl(mailtoUrl, 'Contact Developer');
  };

  if (contactOpen) {
    return (
      <ContactDeveloperScreen
        appName={appName}
        appVersion={appVersion}
        name={contactName}
        email={contactEmail}
        title={contactTitle}
        message={contactMessage}
        consentAccepted={contactConsent}
        selectedCategory={selectedContactCategory}
        categorySheetOpen={categorySheetOpen}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isDark={isDark}
        onChangeName={setContactName}
        onChangeEmail={setContactEmail}
        onChangeTitle={setContactTitle}
        onChangeMessage={setContactMessage}
        onToggleConsent={() => setContactConsent((value) => !value)}
        onOpenCategorySheet={() => setCategorySheetOpen(true)}
        onCloseCategorySheet={() => setCategorySheetOpen(false)}
        onSelectCategory={(category) => {
          setSelectedContactCategory(category);
          setCategorySheetOpen(false);
        }}
        onOpenPrivacyPolicy={() => {
          void openExternalUrl(
            process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? ABOUT_EXTERNAL_LINKS.privacyPolicyUrl,
            'Open Privacy Policy',
          );
        }}
        onClose={() => {
          setCategorySheetOpen(false);
          setContactOpen(false);
        }}
        onSend={handleSendDeveloperMessage}
        styles={styles}
      />
    );
  }

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 6 }]}>
        <FastPressable
          onPress={handleOpenMenu}
          latencyLabel="about.menu"
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={32} color={menuIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>About</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.identity}>
          <AppLogo style={styles.logo} />
          <AppNameMark appName={appName} styles={styles} />
          <Text style={styles.buildLabel} numberOfLines={1}>{buildLabel}</Text>
        </View>

        <View style={styles.actions}>
          {ABOUT_ACTIONS.map((action) => (
            <AboutActionRow
              key={action.id}
              action={action}
              onPress={() => handleAboutAction(action)}
              styles={styles}
              chevronColor={actionChevronColor}
            />
          ))}
        </View>
      </View>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {ABOUT_BOTTOM_TABS.map((tab) => (
          <FastPressable
            key={tab.label}
            onPress={() => router.push(tab.route)}
            latencyLabel={`about.bottomNav.${tab.label}`}
            style={({ pressed }) => [styles.bottomTab, pressed && styles.bottomTabPressed]}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
          >
            <View style={[styles.bottomIconWrap, tab.active && styles.bottomIconWrapActive]}>
              <Ionicons name={tab.icon} size={26} color={bottomIconColor} />
            </View>
            <Text style={[styles.bottomLabel, tab.active && styles.bottomLabelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </FastPressable>
        ))}
      </View>

      <SidebarDrawer />
    </Screen>
  );
}

function AppNameMark({ appName, styles }: { appName: string; styles: AboutStyles }) {
  const accentMatch = appName.match(/^(.*?)(5)$/);

  if (!accentMatch) {
    return <Text style={styles.appName} numberOfLines={1}>{appName}</Text>;
  }

  return (
    <Text style={styles.appName} numberOfLines={1}>
      {accentMatch[1]}
      <Text style={styles.appNameAccent}>{accentMatch[2]}</Text>
    </Text>
  );
}

function AboutActionRow({
  action,
  onPress,
  styles,
  chevronColor,
}: {
  action: AboutAction;
  onPress: () => void;
  styles: AboutStyles;
  chevronColor: string;
}) {
  const isRating = action.id === 'rate-experience';

  return (
    <FastPressable
      onPress={onPress}
      latencyLabel={`about.${action.id}`}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <Text style={styles.actionLabel} numberOfLines={1}>{action.title}</Text>
      {isRating ? (
        <View style={styles.stars} pointerEvents="none">
          {RATING_STARS.map((star) => (
            <Ionicons key={star} name="star" size={30} color={ABOUT_STAR} />
          ))}
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={30} color={chevronColor} />
      )}
    </FastPressable>
  );
}

function ContactDeveloperScreen({
  appName,
  appVersion,
  name,
  email,
  title,
  message,
  consentAccepted,
  selectedCategory,
  categorySheetOpen,
  insetsTop,
  insetsBottom,
  isDark,
  onChangeName,
  onChangeEmail,
  onChangeTitle,
  onChangeMessage,
  onToggleConsent,
  onOpenCategorySheet,
  onCloseCategorySheet,
  onSelectCategory,
  onOpenPrivacyPolicy,
  onClose,
  onSend,
  styles,
}: {
  appName: string;
  appVersion: string;
  name: string;
  email: string;
  title: string;
  message: string;
  consentAccepted: boolean;
  selectedCategory: AboutContactCategory | null;
  categorySheetOpen: boolean;
  insetsTop: number;
  insetsBottom: number;
  isDark: boolean;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onChangeMessage: (value: string) => void;
  onToggleConsent: () => void;
  onOpenCategorySheet: () => void;
  onCloseCategorySheet: () => void;
  onSelectCategory: (category: AboutContactCategory) => void;
  onOpenPrivacyPolicy: () => void;
  onClose: () => void;
  onSend: () => void;
  styles: AboutStyles;
}) {
  const iconColor = isDark ? '#F8FAFC' : '#050505';
  const supportIconColor = isDark ? '#94A3B8' : '#64748B';
  const placeholderColor = isDark ? '#64748B' : '#9CA3AF';
  const categoryChevronColor = isDark ? '#CBD5E1' : '#7B7B7B';
  const categoryCheckColor = isDark ? '#60A5FA' : '#2563EB';
  const canSend =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    selectedCategory !== null &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    consentAccepted;

  return (
    <Screen noBottomInset style={styles.contactScreen}>
      <View style={[styles.contactPageHeader, { paddingTop: Math.max(insetsTop, 0) + 14 }]}>
        <FastPressable
          onPressIn={onClose}
          latencyLabel="about.contact.back"
          hitSlop={12}
          style={styles.contactBackButton}
          accessibilityRole="button"
          accessibilityLabel="Back to About"
        >
          <Ionicons name="arrow-back" size={30} color={iconColor} />
        </FastPressable>
        <Text style={styles.contactPageTitle} numberOfLines={1}>Contact Developer</Text>
      </View>

      <View style={styles.contactPageBody}>
        <ScrollView
          canCancelContentTouches={false}
          style={styles.contactFormScroll}
          contentContainerStyle={styles.contactFormContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contactHeroCard}>
            <AppLogo style={styles.contactHeroLogo} />
            <View style={styles.contactHeroCopy}>
              <Text style={styles.contactHeroTitle} numberOfLines={1}>{appName} support</Text>
              <Text style={styles.contactHeroText}>
                Send a structured request to the developer team. Include the area, title, and details so the issue can be reviewed clearly.
              </Text>
              <Text style={styles.contactHeroMeta} numberOfLines={1}>App version {appVersion}</Text>
            </View>
          </View>

          <LineTextInput
            label="Your Name"
            value={name}
            onChangeText={onChangeName}
            placeholder="Enter your full name"
            icon="person-outline"
            keyboardType="default"
            iconColor={supportIconColor}
            placeholderColor={placeholderColor}
            styles={styles}
          />
          <LineTextInput
            label="Your Email"
            value={email}
            onChangeText={onChangeEmail}
            placeholder="Enter your email address"
            icon="mail-outline"
            keyboardType="email-address"
            iconColor={supportIconColor}
            placeholderColor={placeholderColor}
            styles={styles}
          />

          <View style={styles.formField}>
            <Text style={styles.formFieldLabel}>Category</Text>
            <FastPressable
              onPress={onOpenCategorySheet}
              latencyLabel="about.contact.category.open"
              style={({ pressed }) => [styles.categorySelectCard, pressed && styles.contactLinePressed]}
              accessibilityRole="button"
              accessibilityLabel="Select category"
            >
              <View style={styles.categorySelectCopy}>
                <Text style={styles.categorySelectValue} numberOfLines={1}>
                  {selectedCategory?.label ?? 'Select Category'}
                </Text>
                <Text style={styles.categorySelectHint} numberOfLines={1}>
                  {selectedCategory?.subtitle ?? 'Choose the closest request type'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={27} color={categoryChevronColor} />
            </FastPressable>
            {categorySheetOpen ? (
              <ContactCategoryDropdown
                selectedCategory={selectedCategory}
                onSelect={onSelectCategory}
                onClose={onCloseCategorySheet}
                checkColor={categoryCheckColor}
                styles={styles}
              />
            ) : null}
          </View>

          <LineTextInput
            label="Title"
            value={title}
            onChangeText={onChangeTitle}
            placeholder="Short summary"
            icon="create-outline"
            keyboardType="default"
            iconColor={supportIconColor}
            placeholderColor={placeholderColor}
            styles={styles}
          />

          <View style={styles.formField}>
            <Text style={styles.formFieldLabel}>Details</Text>
            <TextInput
              value={message}
              onChangeText={onChangeMessage}
              placeholder="Describe your problem in detail here"
              placeholderTextColor={placeholderColor}
              style={styles.problemInput}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.consentBlock}>
            <Text style={styles.consentText}>
              I agree to the processing of my personal data by RTX5 for request handling purposes.
            </Text>
            <FastPressable
              onPress={onToggleConsent}
              latencyLabel="about.contact.consent"
              hitSlop={12}
              style={styles.checkbox}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consentAccepted }}
              accessibilityLabel="Agree to personal data processing"
            >
              {consentAccepted ? <Ionicons name="checkmark" size={22} color={iconColor} /> : null}
            </FastPressable>
          </View>

          <View style={styles.privacyRow}>
            <Text style={styles.privacyText}>Please have a look at our </Text>
            <FastPressable
              onPress={onOpenPrivacyPolicy}
              latencyLabel="about.contact.privacy"
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
            >
              <Text style={styles.privacyLink}>Privacy Policy</Text>
            </FastPressable>
          </View>
        </ScrollView>

      </View>

      <View style={[styles.contactPageFooter, { paddingBottom: Math.max(insetsBottom, 8) + 6 }]}>
        <Text style={styles.contactDisclaimer}>
          RTX5 is a software application and does not provide any financial, investment, brokerage or trading services.
        </Text>
        <FastPressable
          onPress={canSend ? onSend : undefined}
          disabled={!canSend}
          latencyLabel="about.contact.send"
          style={[styles.contactSendButton, canSend && styles.contactSendButtonEnabled]}
          accessibilityRole="button"
          accessibilityLabel="Send developer support request"
          accessibilityState={{ disabled: !canSend }}
        >
          <Text style={[styles.contactSendText, canSend && styles.contactSendTextEnabled]}>SEND</Text>
        </FastPressable>
      </View>

      <SidebarDrawer />
    </Screen>
  );
}

function LineTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  keyboardType,
  iconColor,
  placeholderColor,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType: 'default' | 'email-address';
  iconColor: string;
  placeholderColor: string;
  styles: AboutStyles;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formFieldLabel}>{label}</Text>
      <View style={styles.textFieldCard}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          style={styles.lineInput}
        />
      </View>
    </View>
  );
}

function ContactCategoryDropdown({
  selectedCategory,
  onSelect,
  onClose,
  checkColor,
  styles,
}: {
  selectedCategory: AboutContactCategory | null;
  onSelect: (category: AboutContactCategory) => void;
  onClose: () => void;
  checkColor: string;
  styles: AboutStyles;
}) {
  return (
    <View style={styles.inlineCategoryDropdown}>
      <CategoryDropdownRow
        label="Select Category"
        selected={selectedCategory === null}
        onPress={onClose}
        checkColor={checkColor}
        styles={styles}
      />
      {ABOUT_CONTACT_CATEGORIES.map((category) => (
        <CategoryDropdownRow
          key={category.id}
          label={category.label}
          selected={category.id === selectedCategory?.id}
          onPress={() => onSelect(category)}
          checkColor={checkColor}
          styles={styles}
        />
      ))}
    </View>
  );
}

function CategoryDropdownRow({
  label,
  selected,
  onPress,
  checkColor,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  checkColor: string;
  styles: AboutStyles;
}) {
  return (
    <FastPressable
      onPress={onPress}
      latencyLabel={`about.contact.category.${label}`}
      style={({ pressed }) => [styles.inlineCategoryOption, pressed && styles.contactLinePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.inlineCategoryText, selected && styles.inlineCategoryTextSelected]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark-circle" size={18} color={checkColor} /> : null}
    </FastPressable>
  );
}
