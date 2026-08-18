import {
  agent,
  capability,
  definePlugin,
  event,
  icon,
  navigationItem,
  operation,
} from "@ericsanchezok/synergy-plugin";
import { gameManager } from "./runtime/manager";
import {
  gameSnapshotSchema,
  joinInputSchema,
  playerActionSchema,
  statsSchema,
} from "./runtime/schemas";

const AGENT_PROMPT = `你是一名德州扑克（No-Limit Hold'em）对手决策引擎。
你会收到一局牌的局面描述，必须只输出一个合法行动的 JSON 对象：
{"action": "fold"|"check"|"call"|"bet"|"allIn", "amount": <整数，仅 bet 时需要>}
不要输出任何其他文字、解释或代码围栏。只能选择当前局面合法的行动。`;

export default definePlugin({
  id: "token-poker",
  version: "0.1.0",
  name: "Token Poker",
  description: "Agent 陪玩的虚拟筹码德州扑克（Earn Tokens 风格）",
  author: "yzxoi",
  keywords: ["poker", "game", "entertainment"],
  capabilities: [
    capability("agent.call", {
      agents: ["token-poker.pro"],
      modelRoles: ["nano", "mini"],
      maxInputChars: 4_000,
      maxOutputChars: 1_000,
      maxRuntimeMs: 30_000,
    }),
    capability("settings.read"),
    capability("settings.write"),
    capability("ui.hostActions"),
  ],
  contributions: [
    agent({
      id: "pro",
      agent: {
        name: "token-poker.pro",
        description: "德州扑克 AI 对手",
        prompt: AGENT_PROMPT,
        modelRole: "mini",
        hidden: true,
      },
    }),
    event({
      id: "game.state.changed",
      payload: { handId: { type: "string" }, revision: { type: "number" } },
    }),
    operation({
      id: "game.get",
      type: "query",
      requires: ["settings.read"],
      input: {},
      output: gameSnapshotSchema,
      handler: (_input, context) => gameManager.get(context),
    }),
    operation({
      id: "game.join",
      type: "command",
      requires: ["settings.read", "settings.write", "agent.call"],
      input: joinInputSchema,
      output: gameSnapshotSchema,
      handler: ({ name }, context) => gameManager.join(context, name),
    }),
    operation({
      id: "game.action",
      type: "command",
      requires: ["settings.read", "settings.write", "agent.call"],
      input: playerActionSchema,
      output: gameSnapshotSchema,
      handler: (input, context) => gameManager.action(context, input),
    }),
    operation({
      id: "game.newHand",
      type: "command",
      requires: ["settings.read", "settings.write", "agent.call"],
      input: {},
      output: gameSnapshotSchema,
      handler: (_input, context) => gameManager.newHand(context),
    }),
    operation({
      id: "game.leave",
      type: "command",
      requires: ["settings.read", "settings.write"],
      input: {},
      output: {},
      handler: (_input, context) => gameManager.leave(context),
    }),
    operation({
      id: "game.stats",
      type: "query",
      requires: ["settings.read"],
      input: {},
      output: statsSchema,
      handler: (_input, context) => gameManager.stats(context),
    }),
    operation({
      id: "game.rebuy",
      type: "command",
      requires: ["settings.read", "settings.write"],
      input: {},
      output: {},
      handler: (_input, context) => gameManager.rebuy(context),
    }),
    navigationItem({
      id: "poker",
      label: "Poker",
      placement: "sidebar",
      icon: "poker",
      component: { source: "./src/ui/poker-page.tsx" },
    }),
    icon({ id: "poker", path: "icons/poker.svg" }),
  ],
});
