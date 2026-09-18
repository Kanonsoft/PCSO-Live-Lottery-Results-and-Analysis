import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { Alert, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { SettingsPage } from '@/components/settings-page';
import { ADS_ENABLED_FOR_BUILD } from '@/config/ads';
import { useGuardedNavigation } from '@/lib/use-guarded-navigation';
import { useResultReminders } from '@/providers/notifications-context';
import {
  useAppTheme,
  usePreferences,
  type AppThemeColors,
} from '@/providers/preferences-provider';
import { usePurchases } from '@/providers/purchases-context';
import { radius, spacing } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  last = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  right?: ReactNode;
  last?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && styles.pressed,
      ]}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {right ?? <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const { navigate } = useGuardedNavigation();
  const {
    isDark,
    toggleDarkMode,
    enabledGames,
    ready: preferencesReady,
  } = usePreferences();
  const {
    adsRemoved,
    ready: purchasesReady,
    status: purchaseStatus,
    storePrice,
  } = usePurchases();
  const {
    available: remindersAvailable,
    status: reminderStatus,
    enableReminders,
    disableReminders,
    openNotificationSettings,
  } = useResultReminders();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const remindersEnabled = reminderStatus === 'scheduled';
  const remindersReady = reminderStatus !== 'loading';

  const updateReminders = async (enabled: boolean) => {
    if (!enabled) {
      await disableReminders();
      return;
    }

    const result = await enableReminders();
    if (result.granted) return;

    Alert.alert(
      'Notifications are off',
      result.canAskAgain
        ? 'Allow notifications to receive the daily result reminders.'
        : 'Enable notifications for this app in your device settings.',
      result.canAskAgain
        ? [{ text: 'OK' }]
        : [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void openNotificationSettings() },
          ],
    );
  };

  const reminderSubtitle = !remindersAvailable
    ? 'Available in the installed mobile app'
    : reminderStatus === 'loading'
      ? 'Updating reminder schedule...'
      : reminderStatus === 'scheduled'
        ? 'Daily at 3 PM, 5 PM, and 9 PM'
        : reminderStatus === 'denied'
          ? 'Notification permission is off'
          : reminderStatus === 'error'
            ? 'Could not update reminders'
            : 'Off';

  const showRatingUnavailable = () => {
    Alert.alert(
      'Rating is not available yet',
      'PCSO Lotto Results & Analysis does not have an App Store or Google Play listing yet. Rating can be enabled after the app is published.',
    );
  };

  const shareApp = async () => {
    try {
      await Share.share({
        title: 'PCSO Lotto Results & Analysis',
        message:
          'PCSO Lotto Results & Analysis helps you browse Philippine lottery results, save and check picks, and explore draw-history statistics. For ages 18+; play responsibly.',
      });
    } catch {
      Alert.alert('Unable to share', 'The device share sheet could not be opened.');
    }
  };

  return (
    <SettingsPage inTabs title="Settings">
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons
              name={isDark ? 'moon' : 'moon-outline'}
              size={20}
              color={colors.primary}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>Dark mode</Text>
            <Text style={styles.rowSubtitle}>
              {preferencesReady ? (isDark ? 'Using the dark appearance' : 'Using the light appearance') : 'Loading saved preference…'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Dark mode"
            accessibilityHint="Changes the app appearance"
            accessibilityState={{ disabled: !preferencesReady, checked: isDark }}
            disabled={!preferencesReady}
            ios_backgroundColor={colors.border}
            onValueChange={() => toggleDarkMode()}
            thumbColor="#FFFFFF"
            trackColor={{ false: colors.border, true: colors.primary }}
            value={isDark}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons
              name={remindersEnabled ? 'notifications' : 'notifications-outline'}
              size={20}
              color={colors.primary}
            />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>Result reminders</Text>
            <Text style={styles.rowSubtitle}>{reminderSubtitle}</Text>
          </View>
          <Switch
            accessibilityLabel="Daily result reminders"
            accessibilityHint="Notifies you daily at 3 PM, 5 PM, and 9 PM"
            accessibilityState={{
              disabled: !remindersAvailable || !remindersReady,
              checked: remindersEnabled,
            }}
            disabled={!remindersAvailable || !remindersReady}
            ios_backgroundColor={colors.border}
            onValueChange={(enabled) => void updateReminders(enabled)}
            thumbColor="#FFFFFF"
            trackColor={{ false: colors.border, true: colors.primary }}
            value={remindersEnabled}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>App settings and information</Text>
        <SettingsRow
          icon="warning-outline"
          title="Disclaimer"
          subtitle="Odds, result verification, and responsible play"
          onPress={() => navigate({ pathname: '/settings-detail', params: { section: 'disclaimer' } })}
        />
        <SettingsRow
          icon="options-outline"
          title="My Games"
          subtitle={`${enabledGames.length} of 9 games shown in Results`}
          onPress={() => navigate('/my-games')}
        />
        {ADS_ENABLED_FOR_BUILD ? (
          <SettingsRow
            icon="remove-circle-outline"
            title="Remove ads"
            subtitle={
              adsRemoved
                ? 'Ad-free purchase active'
                : !purchasesReady
                  ? 'Checking Google Play…'
                  : purchaseStatus === 'pending'
                    ? 'Payment confirmation pending'
                    : `One-time purchase${storePrice ? ` · ${storePrice}` : ' · ₱49'}`
            }
            onPress={() => navigate({ pathname: '/settings-detail', params: { section: 'remove-ads' } })}
          />
        ) : null}
        <SettingsRow
          icon="star-outline"
          title="Rate this app"
          subtitle="Available after an app-store release"
          onPress={showRatingUnavailable}
        />
        <SettingsRow
          icon="share-social-outline"
          title="Share this app"
          subtitle="Open your device's share sheet"
          onPress={() => void shareApp()}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title="Privacy policy"
          subtitle="How the app and its providers handle data"
          onPress={() => navigate({ pathname: '/settings-detail', params: { section: 'privacy' } })}
        />
        <SettingsRow
          last
          icon="information-circle-outline"
          title="About app and licenses"
          subtitle="Version, data source, and open-source notices"
          onPress={() => navigate({ pathname: '/settings-detail', params: { section: 'about' } })}
        />
      </View>

    </SettingsPage>
  );
}

function makeStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    card: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    sectionLabel: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    row: {
      minHeight: 68,
      marginHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    toggleRow: {
      minHeight: 68,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    iconBox: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
    rowSubtitle: { marginTop: 2, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
    pressed: { opacity: 0.64, backgroundColor: colors.surfaceAlt },
  });
}
