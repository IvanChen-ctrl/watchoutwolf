@echo off
setlocal
cd /d "%~dp0"
where gradle >nul 2>nul
if errorlevel 1 (
  echo Gradle 8.10.2 is required, or use the GitHub Actions workflow.
  exit /b 1
)
python ..\tools\sync_web.py
if errorlevel 1 exit /b 1
gradle --no-daemon :app:assembleDebug
if errorlevel 1 exit /b 1
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
