<div align="center">

<img src="mods/routing/route.svg" width="52" height="52" alt="herdr-magpie logo" />

# herdr-magpie

**面向 [Herdr](https://herdr.dev) 的 Magpie 实时路由拓扑、供应商配额监控与请求追踪面板。**

[![Release](https://img.shields.io/badge/release-v0.3.2-34d399?style=flat-square&labelColor=18181b)](https://github.com/dorokuma/herdr-magpie/releases)
[![Herdr Layout & Mod](https://img.shields.io/badge/herdr-layout%20%26%20mod-5e95d7?style=flat-square&labelColor=18181b)](https://herdr.dev)
[![GPUI Native](https://img.shields.io/badge/GPUI-native-d4b06a?style=flat-square&labelColor=18181b)](https://gpui-kit.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-a1a1aa?style=flat-square&labelColor=18181b)](LICENSE)

[English](README.md) · 简体中文

</div>

---

<div align="center">
  <img src="preview.png" width="100%" alt="herdr-magpie preview" />
</div>

## 核心特性

- **平滑 S 型贝塞尔拓扑连线** — 基于 GPUI 原生 `PathBuilder.cubic_bezier_to` 绘制三次贝塞尔实线，具备 `4px` 端口微距留白与锚点、原生 `.loop()` 呼吸发光、与真实请求同步的去程/返程脉冲光点，以及报错重试时的红闪抖动提示。
- **胶囊联动高亮与过滤** — 悬停任意 Agent 或右侧账号胶囊即可高亮其活跃与近期路由连线；点击胶囊可锁定高亮并联动过滤下方 `Requests` 列表。
- **动态供应商配额监控** — 自动读取用户本机或远端 `~/.config/magpie/providers.json` 与路由元数据，内置 85+ 常见 Agent 与模型供应商彩色/单色图标。统一采用 **剩余百分比（Remaining %）** 与首字母大写（Title Case）规范，额度耗尽时醒目显示红色 `Exhausted`；供应商折叠时按「短窗口 · 长窗口」显示两个百分比（如 `71% · 96%`），长窗口用完即显示 `Exhausted`；自动隐藏无意义的静态说明文本，并在零冷却时常驻显示 `● Plenty Of Juice — Build On.`。
- **可展开的请求追踪明细** — 统一的 `Requests` 列表，标题行直接给出计数（如 `2 active · 40 recent`），进行中的请求排在最前，支持一键切换 `Masked` / `Shown` 隐私脱敏；点击任意请求行即可就地展开查看请求/实际模型切换、TTFT 首字延迟、输入/输出 Token 与历次 `tries` 状态码。
- **原生设置页布局卡片** — 在 Herdr **Settings → Look → Layout** 中提供名为 **Magpie** 的专属布局与高清微缩预览图。
- **可复现的离线演示模式** — 内置完全虚构的演示数据，无需网关、凭据或真实供应商信息即可渲染完整面板，适合制作截图、评审和在安装前体验。

## 快速安装

```bash
git clone https://github.com/dorokuma/herdr-magpie.git
cd herdr-magpie
chmod +x install.sh
./install.sh
```

也可以不克隆仓库，直接用发布包里的同一个安装脚本：

```bash
curl -fsSL https://github.com/dorokuma/herdr-magpie/releases/download/v0.3.2/herdr-magpie-0.3.2.tar.gz | tar xz -C /tmp
/tmp/herdr-magpie-0.3.2/install.sh
```

安装完成后，在 Herdr 中按 `Ctrl+Shift+L`（或在 **Settings → Look → Layout** 中选择 **Magpie**），再点击右上角标签栏的 **Routing** 按钮即可展开面板。

## 更新

从 `0.3.0` 起面板可以自己更新。有新版本发布时，面板顶栏 `Magpie` 标题后面会出现
**`↑ Update x.y.z`** 按钮；点一下，它会从 GitHub 下载发布包、校验 `sha256`、把文件铺到
安装目录，Herdr 随即自动重载面板。你的 `mods/routing/config.json`（网关、远端、演示模式）
以及折叠状态、排序都会保留。已经是最新版本时，这个按钮不会出现。

检查新版本的时机：

- 面板启动时，仅当距上次检查超过 6 小时（已知的更新会直接从缓存结果显示，不重复请求）；
- 运行期间每 6 小时一次，按系统时钟计算，所以笔记本休眠唤醒后会立刻补查；
- 点击 Agent Quota 的 **Refresh** 时，最多每 10 分钟一次；
- 检查失败后依次在 2、10、30 分钟后重试，之后每小时一次；网关恢复可达时也会立刻重试。

一次检查只是从本机向 `github.com/dorokuma/herdr-magpie/releases/latest` 发一个 `HEAD`
请求，不上传任何数据、不需要 token；演示模式下从不检查。

早于 `0.3.0` 的安装没有这个按钮，按上面两行命令手动更新一次即可。

## 远端网关配置（可选）

默认连接本机 `http://127.0.0.1:3425`。如果你的 Magpie 运行在通过 `herdr-core` 连接的远端机器上，可复制示例配置：

```bash
cp ~/.config/herdr-app/mods/routing/config.example.json \
   ~/.config/herdr-app/mods/routing/config.json
```

修改 `~/.config/herdr-app/mods/routing/config.json`：

```json
{
  "remote": "my-remote-machine",
  "label": "my-remote-machine · 127.0.0.1:3425",
  "baseUrl": "http://127.0.0.1:3425",
  "demo": false
}
```

## 离线演示模式（可选）

将 `~/.config/herdr-app/mods/routing/config.json` 中的 `"demo"` 设为 `true`，即可使用内置的虚构数据渲染完整面板，而不会轮询任何网关：

```json
{
  "demo": true
}
```

演示数据位于 `~/.config/herdr-app/mods/routing/demo.json`，其中的 Agent、供应商、请求与配额均为虚构值。该模式不会发起网络请求，也不会读取你的真实 Magpie 供应商配置。恢复实时模式时将 `"demo"` 设回 `false` 即可。

## 开源协议

基于 [MIT License](LICENSE) 开源。
