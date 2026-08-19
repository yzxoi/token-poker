/** Constructs the LLM decision prompt from a game snapshot. */
import { cardChar } from "../engine/cards";
import type { GameSnapshot } from "../engine/game";
import type { BotStyle } from "./roster";

const ACTION_HINTS = `你只能输出一个 JSON 对象（不要输出其他任何文字），格式：
{"action": "fold" | "check" | "call" | "bet" | "allIn", "amount": <整数，仅 bet 时需要>}

规则：
- 只能选择当前局面合法的行动。
- bet 的 amount 必须大于当前需要跟注的金额（如果要加注），且不能超过你的筹码。
- 如果当前没有需要跟注的金额，可以 check 或 bet。
- 中文回复一句简短 rationale（可选）。`;

/** Format a snapshot into a compact decision context for the model. */
export function buildDecisionPrompt(
  snapshot: GameSnapshot,
  seat: number,
  style: BotStyle,
): string {
  const me = snapshot.players.find((p) => p.seat === seat)!;
  const lines: string[] = [];

  lines.push(
    `# 德州扑克决策（No-Limit，盲注 ${snapshot.blinds.small}/${snapshot.blinds.big}）`,
  );
  lines.push(`你的身份：${style.name}（${style.persona}）`);
  lines.push(`你的手牌：${(me.holeCards ?? []).map(cardChar).join(" ")}`);
  lines.push(`你的筹码：${me.stack}`);
  lines.push(`底池：${snapshot.pot}`);
  lines.push(
    `当前需要跟注：${snapshot.toCall - me.contributed > 0 ? snapshot.toCall - me.contributed : 0}`,
  );
  lines.push(`最小加注额：${snapshot.minRaise}`);
  lines.push(
    `公共牌：${snapshot.communityCards.length ? snapshot.communityCards.map(cardChar).join(" ") : "（未发）"}`,
  );
  lines.push(`当前阶段：${snapshot.status}`);

  // Opponent context.
  const others = snapshot.players
    .filter((p) => p.seat !== seat)
    .map((p) => {
      const state = p.folded ? "已弃牌" : p.allIn ? "全下" : "在局";
      return `${p.name}（${state}，筹码 ${p.stack}，本轮投入 ${p.contributed}）`;
    });
  lines.push(`对手：${others.join("；")}`);

  if (snapshot.lastAction) {
    lines.push(
      `上一行动：${snapshot.players[snapshot.lastAction.seat]?.name ?? `座位${snapshot.lastAction.seat}`} ${snapshot.lastAction.text}`,
    );
  }

  lines.push("");
  lines.push(ACTION_HINTS);
  return lines.join("\n");
}
