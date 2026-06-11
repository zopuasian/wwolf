[English](./README.md) | [简体中文](./README.zh.md)

# Wolfcha (猹杀)

<div align="center">
  <img src="public/logo.png" alt="Wolfcha Logo" width="240" />
  <h3>和朋友在线玩狼人杀 - 真人玩家、隐藏身份、实时博弈</h3>
  <p>
    <a href="https://masoi.nguynchupanh.com">在线体验</a>
  </p>
</div>

## 🙏 感谢赞助

<table>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/zenmux.png" alt="ZenMux Logo" width="100" />
    </td>
    <td>
      <strong>ZenMux</strong><br/>
      曾为 Wolfcha 早期 AI 版本提供模型路由与编排支持。
    </td>
  </tr>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/minimax.png" alt="MiniMax Logo" width="100" />
    </td>
    <td>
      <strong>MiniMax</strong><br/>
      Wolfcha 最早的 AI 版本曾由 MiniMax LLM 与 TTS 能力驱动。
    </td>
  </tr>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/watcha.svg" alt="Watcha Logo" width="100" />
    </td>
    <td>
      <strong>Watcha</strong><br/>
      曾支持项目早期展示与社区语境。
    </td>
  </tr>
</table>

---

> 说明：Wolfcha 最初是一个 AI 原生狼人杀实验。现在的主体验已经重构为真人在线联机版，不再使用 AI 玩家补位。

## 📖 项目背景

Wolfcha 是一款受狼人杀启发的社交推理游戏。玩家可以从不同设备加入同一个在线房间，获得隐藏身份，在白天发言、欺骗、推理、投票，在夜晚执行各自阵营或角色的行动。

新版保留了原本的 Wolfcha 氛围：羊皮纸大厅、红色印章入场、复古头像、身份揭示卡片、事件提示，以及天黑天亮时的眨眼淡入淡出动画。核心玩法则已经改为真人玩家共同在线游玩。

## ✨ 核心亮点

### 1. 真人在线联机

- 创建房间或通过短邀请码加入房间。
- 不同地点、不同设备的玩家可以一起游戏。
- 不再使用 AI 座位，也不会自动加入机器人玩家。
- 支持 5 到 12 人房间。
- 房主可以在人数足够后开始游戏。

### 2. 房间角色配置

- 新玩家可以直接选择默认配置快速开局。
- 熟悉规则后可以自定义本局角色列表。
- 房间创建后，在大厅阶段仍可继续调整设置。
- 系统会根据入座人数校验角色数量。
- 每局开始时都会重新随机洗牌并分配身份。

### 3. 集中的行动弹窗

- 夜间技能与白天投票都集中在屏幕中央的行动面板中。
- 目标列表、确认按钮、倒计时、结果提示都在同一个面板内。
- 当前阶段结束后，面板会自动关闭。
- 狼人夜聊区域会保留在下方，避免狼人错过队友消息。
- 玩家卡片会显示行动标签，例如 `Vote: Aki`、`Bite: Sarah`、`Curse: Kevin`。

### 4. 昼夜、聊天与倒计时

- 每个夜间阶段 15 秒。
- 白天讨论 60 秒。
- 投票 15 秒。
- 白天结算后会自动进入下一夜。
- 房主可以在需要时强制结束讨论或投票。
- 白天聊天对所有玩家可见。
- 狼人夜聊仅狼人阵营可见。

### 5. 扩展角色规则

当前在线版包含多个经典与进阶狼人杀角色，包括村民、狼人、预言家、女巫、猎人、守卫、丘比特、白痴、王子、疾病携带者、被诅咒者、狼崽、狼王等。

已经实现的重要规则：

- 女巫的解药和毒药各只能使用一次。
- 预言家查验后会收到结果。
- 猎人死亡后可以开枪带走一名玩家。
- 狼王规则已自定义：如果任意狼人死亡，且狼王仍然存活，则下一晚狼人进入招募夜。狼人选择一名非狼人加入狼人阵营，并且当晚不能刀人。
- 如果当晚必须招募，普通狼人击杀会被禁用。

## 🎮 如何游玩

1. 打开 [masoi.nguynchupanh.com](https://masoi.nguynchupanh.com)。
2. 输入名字，并按下红色印章。
3. 创建房间，或使用邀请码/邀请链接加入房间。
4. 房主选择默认角色配置，或自定义本局角色。
5. 人数足够后，房主开始游戏。
6. 每位玩家阅读自己的身份揭示卡片，确认后开始游戏。
7. 当角色或村庄需要行动时，在中央行动面板中完成选择。

## 🛠️ 技术栈

- Next.js
- TypeScript
- Tailwind CSS
- Supabase/Postgres 在线房间状态
- Vercel 部署托管

在线联机流程通过 Next.js API Routes 与 Supabase 房间快照同步完成，不依赖自建 WebSocket 服务，因此可以部署到 Vercel。

## 🚀 本地运行

安装依赖：

```bash
pnpm install
```

创建环境变量文件：

```bash
cp .env.example .env.local
```

必需的 Supabase 配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

如果你的 Supabase 项目使用新的 publishable key 名称，也可以配置：

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
```

启动开发服务器：

```bash
pnpm dev
```

打开：

```text
http://localhost:3000
```

## 🗄️ 数据库

在 Supabase SQL Editor 中执行迁移：

```text
supabase/migrations/20260610_multiplayer_rooms.sql
```

该迁移会创建在线房间、座位、消息、行动与同步游戏状态所需的数据结构和策略。

## 🧪 测试

常用本地检查：

```bash
pnpm test:multiplayer
pnpm test:multiplayer:ui
pnpm build
```

UI 测试模式：

```text
http://localhost:3000/?uiTest=1
```

## ☁️ 部署

只要配置好 Supabase 环境变量，本项目即可部署到 Vercel。

生产地址：

```text
https://masoi.nguynchupanh.com
```

部署命令：

```bash
npx vercel@latest --prod --yes
```

## 📄 License

MIT License
