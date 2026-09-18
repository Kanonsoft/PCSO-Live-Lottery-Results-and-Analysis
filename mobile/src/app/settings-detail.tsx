import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { SettingsPage } from '@/components/settings-page';
import { ADS_ENABLED_FOR_BUILD } from '@/config/ads';
import { useAds } from '@/providers/ads-context';
import {
  useAppTheme,
  type AppThemeColors,
} from '@/providers/preferences-provider';
import { usePurchases } from '@/providers/purchases-context';
import { radius, spacing } from '@/theme/tokens';

type DetailSection = 'disclaimer' | 'remove-ads' | 'privacy' | 'about';
const PRIVACY_POLICY_URL =
  'https://kanonsoft.github.io/PCSO-Live-Lottery-Results-and-Analysis/privacy/';

const TITLES: Readonly<Record<DetailSection, string>> = {
  disclaimer: 'Disclaimer',
  'remove-ads': 'Remove ads',
  privacy: 'Privacy policy',
  about: 'About and licenses',
};

function isDetailSection(value: string | undefined): value is DetailSection {
  return value === 'disclaimer' || value === 'remove-ads' || value === 'privacy' || value === 'about';
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function DisclaimerContent() {
  return (
    <>
      <InfoCard title="Informational use only">
        <Paragraph>
          PCSO Lotto Results & Analysis is an independent companion for viewing lottery history, checking entered combinations, and exploring descriptive statistics. Despite its name, it is not affiliated with or endorsed by the Philippine Charity Sweepstakes Office (PCSO).
        </Paragraph>
        <Paragraph>
          Results shown in the app may be delayed, incomplete, or incorrect. They are not official ticket validation. Always keep the original ticket and verify results, play type, claim rules, and deadlines directly with PCSO.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Statistics do not predict a draw">
        <Bullet>Lottery draws are random. Hot, cold, frequency, gap, pair, and trend summaries only describe selected historical records.</Bullet>
        <Bullet>Every valid combination has the same theoretical chance in a fair draw. A generated combination is not more likely to win.</Bullet>
        <Bullet>No analysis, candidate, or cross-check in this app guarantees a prize or financial return.</Bullet>
      </InfoCard>
      <InfoCard title="Play responsibly">
        <Bullet>Lottery play is for adults aged 18 and older.</Bullet>
        <Bullet>Set a firm entertainment budget and time limit. Never borrow money or chase losses.</Bullet>
        <Bullet>If play is causing stress, secrecy, debt, or conflict, stop and seek support from someone you trust or an appropriate professional service.</Bullet>
      </InfoCard>
    </>
  );
}

function RemoveAdsContent() {
  const { colors } = useAppTheme();
  const {
    adsRemoved,
    canPurchase,
    message,
    purchasing,
    ready,
    restoring,
    status,
    storePrice,
    purchaseRemoveAds,
    restoreRemoveAds,
  } = usePurchases();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayedPrice = storePrice ?? '₱49';
  const purchaseLabel = adsRemoved
    ? 'Ads removed'
    : purchasing
      ? 'Opening Google Play…'
      : `Remove ads · ${displayedPrice}`;

  return (
    <>
      <InfoCard title={adsRemoved ? 'Ad-free access is active' : 'One-time ad-free upgrade'}>
        <Paragraph>
          {adsRemoved
            ? 'Banner, card, bottom-anchored, and full-screen advertisements are removed throughout the app.'
            : `Pay ${displayedPrice} once through Google Play to permanently remove banner, card, bottom-anchored, and full-screen advertisements. This is not a subscription.`}
        </Paragraph>
        <Paragraph>
          The final localized price and payment method are shown by Google Play before you confirm. The purchase belongs to the Google account used at checkout and can be restored after reinstalling the app.
        </Paragraph>
      </InfoCard>
      <View style={styles.preferenceCard}>
        <View style={styles.preferenceCopy}>
          <Text style={styles.preferenceTitle}>
            {adsRemoved ? 'Thank you for supporting the app' : 'Lifetime ad removal'}
          </Text>
          <Text style={styles.preferenceText}>
            {!ready
              ? 'Checking Google Play…'
              : adsRemoved
                ? 'Google Play purchase active'
                : status === 'pending'
                  ? 'Waiting for payment confirmation'
                  : 'One payment, no recurring charge'}
          </Text>
        </View>
      </View>
      <ActionButton
        accessibilityLabel={adsRemoved ? 'Advertisements removed' : `Remove ads for ${displayedPrice}`}
        disabled={!canPurchase || adsRemoved}
        icon={adsRemoved ? 'checkmark-circle' : 'card-outline'}
        label={purchaseLabel}
        onPress={() => void purchaseRemoveAds()}
        style={styles.purchaseButton}
      />
      {!adsRemoved ? (
        <ActionButton
          disabled={!ready || purchasing || restoring}
          icon="refresh-outline"
          label={restoring ? 'Checking purchases…' : 'Restore purchase'}
          onPress={() => void restoreRemoveAds()}
          style={styles.purchaseButton}
          variant="secondary"
        />
      ) : null}
      <Text style={styles.note}>
        {message ?? 'Google Play handles payment information. The app does not receive your card or wallet details.'}
      </Text>
    </>
  );
}

function PrivacyContent() {
  const { privacyOptionsRequired, showPrivacyOptions } = useAds();

  return (
    <>
      <InfoCard title="Published privacy policy">
        <Paragraph>
          Read the complete policy on the public GitHub Pages site. It covers local app data, lottery-result requests, advertising, purchases, and notifications.
        </Paragraph>
      </InfoCard>
      <ActionButton
        icon="open-outline"
        label="Open full privacy policy"
        onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
      />
      {privacyOptionsRequired ? (
        <ActionButton
          icon="options-outline"
          label="Manage ad privacy"
          onPress={() => void showPrivacyOptions()}
          variant="secondary"
        />
      ) : null}
      <InfoCard title="Data kept on your device">
        <Bullet>Saved lottery picks and their play settings.</Bullet>
        <Bullet>Appearance, selected-game, result-reminder, and cached ad-free entitlement state.</Bullet>
        <Bullet>Cached result records and the last successful result refresh time.</Bullet>
        <Paragraph>
          These records use the app’s local device storage. The current app does not create an account or send saved picks and preferences to a developer-operated server.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Result reminders">
        <Paragraph>
          If enabled, the app asks for notification permission and schedules local reminders on your device at 3 PM, 5 PM, and 9 PM each day. These reminders do not use a push token or a developer-operated notification server. Your device controls permission and delivery timing.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Network requests">
        <Paragraph>
          The app contacts the LottoMatik PCSO result service to refresh published lottery data when the app starts, returns to the foreground, and around scheduled publication windows. That service and your network provider may receive ordinary connection information, such as an IP address, under their own practices.
        </Paragraph>
        <Paragraph>
          Sharing the app happens only after you choose Share this app and is handled by your device’s share sheet.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Advertising">
        <Paragraph>
          The app uses Google Mobile Ads to request, display, and measure advertisements. Google and its advertising partners may receive ordinary connection and device information such as your IP address, device or advertising identifiers, app interactions, diagnostics, and ad impressions or clicks, subject to your consent choices, device settings, location, and their own privacy practices.
        </Paragraph>
        <Paragraph>
          Where required, the app asks for an advertising consent choice before requesting ads. A verified Google Play ad-free purchase prevents future ad requests, though data already sent by a previously loaded ad cannot be recalled.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Payments">
        <Paragraph>
          Google Play processes the optional one-time Remove ads purchase. The app receives product, purchase-status, and entitlement information needed to complete and restore that purchase, but does not receive your full payment-card or wallet details.
        </Paragraph>
        <Bullet>No subscription or recurring charge.</Bullet>
        <Bullet>No developer-operated user account or payment processor.</Bullet>
      </InfoCard>
      <InfoCard title="Other services not included now">
        <Bullet>No developer-added analytics or user account system.</Bullet>
        <Bullet>No request for contacts, location, camera, microphone, or photo-library access.</Bullet>
      </InfoCard>
      <InfoCard title="Your choices">
        <Paragraph>
          You can edit or delete saved picks in the app. You can remove all locally stored app data through your device’s app-storage settings or by uninstalling the app. The public policy includes the current privacy contact method.
        </Paragraph>
      </InfoCard>
    </>
  );
}

function AboutContent() {
  const version = Constants.expoConfig?.version ?? '0.1.0';
  return (
    <>
      <InfoCard title={`PCSO Lotto Results & Analysis · Version ${version}`}>
        <Paragraph>
          A React Native and Expo companion for browsing Philippine lottery results, checking saved picks, and understanding descriptive draw-history statistics.
        </Paragraph>
        <Paragraph>
          Live refreshes use the LottoMatik PCSO result endpoint, with a bundled archive for offline use. Lottery names, marks, and result data remain the property of their respective owners. PCSO Lotto Results & Analysis is not an official PCSO product.
        </Paragraph>
      </InfoCard>
      <InfoCard title="Key open-source licenses">
        <Bullet>Expo and Expo modules — MIT License</Bullet>
        <Bullet>React and React Native — MIT License</Bullet>
        <Bullet>Expo Router — MIT License</Bullet>
        <Bullet>React Native Async Storage — MIT License</Bullet>
        <Bullet>React Native Google Mobile Ads — Apache License 2.0</Bullet>
        <Bullet>Expo IAP and OpenIAP — MIT License</Bullet>
        <Bullet>Expo Notifications — MIT License</Bullet>
        <Bullet>Ionicons and Expo Vector Icons — MIT License</Bullet>
        <Paragraph>
          This is a concise notice for key direct dependencies, not a complete replacement for the copyright and license texts distributed with each package and its transitive dependencies.
        </Paragraph>
      </InfoCard>
    </>
  );
}

export default function SettingsDetailScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const requestedSection: DetailSection = isDetailSection(rawSection) ? rawSection : 'about';
  const section: DetailSection =
    requestedSection === 'remove-ads' && !ADS_ENABLED_FOR_BUILD
      ? 'about'
      : requestedSection;

  return (
    <SettingsPage
      backLabel="Back to Settings"
      eyebrow="SETTINGS"
      onBack={() => router.back()}
      title={TITLES[section]}>
      {section === 'disclaimer' ? <DisclaimerContent /> : null}
      {section === 'remove-ads' ? <RemoveAdsContent /> : null}
      {section === 'privacy' ? <PrivacyContent /> : null}
      {section === 'about' ? <AboutContent /> : null}
    </SettingsPage>
  );
}

function makeStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    cardTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    paragraph: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    bulletDot: {
      width: 6,
      height: 6,
      marginTop: 7,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
    },
    bulletText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 19 },
    preferenceCard: {
      minHeight: 76,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
    },
    preferenceCopy: { flex: 1, minWidth: 0 },
    preferenceTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
    preferenceText: { marginTop: 3, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
    purchaseButton: { width: '100%' },
    note: {
      paddingHorizontal: spacing.sm,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
}
