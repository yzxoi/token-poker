/** Poker table page: seats, community cards, pot, dealer button, result overlay. */
import { createMemo, Show } from "solid-js";
import type { Component } from "solid-js";
import type { GameSnapshot } from "../engine/game";
import { formatChips } from "./format";
import { CommunityCards, HoleCards } from "./cards";

export interface TableTopProps {
  snapshot: GameSnapshot;
}

const SEAT_POSITIONS: Record<number, string> = {
  0: "tp-seat--south",
  1: "tp-seat--west",
  2: "tp-seat--northwest",
  3: "tp-seat--north",
  4: "tp-seat--northeast",
  5: "tp-seat--east",
};

export const TableTop: Component<TableTopProps> = (props) => {
  const activePlayers = createMemo(() => props.snapshot.players);

  return (
    <div class="tp-table-wrap">
      <div class="tp-table" role="group" aria-label="牌桌">
        {activePlayers().map((p) => {
          const position = SEAT_POSITIONS[p.seat] ?? "tp-seat--south";
          const isTurn =
            props.snapshot.currentTurn === p.seat &&
            props.snapshot.status !== "handEnded";
          const isDealer = props.snapshot.dealerSeat === p.seat;
          return (
            <div
              class={`tp-seat ${position} ${p.folded ? "tp-seat--folded" : ""} ${isTurn ? "tp-seat--turn" : ""} ${
                p.allIn ? "tp-seat--allin" : ""
              }`}
            >
              <div class="tp-seat__badges">
                <Show when={isDealer}>
                  <span class="tp-seat__dealer" title="庄家">
                    D
                  </span>
                </Show>
                <Show when={p.allIn}>
                  <span class="tp-seat__allin">ALL-IN</span>
                </Show>
              </div>
              <HoleCards cards={p.holeCards} small={p.isBot} />
              <div class="tp-seat__name">{p.name}</div>
              <div class="tp-seat__stack">{formatChips(p.stack)}</div>
              <Show when={isTurn && !p.isBot}>
                <div class="tp-seat__thinking">● ● Thinking</div>
              </Show>
            </div>
          );
        })}

        {/* Table center */}
        <div class="tp-table__center">
          <div class="tp-pot">Pot: {formatChips(props.snapshot.pot)}</div>
          <CommunityCards
            cards={props.snapshot.communityCards}
            street={props.snapshot.status}
          />
          <Show when={props.snapshot.lastAction}>
            <div class="tp-table__last-action">
              {props.snapshot.players[props.snapshot.lastAction!.seat]?.name}{" "}
              {props.snapshot.lastAction!.text}
            </div>
          </Show>
        </div>
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
  return (
    <div class="tp-result" role="status" aria-live="polite">
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
