# Token Poker

Agent 陪玩的虚拟筹码德州扑克（Earn Tokens 风格），Synergy Plugin API 4 插件。

<img width="1792" height="1265" alt="Screenshot 2026-08-19 at 19 54 26" src="https://github.com/user-attachments/assets/0ae0f3d4-c9c7-4df3-8ea0-2dcbe989e408" />

## 功能

- 6-max No-Limit 德州扑克：完整下注轮、最小加注、all-in、side pot、摊牌结算
- 5 位 AI 对手（Ada / Grace / Alan / Katherine / Edsger），LLM 决策 + 启发式降级，牌局永不卡死
- 对手行动时显示 "Thinking" 状态
- 底池/公共牌/庄家按钮/结算动画
- 虚拟筹码与战绩跨会话持久化
- 侧栏入口，全屏牌桌页面

> 游戏内筹码为虚拟数值，仅供娱乐，无实际价值。

## 开发

```bash
bun install
bun test          # 引擎 + AI 层单元测试
bunx tsc --noEmit # 类型检查
bunx synergy-plugin build
bunx synergy-plugin validate --runtime-discovery
bunx synergy-plugin pack
```

## 安装

构建后：

```bash
synergy plugin add file:///path/to/token-poker
synergy plugin approve token-poker
```

需要批准的能力：`agent.call`（AI 对手决策，nano/mini 角色）、`settings.read/write`（存档）、`ui.hostActions`。

## 结构

```
src/
├─ engine/   纯 TS 扑克引擎（无 LLM 依赖，可单测）
│  ├─ cards.ts      牌/洗牌
│  ├─ evaluate.ts   牌型评估
│  ├─ game.ts       牌局状态机
│  └─ pots.ts       side-pot 拆分
├─ ai/       对手决策
│  ├─ roster.ts     5 个角色与风格
│  ├─ prompt.ts     LLM 决策 prompt
│  ├─ parse.ts      JSON 容错解析
│  ├─ fallback.ts   启发式降级策略
│  └─ seeds.ts      确定性随机
├─ runtime/  运行时
│  ├─ manager.ts    GameManager（命令锁、AI 循环、事件发布）
│  ├─ persistence.ts settings 存档
│  └─ schemas.ts    Zod 契约
└─ ui/       可信 Solid 牌桌 UI
```

## License

MIT
