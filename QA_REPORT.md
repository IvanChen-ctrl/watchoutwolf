# WatchOutWolf v1.1 regression report

## Completed local tests

- `node tests/test_engine.cjs`: **14 suites passed**, including all six dice faces, deterministic seeded outcomes, flashlight retreat, target-selection guard, forest-boundary trap, math options, complete game states, and optional recovery.
- `python3 tests/test_browser.py`: Chromium touchscreen smoke **passed** for 390px and 320px viewports, deliberate wrong answer -> dice skip -> next round, four correct answers, quick flashlight target selection with stale earlier target, exactly-one-ring Chihuahua retreat, no JavaScript errors, and no horizontal overflow.
- `python3 tools/build_onefile.py`: generated self-contained `web/play.html` (no CDN assets). `python3 tools/sync_web.py`: copied matching game files to Android WebView assets.
- Deterministic 200-seed balance simulations: easy 100%-answer wins 200/200 and 70%-answer wins 200/200; nightmare 100% wins 200/200 and 70% wins 195/200. This is a relatively forgiving strategy game, not a high-difficulty survival simulation.

## Fixed in v1.1

1. Quick flashlight action no longer targets a stale selection from a previous wolf card.
2. Roulette wheel labels align with their actual sectors and results are saved when cast, before the animation finishes.
3. A first-ring trap sends the wolf into the forest, where it leaves instead of silently returning.
4. PWA navigation uses network-first / cache fallback with versioned offline cache.
5. Android app `versionCode` 2 / `versionName` 1.1.0; CI invokes Node regression tests before APK compilation.

## Verification still required

- Android APK compilation on an Android SDK enabled machine/GitHub Actions (container has no SDK, Gradle or outbound download access).
- Install/launch/sound/rotation/save/restore on an actual Android handset.
- Safari PWA install and offline cache on a physical iPhone.
