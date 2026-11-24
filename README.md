# 算数不好，狼就会来！ · WatchOutWolf v1.5.0

**同一款离线数学塔防游戏，两套可立即切换的视觉风格。** Windows / macOS 浏览器、iPhone Safari PWA、Android APK 使用相同的规则引擎与网页版 UI。

项目仓库：[IvanChen-ctrl/watchoutwolf](https://github.com/IvanChen-ctrl/watchoutwolf)

## 核心设定

外婆在家，女儿早已经到屋内，孙子随后一边走一边玩**唯一一台掌机**。床下藏着丑娘，她还记着女儿给过的冰淇淋，想报答。狼来袭时，孙子需要答对建材数学题来挣钱和修筑防线；答错可以放弃奖励或掷公平的六面命运骰，幸运得到的手电筒可以把狼照成吉娃娃，使其自动后退**一整圈**（最外圈退入森林）。游戏走惊悚冷幽默路线，不含真实赌博、流血或内购。

## 双画风

**🧮 经典堡垒**：明亮易读的卡通 2D 城防地图，适合直接玩数学塔防。

**🎬 丑狼短剧**：从已有丑狼喜剧设定改编的电影感 **2.5D Canvas 视觉皮肤**：午夜外婆木屋、体积感的层叠山林、暖色窗光、错位眼睛和歪耳朵丑狼、床底眼睛、夜色烟雾、胶片边框和单条短剧台词字幕。两种风格复用同一战斗模型，随时切换不暂停、不重新开始、不清空进度。画风选择另行写入本地存储。

**说明**：短剧版目前是为游戏重新绘制的程序化 2.5D 美术，不是直接导入过去视频里的 3D FBX/动画模型，因此不是原视频的一比一复刻。

## 防御与武器（每回合最多 2 次工程行动）

| 装备 | 成本 | 每圈上限 | 效果 |
|---|---|---:|---|
| ⚙ 弹簧绊狼夹 | 木材 1 + 石材 1 | 2 个 | 一次性，狼退回外层并停一回合 |
| 🕸 冰淇淋黏网 | 木材 1 + 金币 3 | 2 张 | 一次性，狼连续两次攻击被阻止 |
| 🎯 弹弓哨塔 | 木材 2 + 石材 1 + 金币 2 | 2 级 | 每级每回合使本圈一只狼胆量 −1；胆量归零自动逃走 |
| 🔔 月光警报铃 | 木材 1 + 石材 2 + 金币 3 | 1 座 | 永久设施，待机时打断本圈一只狼两轮攻击，随后冷却 3 回合 |
| 🏗 加固防线 | 木材 2 | 各圈耐久上限 | 当前选中防线最多 +4 耐久 |
| ♥ 修理小屋 | 木材 3 | 生命上限 15 | 小屋最多恢复 4 点生命 |
| 🪵 采购木材 | 金币 4 | — | 木材 +2 |
| ⬡ 采购石材 | 金币 5 | — | 石材 +1 |
| 🔦 特殊手电筒 | 1 格电量 | — | **不耗工程次数**；目标狼变吉娃娃并退到外围一圈 |

**战斗顺序**：弹弓哨塔 → 月光警报铃 → 弹簧夹 / 冰淇淋黏网 → 狼攻击墙体或小屋。被照成吉娃娃的目标不再承受武器攻击，两个回合后逃走。每层陷阱和设施彼此独立，绕后狼仍可能穿过外圈。

## 关卡与随机性

- 共 18 回合、3 个夜晚，每个夜晚 6 回合。日出时有少量资源与耐久补给，狼退回树林。
- 答对建材应用题获得 `3 + 当前夜数` 金币和木材 1；连对 4 题获得 1 格手电电量。
- 答错后可安全跳过，或掷六面命运骰：1 灾厄（小屋 −2 且增加狼），2 落空，3 木材 +1，4 金币 +2，5 手电 +1，6 手电 +2。等概率，每面 1/6。
- 轻松 / 惊悚进阶两档难度；第三夜会有绕后狼及进阶狼王。
- 不同种类的狼有不同胆量；哨塔使其胆量逐步下降，非致命“劝退”而不是杀死。

## 在线、离线与 Android

**免安装试玩**：打开 `web/play.html`，这是自包含 HTML；适合桌面浏览器，也可从支持本地 HTML 执行的移动浏览器运行。

**iPhone Safari / iPad**：把 `web/` 部署到 HTTPS 静态站点。仓库已提供 `.github/workflows/publish-web.yml` 用于 GitHub Pages。启用 Settings → Pages → GitHub Actions，并在 Actions 中手动运行 `Publish iPhone and browser version to GitHub Pages`。Safari 打开部署后的 URL，使用分享 → 添加到主屏幕。安装后离线缓存可以游玩。

**Android**：下载 GitHub Actions 的 `WatchOutWolf-Android-v1.5-debug-APK` 产物，解压安装 `app-debug.apk`（调试签名，仅测试）。可以在 Android Studio 中打开 `android/`。本地需求：JDK 17、Gradle 8.10.2、Android SDK 35 / Build Tools 35.0.0；在仓库根运行 `python3 tools/sync_web.py`，再运行 `gradle --project-dir android :app:assembleDebug`。

包名 `com.moonfence.wolfmath`，Android 最低 API 24。Android 使用不请求联网权限的内置 WebView，离线加载 `assets/www`。未收集账号、无购买、无外部音频或 CDN。

## 工程与测试

```
web/index.html                      PWA 启动页
web/play.html                       自包含 HTML 试玩
web/js/engine.js                    独立规则引擎与 v1 存档迁移
web/js/app.js                       交互、双画风 Canvas 与音效
web/styles.css                      响应式 UI 与两套主题
web/sw.js                           离线缓存
android/                            Android Studio 离线 App
.github/workflows/build-android.yml GitHub 自动测试 + 生成 APK
.github/workflows/publish-web.yml   GitHub Pages 手动部署
tests/test_engine.cjs               确定性规则单元测试 + 800 场模拟
测试脚本 test_browser.py             Chromium 手机触屏回归
```

运行 `node tests/test_engine.cjs` 和 `python3 tests/test_browser.py`（后者需 Playwright + Chromium）。每次发布前运行 `python3 tools/build_onefile.py` 重新生成 `web/play.html`，`python3 tools/sync_web.py` 与 Android 资产同步。测试结果见 `QA_REPORT.md`。

**网页存档兼容性**：继续使用 v1.1 的存储 key，加载旧版 `version: 1` 存档时自动补充新装备字段，不丢失原回合、资源与狼状态；风格选择单独保存。若浏览器清空站点数据，存档仍可能丢失。

**注意 Android 旧版升级**：每次云端 Debug APK 若使用不同的调试签名，Android 可能拒绝直接覆盖安装。若提示签名冲突，需要卸载旧 APK 后安装新版，而卸载可能清除本机游戏存档。未来正式发布需要配置固定且安全保管的签名证书。

**验收边界**：仓库构建/本地自动化测试不等同于真实 Android / iPhone 实机验收。短剧风格不是原影片素材的逐帧复刻。正式上架还需发布签名及商店相关工作。


## v1.5.0 本次回归

- 数学题库、武器等级、两种画风及第三夜堡垒场景整合
- 修正高难度题的负数边界；旧存档迁移不再消耗随机数状态；吉娃娃始终攻击 0
- Android APK 版本为 `1.5.0`，通过 GitHub Actions 生成 Debug APK
- 运行 `node tests/test_engine.cjs`、`python3 tests/test_browser.py` 进行回归
