# 算数不好，狼就会来！ / Wolf Math Defense

一个原创、可离线游玩的数学塔防喜剧小游戏。**同时提供网页版（PWA）和 Android 离线应用源码**。网页版现已试玩验证；Android 项目包含完整构建材料和 GitHub Actions 自动构建工作流。

## 游戏故事

女儿先到了外婆家。孙子边走边打游戏，外婆问：“来看我，怎么还不放下游戏机？”孙子说：“我在练数学，狼来了能拿建材防守！”结果狼真的来了。

答对数学应用题可领取金币、木材，买材料修缮三层防御工事。答错时可以放弃奖励，也可以冒险掷六面命运骰。幸运掷到5或6，便能拿到手电筒：照中一只狼，它立刻变成吉娃娃，并从当前防御圈自动退回**外面一圈**；原本就在最外圈，则退到森林。吉娃娃不再攻击，稍后会自行逃走。

## 实际游戏规则（v1.1）

- **目标**：存活18回合、守住3个夜晚。每6回合进入下一夜，外婆补充少量物资、修补防线，狼群退场。
- **每回合**：1道数学材料题 ->（如果答错，可选择掷骰或安全跳过）-> 最多2次工程行动 -> 狼群行动。
- **答对**：获得 `3 + 当前夜数` 枚金币、1块木材；连续答对4道题额外奖励手电电量1格（最多5格）。
- **答错**：无常规奖励。命运骰六个面等概率：1=小屋-2生命和新狼；2=落空；3=木材+1；4=金币+2；5=手电+1格；6=手电+2格。
- **木材采购**：4金币兑换2木材，消耗1次工程行动。
- **石材采购**：5金币兑换1石材，消耗1次工程行动。
- **防线加固**：2木材，将选定防线耐久提升最多4点，消耗1次工程行动。
- **房屋修理**：3木材，提升小屋生命最多4点，消耗1次工程行动。
- **布陷阱**：1木材+1石材，当前圈增加1个陷阱（每圈最多2个）；踩中的狼后退一圈并暂时停止攻击；消耗1次工程行动。
- **手电**：每次消耗1格电量，不占工程行动次数。只对野狼有效，对吉娃娃不能重复使用。
- **狼群**：一般从外圈进入；第二、三夜的随机钻地狼可能绕过外圈。三层防线耐久耗尽后，狼可继续接近小屋；到达内圈缺口时会直接伤害小屋。
- **模式**：轻松 / 惊悚进阶（后者初始防线较弱、随机狼较多，并在第三夜出现狼王）。
- **保存**：浏览器或 Android WebView 本地保存进度，无注册、无账号、无联网调用。

## 网页版使用

### 最简单：单文件离线版

打开 `web/play.html`。所有 HTML/CSS/JS 都内嵌在一个文件中，电脑浏览器无需服务端即可游玩。如果移动系统仅允许预览而不执行 HTML，请改用下述 HTTPS 部署方式。

### 苹果手机 Safari / iPad

1. 将整个 `web/` 文件夹部署在 HTTPS 静态网站上（例如 GitHub Pages、Cloudflare Pages、Netlify 等）并打开 `index.html`。
2. 在 iPhone Safari 打开该网址，点击“分享” -> “添加到主屏幕”。
3. 从主屏幕启动网页游戏。首次成功加载并缓存后可离线使用。某些隐私模式/清理浏览器数据可能会清除本地存档。

使用 `python3 -m http.server 8080 --directory web` 可以在电脑上本地测试。手机访问需要能从手机访问到该服务器，且 PWA 添加到主屏幕仍建议使用 HTTPS 域名。

## Android APK 构建

### 方法 A：GitHub Actions 云端自动构建（推荐）

