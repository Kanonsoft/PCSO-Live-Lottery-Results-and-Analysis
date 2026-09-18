# PCSO Lotto Results & Analysis

An Expo/React Native mobile app for browsing Philippine lottery results, checking saved picks against draw history, and exploring descriptive statistics. It targets Android and iOS and includes a web preview for quick development and review.

## Included now

- **Results** — a date-based PCSO-blue-and-red results view ordered from Ultra Lotto 6/58 through 2D Lotto, with locally bundled game logos, compact previous/next navigation, prizes, and winner counts. The 2D and 3D cards keep their 2 PM, 5 PM, and 9 PM draws together.
- **Pick** — choose a game, enter a valid combination, choose a draw slot when relevant, and compare it with the latest result and available archive. Saved picks persist on the device.
- **Analysis** — choose a game and analyze its latest 10 draws. Analyze opens a short findings menu; each button has a dedicated page for summary, every-number frequency, chart, recent trend, gaps, even/odd, pairs/patterns, exact-order positions, or a fair random combination.
- **Advertising** — Google Mobile Ads banners, native cards in results and each loaded history batch, an Analysis interstitial every second Analyze action, and separate Pick/Analysis generator interstitials every fifth generation are integrated. Fullscreen placements share a 60-second cooldown. Localhost renders labelled placement previews; native development builds use Google test ads until production IDs are configured.

The random generator does not use draw history. In a fair lottery, every valid combination has the same theoretical chance. The app never treats a historical check as official prize validation. It is intended only for adults aged 18 and older; play responsibly.

## Run the app

Requirements: a current Node.js LTS release and npm.

```powershell
cd mobile
npm install
npm start
```

For the localhost browser preview:

```powershell
npm run web
```

Open `http://localhost:8081`. Google Mobile Ads is a native SDK, so the browser shows labelled ad previews rather than live ads.

For live reload with real test ads on Android, create and install a development build once:

```powershell
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

Scan the development-server QR code with the installed development build. Expo Go cannot load the AdMob native module. A native iOS build requires macOS/Xcode, but the same source targets iOS.

Useful commands:

```powershell
npm run android
npm run web
npm run typecheck
npm test
npm run export:web
npm run smoke:web
```

For the browser smoke test, first serve `dist` and set `LOTTO_APP_URL` if it is not running at the script's default address.

## Result data

The app ships with 7,916 archived LottoMatik records so it remains useful offline. It refreshes on launch and whenever the app returns to the foreground. While open, it also checks the 2 PM, 5 PM, and 9 PM Manila publication windows and retries at 5-minute intervals through 15 minutes after each draw time. Valid records are merged with the cache and bundled archive, with safe fallback if a refresh is unavailable.

Rebuild the bundled archive after replacing the root CSV:

```powershell
npm run data:build
```

The generator reads `../lotto_results_all_games_oldest_to_latest_8_columns.csv` and writes `src/data/lottery-results.json`.

## Advertising configuration

Ads are disabled unless `EXPO_PUBLIC_ADS_ENABLED=true` is explicitly set for the build environment. Keep it `false` for the ad-free closed test. Enabling ads also restores the in-app Remove Ads purchase entry.

Development and unconfigured builds use Google's safe sample App IDs and test ad units. Before a public release, replace `androidAppId` and `iosAppId` in `app.json` with the App IDs from your AdMob account and configure the applicable unit IDs:

```text
EXPO_PUBLIC_ADMOB_BANNER_TOP_ANDROID_ID
EXPO_PUBLIC_ADMOB_BANNER_BOTTOM_ANDROID_ID
EXPO_PUBLIC_ADMOB_NATIVE_RESULTS_ANDROID_ID
EXPO_PUBLIC_ADMOB_NATIVE_HISTORY_ANDROID_ID
EXPO_PUBLIC_ADMOB_ANALYSIS_INTERSTITIAL_ANDROID_ID
EXPO_PUBLIC_ADMOB_ANALYSIS_RANDOM_COMBINATION_INTERSTITIAL_ANDROID_ID
EXPO_PUBLIC_ADMOB_PICK_RANDOM_COMBINATION_INTERSTITIAL_ANDROID_ID
```

Equivalent `_IOS_ID` variables are supported. Generic top, bottom, results, and history fallbacks are also supported where documented in the ad components. The app requests UMP consent before native ad requests. A verified ad-free entitlement hides every placement.

Keep real values in a local `.env` file or EAS environment variables. `.env` is ignored and must not be committed; `.env.example` contains safe placeholders. Configure the same variables in every EAS environment you build, such as `preview` and `production`.

## Remove-ads purchase

The app uses `expo-iap` and Google Play Billing for one lifetime, non-consumable product:

```text
Product ID: remove_ads_lifetime
Product type: One-time product / Buy
Philippines price: PHP 49.00
```

Create and activate that exact product and purchase option in Play Console. The app displays Google Play's localized price, grants ad-free access only for a `purchased` ownership record, acknowledges it as non-consumable, and restores ownership at launch, app resume, or when the user selects Restore purchase. The former free AsyncStorage toggle is deliberately not migrated into the paid entitlement.

In-app purchases require a fresh native development build and are unavailable in Expo Go. Test on a physical Android device using a Google Play internal-testing release and a license-tester account. The current implementation checks Play ownership client-side and caches the last result only for offline UI continuity; add backend purchase-token verification and refund/revocation handling before treating the entitlement as tamper-resistant.

For Expo SDK 57, keep `expo-iap` pinned exactly to `4.7.0` and Android Kotlin at `2.2.0`. `expo-iap` 5.2.0 currently resolves an OpenIAP Android artifact compiled with Kotlin 2.4.10, which is incompatible with this Expo toolchain. After changing the native dependency, rebuild without the old EAS cache:

```powershell
npx eas-cli@latest build --platform android --profile preview --clear-cache
```

## Project map

```text
src/app/(tabs)/       Results, Pick, and Analysis screens
src/components/       Reusable mobile UI
src/data/             Bundled archive and LottoMatik repository
src/domain/           Game rules, pick comparison, and analysis engine
src/providers/        App-wide draw state and refresh lifecycle
scripts/              Archive builder and browser smoke test
```

## Known tooling note

The dependency audit currently reports moderate transitive build-tool advisories. An automatic force fix was not applied because it can introduce incompatible major-version changes.

Before publishing, replace the test AdMob identifiers, publish the privacy policy at a public URL, complete consent and store advertising declarations, confirm the Android/iOS package identifiers, and test signed builds on real devices.
