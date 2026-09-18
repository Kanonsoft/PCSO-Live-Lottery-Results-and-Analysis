import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import { ADS_ENABLED_FOR_BUILD } from '@/config/ads';
import { AdsContext, type AdsContextValue } from '@/providers/ads-context';
import { usePurchases } from '@/providers/purchases-context';

interface NativeAdsState {
  readonly ready: boolean;
  readonly canRequestAds: boolean;
  readonly privacyOptionsRequired: boolean;
}

const INITIAL_STATE: NativeAdsState = {
  ready: false,
  canRequestAds: false,
  privacyOptionsRequired: false,
};

function privacyOptionsAreRequired(info: AdsConsentInfo): boolean {
  return (
    info.privacyOptionsRequirementStatus ===
    AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  );
}

/**
 * Native provider that refreshes UMP consent on every cold app launch. It has
 * no loading UI of its own, so app content remains available while consent and
 * SDK initialization complete.
 */
export function AdsProvider({ children }: PropsWithChildren) {
  const { adsRemoved, ready: purchasesReady } = usePurchases();
  const netInfo = useNetInfo();
  const [state, setState] = useState<NativeAdsState>(INITIAL_STATE);
  const initializationPromise = useRef<Promise<unknown> | null>(null);
  const isOnline =
    netInfo.isConnected === true && netInfo.isInternetReachable !== false;

  useEffect(() => {
    if (!ADS_ENABLED_FOR_BUILD) return;
    if (!purchasesReady) return;
    if (adsRemoved) return;
    if (!isOnline) return;

    let active = true;

    const startMobileAdsWhenPermitted = async (): Promise<boolean> => {
      const consentInfo = await AdsConsent.getConsentInfo();
      if (active) {
        setState((current) => ({
          ...current,
          privacyOptionsRequired: privacyOptionsAreRequired(consentInfo),
        }));
      }
      if (!consentInfo.canRequestAds) return false;

      if (!initializationPromise.current) {
        initializationPromise.current = mobileAds()
          .initialize()
          .catch((error) => {
            initializationPromise.current = null;
            throw error;
          });
      }
      await initializationPromise.current;

      if (active) {
        setState((current) => ({
          ...current,
          ready: true,
          canRequestAds: true,
        }));
      }
      return true;
    };

    // A previous-session consent decision may allow SDK initialization while
    // UMP obtains the mandatory fresh launch-time consent status.
    void startMobileAdsWhenPermitted().catch(() => false);

    void AdsConsent.gatherConsent()
      .catch(() => {
        // UMP may still allow ads using the consent state from the last launch.
      })
      .then(() => startMobileAdsWhenPermitted())
      .then((started) => {
        if (active && !started) {
          setState((current) => ({
            ...current,
            ready: true,
            canRequestAds: false,
          }));
        }
      })
      .catch(() => {
        if (active) {
          setState((current) => ({
            ...current,
            ready: true,
            canRequestAds: false,
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [adsRemoved, isOnline, purchasesReady]);

  const showPrivacyOptions = useCallback(async (): Promise<boolean> => {
    if (!ADS_ENABLED_FOR_BUILD) return false;
    try {
      const consentInfo = await AdsConsent.showPrivacyOptionsForm();
      setState((current) => ({
        ...current,
        canRequestAds: consentInfo.canRequestAds,
        privacyOptionsRequired: privacyOptionsAreRequired(consentInfo),
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AdsContextValue>(
    () => ({
      ready:
        !ADS_ENABLED_FOR_BUILD ||
        (purchasesReady && (adsRemoved || state.ready)),
      canRequestAds:
        ADS_ENABLED_FOR_BUILD &&
        isOnline &&
        !adsRemoved &&
        state.canRequestAds,
      adsEnabled:
        ADS_ENABLED_FOR_BUILD &&
        isOnline &&
        purchasesReady &&
        state.ready &&
        state.canRequestAds &&
        !adsRemoved,
      privacyOptionsRequired:
        ADS_ENABLED_FOR_BUILD && state.privacyOptionsRequired,
      showPrivacyOptions,
    }),
    [
      adsRemoved,
      isOnline,
      purchasesReady,
      showPrivacyOptions,
      state.canRequestAds,
      state.privacyOptionsRequired,
      state.ready,
    ],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
