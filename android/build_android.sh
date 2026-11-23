#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v gradle >/dev/null 2>&1; then
  echo 'Gradle is missing. Install Gradle 8.10.2 or build using the included GitHub Actions workflow.' >&2
  exit 1
fi
if [ -z "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]; then
  echo 'ANDROID_HOME or ANDROID_SDK_ROOT must point to the Android SDK.' >&2
  exit 1
fi
python3 ../tools/sync_web.py
gradle --no-daemon :app:assembleDebug
echo 'APK: android/app/build/outputs/apk/debug/app-debug.apk'
