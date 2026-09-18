import { useNetInfo } from '@react-native-community/netinfo';
import { useMemo, type PropsWithChildren } from 'react';

import { ADS_ENABLED_FOR_BUILD } from '@/config/ads';
import { AdsContext, type AdsContextValue } from '@/providers/ads-context';
import { usePurchases } from '@/providers/purchases-context';

/**
 * Web and non-native fallback. It keeps localhost usable without importing the
 * native Google Mobile Ads module; ad components render labelled previews.
 */
export function AdsProvider({ children }: PropsWithChildren) {
  const { adsRemoved, ready: purchasesReady } = usePurchases();
  const netInfo = useNetInfo();
  const isOnline =
    netInfo.isConnected === true && netInfo.isInternetReachable !== false;
  const value = useMemo<AdsContextValue>(
    () => ({
      ready: !ADS_ENABLED_FOR_BUILD || purchasesReady,
      canRequestAds: ADS_ENABLED_FOR_BUILD && isOnline && !adsRemoved,
      adsEnabled:
        ADS_ENABLED_FOR_BUILD && isOnline && purchasesReady && !adsRemoved,
      privacyOptionsRequired: false,
      showPrivacyOptions: async () => false,
    }),
    [adsRemoved, isOnline, purchasesReady],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
