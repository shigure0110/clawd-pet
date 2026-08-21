# 🦀 Claw'd — Claude Code 桌面宠物

[English](README.md) · [简体中文](README.zh-CN.md)

一只住在桌面上的像素螃蟹，盯着这台机器上所有 Claude Code 会话，在某个话题可以推进时叫你回来。

<img src="docs/demo.gif" width="200" align="right" alt="Claw'd 动画">

- **盯着 Claude Code** —— 通过 hooks 接收工具调用、提问和轮次结束事件。Claude 干活时，螃蟹会掏出笔记本敲键盘。
- **该回来时叫你** —— 跑了超过 15 秒的轮次结束时弹通知：*「『项目名』可以推进了」*；秒回的闲聊轮次保持安静。
- **点一下看今天花了多少** —— token 用量加上今日 API 等价费用，数据来自 [ccusage](https://github.com/ryoppippi/ccusage)（离线定价，不联网、数据不出本机）。
- **在桌面自由活动** —— 沿底边散步、爬屏幕两侧的「墙」、打盹、按时段吃点东西；被拎到半空松手会掉下来。
- **自觉让路** —— 检测到全屏应用时，走到屏幕边缘半个身子缩出去并变成点击穿透，同时戴上耳机拿起手柄。
- **陪着你** —— 鼠标悬停可以摸头（冒爱心）、连续用键盘 50 分钟提醒起来活动、同时开多个 Claude 会话时显示数量徽章。

<br clear="right">

## 实际长这样

![Claw'd 实拍](docs/states.png)

## 动画

全部 22 组动画都由 `assets/make_clawd_sprites.py` 参数化生成 —— 没有外部素材，没有描摹。

![动画一览](docs/animations.png)

| 触发条件 | 表现 |
| --- | --- |
| Claude 正在工作 | 抱着笔记本敲键盘；长时间运行时每 25 分钟抿一口咖啡 |
| 一轮结束 | 跳跃，有一半概率改成后空翻 |
| Claude 等你拍板 | 闪烁等待，气泡一直留着直到你处理 |
| 空闲 | 散步、爬墙、按时段吃东西（咖啡 / 水 / 薯条 / 香肠）、举小花、刷手机 |
| 3 / 8 分钟无输入 | 先打瞌睡，再戴上睡帽睡着 |
| 重新有输入 | 伸个懒腰醒来，说一句按时段的招呼语 |
| 连续活动 50 分钟 | 提醒起来活动一下 |
| 全屏应用 | 缩到屏幕边缘，戴耳机拿手柄 |
| 悬停 1.2 秒 | 被摸头，冒爱心 |

## 安装

从 [Releases](../../releases) 下载打包好的程序，解压后运行 `Clawd.exe`（Windows x64，免安装）。

然后注册 Claude Code hooks，让螃蟹能看到你的会话：

```bash
npm run hooks:install
```

这会往 `~/.claude/settings.json` 写入 7 个 hook（原文件备份到 `settings.json.ccpet-bak`），对**新启动**的 Claude Code 会话生效。撤销：

```bash
npm run hooks:uninstall
```

> hooks 指向的是本目录下的 `hooks/notify.js`，所以别移动这个文件夹（移动后重新执行一次 `hooks:install` 也可以）。

## 从源码运行

```bash
npm install
npm start          # 开发模式
npm run build      # 产物在 dist/Clawd-win32-x64/Clawd.exe
```

需要 Node.js 18+。目前仅支持 Windows —— 全屏检测和开机自启用到了 Win32 API，其余部分是跨平台的。

## 怎么用

- **左键点击** —— 显示今日用量和费用
- **拖动** —— 换位置；在半空松手它会掉下去
- **悬停** —— 摸头
- **右键 / 托盘图标** —— 用量、自由活动开关、缩到边缘、才艺表演、开机自启、重启、退出

## 精灵图

`assets/make_clawd_sprites.py` 生成整张精灵图以及 `icon.ico` / `tray.png`；`assets/make_preview.py` 生成本文档里的展示图。两者需要 Python 3.11+ 和 Pillow。

精灵图遵循 Codex Pet Standard（8 列 × 192×208 每格）：第 0–8 行是标准动作，第 9–21 行是本项目的扩展。替换 `renderer/spritesheet.webp` 就能换角色；右键菜单也支持导入 `.zip` 宠物包。

## 工作原理

```
Claude Code hook ──> hooks/notify.js ──POST──> 127.0.0.1:31126/status
                                                      │
                                            main.js（Electron 主进程）
                                        窗口 · 托盘 · ccusage · 各种监视器
                                                      │ IPC
                                            renderer/pet.js
                                        动画引擎 · 漫游 · 菜单
```

| 路径 | 职责 |
| --- | --- |
| `main.js` | 窗口、托盘、HTTP 状态服务、ccusage、全屏与闲置监视 |
| `preload.js` | IPC 桥接 |
| `renderer/pet.js` | 动画引擎、漫游/爬墙/躲避、菜单动作 |
| `hooks/notify.js` | 把 hook 事件映射成 `idle` / `running` / `waiting` / `completed` / `error` |
| `scripts/setup-hooks.js` | 安装 / 卸载 hooks |
| `scripts/fullscreen-watch.ps1` | 前台窗口监视，输出 `FS:0` / `FS:1` |

手动推送状态：

```bash
curl -X POST http://127.0.0.1:31126/status -H "Content-Type: application/json" -d "{\"status\":\"running\",\"message\":\"hello\"}"
```

本地还开放了 `GET /status`、`GET /usage`，以及 `POST /action`、`/fullscreen`、`/idle`、`/restart` 用于调试。

## 致谢

Fork 自 [ClaudeCodePet](https://github.com/WangJunqing-coder/ClaudeCodePet)（MIT）并大幅重写。精灵图格式遵循 [Codex Pet Standard](https://codexpet.xyz)。

「Claw'd」是 Anthropic 的吉祥物；本项目是非官方的独立绘制致敬作品，与 Anthropic 无关联、未获其背书。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。生成的精灵图同样采用 MIT。