1. 源码位于 GitHub [IvanChen-ctrl/watchoutwolf](https://github.com/IvanChen-ctrl/watchoutwolf)，仓库的 `.github/workflows/build-android.yml` 可以自动编译。
2. 进入仓库的 `Actions` -> `Build offline Android APK` -> `Run workflow`。
3. 待构建结束，打开任务详情，在 `Artifacts` 区下载 `WatchOutWolf-Android-v1.1-debug-APK`。
4. 解压得到 `app-debug.apk`，在自己的 Android 手机上按系统提示安装。首次侧载可能需要授权“允许从此来源安装”。

**注意**：Actions 生成的为 Android 调试签名 APK，适合自己试玩，不是上架商店用的发布签名包。正式发布须生成密钥、签名 Release、测试和遵守发布平台要求。

### 方法 B：本地 Android Studio / Gradle

- Java 17 / Gradle 8.10.2 / Android SDK 35 和 Build Tools 35.0.0。
- 在 Android Studio 打开 `android/` 项目，确保能访问 Google Maven、Maven Central 下载 Android Gradle Plugin 8.7.3。
- 命令行在仓库根目录运行 `python3 tools/sync_web.py`，再在 `android/` 下运行 `gradle :app:assembleDebug`。
- 生成文件在 `android/app/build/outputs/apk/debug/app-debug.apk`。
- Android 包名 `com.moonfence.wolfmath`，最低 Android 7.0（API 24），目标 API 35。

Android 端使用无联网权限的 WebView 和内置资产拦截器，原始素材打包在 APK 内。游戏逻辑与网页版共用同一份源码。

## 目录

```text
web/index.html                 PWA入口
web/play.html                  单文件直接试玩
web/styles.css                 全部UI样式
web/js/engine.js               纯游戏规则引擎
web/js/app.js                  控制、矢量画面和音效
web/manifest.webmanifest       PWA安装描述
web/sw.js                      离线缓存
android/                       Android Studio工程（Java WebView）
.github/workflows/build-android.yml   APK云端构建
scripts (tools/)               源码同步与生成单文件版
tests/test_engine.cjs           规则与平衡回归测试
```

## 测试及限制

- 已通过 Node.js 规则单元测试、题目答案有效性检测、18回合状态机验证和模拟对局。
- 已通过 Chromium 的桌面与移动触屏 UI 交互测试（包含答错、骰子、资源采购、加固、防线点击与手电变身），320px / 390px 宽度未出现横向溢出。
- 已验收 `web/play.html` 自包含结构，不依赖 CDN 或其他网络资源。
- **此执行环境没有安装 Android SDK、Gradle，且无法访问外部软件下载站。因此尚未实际生成或在实体 Android / iOS 设备上回归测试 APK。** Android 工程是可供 Android Studio 或 GitHub Actions 编译的源码，不能把源码 ZIP 当成 APK 直接安装。
- iPhone Safari PWA 流程在设计上兼容主屏幕安装，但未在实体 iPhone Safari 上测试。
- 游戏无付费抽奖、没有真实博彩或武器元素；“俄罗斯轮盘式紧张感”仅通过命运骰的游戏风险呈现。

## 技术与授权

全部游戏界面、角色绘制、音效和代码为本项目专门创建的原创素材；无第三方字体或联网资源。允许自行修改、分享和个人使用。版本 `1.0.0`。

## GitHub Pages：苹果手机可直接打开

本仓库包含 `.github/workflows/publish-web.yml`。在 GitHub 仓库 `Settings → Pages` 中把发布源设置为 **GitHub Actions**，然后在 `Actions → Publish iPhone and browser version to GitHub Pages → Run workflow` 发布。待运行成功，以工作流显示的实际 URL 为准。苹果 Safari 可点击分享 →「添加到主屏幕」。在未成功发布前，不要将预期 URL 当成已上线地址。

## v1.1 回归修订（watchoutwolf）

- 修复狼群雷达中的「🔦 照射」快捷按钮：现始终照射用户刚刚点击的那只狼，不再被之前选中的狼覆盖。
- 修复命运骰数字与彩色扇区的角度错位；结果掷出后立即本地保存，避免游戏中断时重复掷骰。
- 修复最外圈陷阱：狼被弹进森林，下一次狼群行动时会彻底离开，不会悄悄走回第一圈。
- 调整 PWA 离线缓存为 v1.1，页面导航优先联网、离线回退本地缓存，避免旧首页长期滞留。
- 新增游戏状态、概率骰子、陷阱边界与 UI 源码完整性自动回归，以及 Chromium 触屏操作脚本 `tests/test_browser.py`。GitHub Actions 在编译 APK 前执行 Node 测试，编译后检查 APK 内容。

本版本仍为调试签名 APK；通过 GitHub Actions 构建成功不等于已在实体手机上完成安装和操作验收。
