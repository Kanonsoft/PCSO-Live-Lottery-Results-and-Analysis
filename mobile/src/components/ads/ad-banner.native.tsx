import { useEffect, useState } from 'react';
import {
  InteractionManager,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';

import { useAds } from '@/providers/ads-context';
import { useAppTheme } from '@/providers/preferences-provider';

export interface BannerAdProps {
  readonly style?: StyleProp<ViewStyle>;
}

interface NativeBannerProps extends BannerAdProps {
  readonly unitId: string;
}

function productionOrTestId(value: string | undefined): string {
  const candidate = value?.trim();
  return !__DEV__ && candidate?.startsWith('ca-app-pub-')
    ? candidate
    : TestIds.ADAPTIVE_BANNER;
}

const TOP_BANNER_UNIT_ID = productionOrTestId(
  Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_TOP_ANDROID_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_TOP_IOS_ID,
  }) ?? process.env.EXPO_PUBLIC_ADMOB_BANNER_TOP_ID,
);
const BOTTOM_BANNER_UNIT_ID = productionOrTestId(
  Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_BOTTOM_ANDROID_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_BOTTOM_IOS_ID,
  }) ?? process.env.EXPO_PUBLIC_ADMOB_BANNER_BOTTOM_ID,
);

function NativeBanner({ style, unitId }: NativeBannerProps) {
  const { adsEnabled } = useAds();
  const { colors } = useAppTheme();
  const [canMount, setCanMount] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!adsEnabled) {
      setLoaded(false);
      return;
    }

    let active = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (active) setCanMount(true);
    });
    return () => {
      active = false;
      task.cancel();
    };
  }, [adsEnabled]);

  if (!adsEnabled || !canMount) return null;

  return (
    <View
      accessibilityElementsHidden={!loaded}
      accessibilityLabel={loaded ? 'Advertisement' : undefined}
      style={[
        styles.mountHost,
        loaded && styles.container,
        loaded && { backgroundColor: colors.surface, borderColor: colors.border },
        loaded && style,
      ]}>
      {loaded ? (
        <Text style={[styles.label, { color: colors.textMuted }]}>ADVERTISEMENT</Text>
      ) : null}
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          setLoaded(true);
        }}
        onAdFailedToLoad={() => {
          setLoaded(false);
        }}
      />
    </View>
  );
}

export function TopBannerAd(props: BannerAdProps) {
  return <NativeBanner {...props} unitId={TOP_BANNER_UNIT_ID} />;
}

export function BottomBannerAd(props: BannerAdProps) {
  return <NativeBanner {...props} unitId={BOTTOM_BANNER_UNIT_ID} />;
}

const styles = StyleSheet.create({
  mountHost: {
    alignSelf: 'stretch',
    height: 0,
    overflow: 'hidden',
  },
  container: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: 3,
    height: 'auto',
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 10,
    marginBottom: 1,
  },
});
