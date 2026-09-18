---
title: Closed Testing - Ad-Free Android AAB
aliases:
  - PCSO Lotto closed-testing release
tags:
  - pcso-lotto
  - android
  - closed-testing
  - release
  - admob
created: 2026-09-09
app-version: 0.1.4
android-version-code: 9
status: ready-to-build
---

# Closed Testing - Ad-Free Android AAB

## Release state

- App: PCSO Lotto Results & Analysis
- Android package: `com.kanonsoft.lottoresultsandanalysisph`
- Version: `0.1.4`
- Version code: `9`
- Track: Google Play closed testing
- Ads: disabled
- Remove Ads purchase entry: hidden and disabled
- Release upload key and private Gradle signing properties: present locally

## Ad-free build setting

The local `mobile/.env` file contains:

```dotenv
EXPO_PUBLIC_ADS_ENABLED=false
```

Ads are strict opt-in. A missing value or any value other than `true` keeps ads disabled. This prevents banner, native, and interstitial requests, skips AdMob consent initialization, removes ad containers, and hides the paid Remove Ads entry.

Do not delete the AdMob unit IDs or remove the AdMob/IAP integration. They are retained for a later production release.

## Generate the signed AAB locally

Use a new short build path. The original repository path is long enough to cause Ninja/CMake failures on Windows, and reusing an old build directory can preserve an earlier `.env` value.

Run this complete block in PowerShell:

```powershell
$source = "C:\Users\raine\Documents\Dev\PCSO Live Lottery Results and Analysis\mobile"
$target = "C:\dev\pcso-v9-adfree\mobile"

if (Test-Path -LiteralPath $target) {
    throw "The build folder already exists. Use a new empty target path."
}

New-Item -ItemType Directory -Path $target -Force | Out-Null

robocopy $source $target /E `
  /XD node_modules .expo dist build .gradle .cxx credentials .git release .data-layer-export-check `
  /XF credentials.json *.aab *.apk

if ($LASTEXITCODE -gt 7) {
    throw "Copy failed with robocopy exit code $LASTEXITCODE"
}

Set-Location $target
npm ci

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:NODE_ENV = "production"
$env:EXPO_PUBLIC_ADS_ENABLED = "false"

& "$env:JAVA_HOME\bin\java.exe" -version

Set-Location "$target\android"
.\gradlew.bat --stop
.\gradlew.bat app:bundleRelease --console=plain
```

Android Studio's bundled Java 21 must be used. Oracle Java 24 previously caused the native Prefab/CMake build to fail.

## AAB output

After `BUILD SUCCESSFUL`, upload this file to the Google Play closed-testing release:

```text
C:\dev\pcso-v9-adfree\mobile\android\app\build\outputs\bundle\release\app-release.aab
```

## Before uploading

- Confirm the build says version `0.1.4` and version code `9`.
- Confirm the Gradle command ends with `BUILD SUCCESSFUL`.
- Upload the `.aab`, not an APK.
- Add closed-test release notes.
- Keep the existing tester list and closed-testing track.
- Do not reuse an older AAB from `pcso-v7-build` or `pcso-v8-build`; those builds may still contain ads.

## EAS alternative

The project has an ad-free `closed-testing` profile:

```powershell
Set-Location "C:\Users\raine\Documents\Dev\PCSO Live Lottery Results and Analysis\mobile"
npx eas-cli@latest build --platform android --profile closed-testing
```

This consumes an EAS cloud Android build credit. The local Gradle process above does not.

## Re-enable ads for production

For a later monetized production build:

1. Change `EXPO_PUBLIC_ADS_ENABLED` to `true` in the production build environment.
2. Restore the same variable as `true` in the EAS production environment if using EAS.
3. Increment the app version and Android version code.
4. Build from another fresh short-path directory so Gradle cannot reuse the ad-free JavaScript bundle.
5. Test consent, banners, native ads, interstitial cooldowns, and Remove Ads restoration before production rollout.

Related: [Privacy policy page](privacy/index.html)
