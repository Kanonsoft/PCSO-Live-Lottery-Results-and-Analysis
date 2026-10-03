import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AdsProvider } from '@/providers/ads-provider';
import { DrawsProvider } from '@/providers/draws-provider';
import { ResultRemindersProvider } from '@/providers/notifications-provider';
import { PreferencesProvider, useAppTheme } from '@/providers/preferences-provider';
import { PurchasesProvider } from '@/providers/purchases-provider';

function AppNavigator() {
  const { colors, isDark } = useAppTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <PurchasesProvider>
        <ResultRemindersProvider>
          <AdsProvider>
            <DrawsProvider>
              <AppNavigator />
            </DrawsProvider>
          </AdsProvider>
        </ResultRemindersProvider>
      </PurchasesProvider>
    </PreferencesProvider>
  );
}
