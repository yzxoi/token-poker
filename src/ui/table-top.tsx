/** Poker table page: seats, community cards, pot, dealer button, result overlay. */
import { createMemo, Show } from "solid-js";
import type { Component } from "solid-js";
import type { GameSnapshot } from "../engine/game";
import { formatChips } from "./format";
import { CommunityCards, HoleCards } from "./cards";

export interface TableTopProps {
  snapshot: GameSnapshot;
}

/** Deterministic avatar hue per seat. */
const AVATAR_TONES = [
  "mint",
  "cyan",
  "purple",
  "orange",
  "pink",
  "lime",
] as const;

export const TableTop: Component<TableTopProps> = (props) => {
  const activePlayers = createMemo(() => props.snapshot.players);

  const seatStyle = (seat: number) => {
    const n = activePlayers().length;
    // Fan seats around the bottom half of the felt ellipse.
    const angle = Math.PI * (0.5 + (seat / Math.max(n - 1, 1)) * 1.0);
    const rx = 46;
    const ry = 40;
    return {
      "--tp-seat-x": `${50 + Math.cos(angle) * rx}%`,
      "--tp-seat-y": `${52 + Math.sin(angle) * ry}%`,
      "--tp-avatar-tone": AVATAR_TONES[seat % AVATAR_TONES.length],
    } as Record<string, string>;
  };

  return (
    <div class="tp-table-wrap">
      <div class="tp-table" role="group" aria-label="牌桌">
        {/* felt center */}
        <div class="tp-table__center">
          <div class="tp-pot" aria-live="polite">
            <span class="tp-pot__label">Pot</span>
            <span class="tp-pot__value">{formatChips(props.snapshot.pot)}</span>
          </div>
          <CommunityCards
            cards={props.snapshot.communityCards}
            street={props.snapshot.status}
          />
          <Show when={props.snapshot.lastAction}>
            <div class="tp-table__last-action" role="status">
              {props.snapshot.players[props.snapshot.lastAction!.seat]?.name}{" "}
              {props.snapshot.lastAction!.text}
            </div>
          </Show>
        </div>

        {/* seats */}
        {activePlayers().map((p) => {
          const isTurn =
            props.snapshot.currentTurn === p.seat &&
            props.snapshot.status !== "handEnded";
          const isDealer = props.snapshot.dealerSeat === p.seat;
          const isUser = p.seat === 0;
          const isWinner =
            props.snapshot.status === "handEnded" &&
            props.snapshot.lastResult?.winnerSeats.includes(p.seat);
          return (
            <div
              class={`tp-seat ${p.folded ? "tp-seat--folded" : ""} ${isTurn ? "tp-seat--turn" : ""} ${
                p.allIn ? "tp-seat--allin" : ""
              } ${isWinner ? "tp-seat--winner" : ""}`}
              style={seatStyle(p.seat)}
            >
              <Show when={isDealer}>
                <span class="tp-seat__dealer" title="庄家">
                  D
                </span>
              </Show>
              <div
                class="tp-seat__avatar"
                data-tone={AVATAR_TONES[p.seat % AVATAR_TONES.length]}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div class="tp-seat__meta">
                <span class="tp-seat__name">{p.name}</span>
                <span class="tp-seat__stack">{formatChips(p.stack)}</span>
              </div>
              <Show when={!p.folded}>
                <HoleCards cards={p.holeCards} small={p.isBot} />
              </Show>
              <Show when={isTurn && p.isBot}>
                <div
                  class="tp-seat__thinking"
                  role="status"
                  aria-label="思考中"
                >
                  <span class="tp-seat__thinking-dot" />
                  <span class="tp-seat__thinking-dot" />
                  <span class="tp-seat__thinking-dot" />
                  Thinking
                </div>
              </Show>
              <Show when={p.allIn}>
                <span class="tp-seat__allin">ALL-IN</span>
              </Show>
              <Show when={isUser && isWinner}>
                <span class="tp-seat__win">WIN</span>
              </Show>
            </div>
          );
        })}
      </div>

      <Show
        when={
          props.snapshot.status === "handEnded" && props.snapshot.lastResult
        }
      >
        <ResultOverlay snapshot={props.snapshot} />
      </Show>
    </div>
  );
};

const ResultOverlay: Component<{ snapshot: GameSnapshot }> = (props) => {
  const result = createMemo(() => props.snapshot.lastResult!);
  const winners = createMemo(() =>
    result()
      .winnerSeats.map(
        (seat) =>
          props.snapshot.players.find((p) => p.seat === seat)?.name ??
          `座位 ${seat}`,
      )
      .join("、"),
  );
  const userWon = createMemo(() => result().winnerSeats.includes(0));
  return (
    <div
      class={`tp-result ${userWon() ? "tp-result--win" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div class="tp-result__title">
        {winners()} 赢得 {formatChips(props.snapshot.pot)}
      </div>
      <Show when={result().showdown && result().showdown!.length > 0}>
        <div class="tp-result__showdown">
          {result().showdown!.map((s) => (
            <span class="tp-result__hand">
              {props.snapshot.players.find((p) => p.seat === s.seat)?.name}：
              {s.handName}
            </span>
          ))}
        </div>
      </Show>
    </div>
  );
};
