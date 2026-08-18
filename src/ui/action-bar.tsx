/** Action bar: bet slider + Fold / Call / Bet buttons. */
import { createMemo, createSignal, Show } from "solid-js";
import type { Component } from "solid-js";
import type { GameSnapshot } from "../engine/game";
import { formatChips } from "./format";

export interface ActionBarProps {
  snapshot: GameSnapshot;
  busy: boolean;
  onAction: (
    action: "fold" | "call" | "bet" | "check",
    amount?: number,
  ) => void;
}

const PRESETS = [0.25, 0.33, 0.75, 1.33];

export const ActionBar: Component<ActionBarProps> = (props) => {
  const me = createMemo(
    () => props.snapshot.players.find((p) => p.seat === 0)!,
  );
  const myTurn = createMemo(
    () =>
      props.snapshot.status !== "waiting" &&
      props.snapshot.status !== "handEnded" &&
      props.snapshot.currentTurn === 0 &&
      !props.busy,
  );
  const toCall = createMemo(() => {
    const p = me();
    if (!p) return 0;
    return Math.min(props.snapshot.toCall - p.contributed, p.stack);
  });
  const minRaise = createMemo(() => props.snapshot.minRaise);
  const maxBet = createMemo(() => me()?.stack ?? 0);

  const [betAmount, setBetAmount] = createSignal<number>(0);
  const potSized = createMemo(() =>
    Math.min(maxBet(), props.snapshot.pot + toCall()),
  );
  const [selectedPreset, setSelectedPreset] = createSignal<number>(-1);

  const applyPreset = (preset: number, index: number) => {
    setSelectedPreset(index);
    const target = Math.min(maxBet(), Math.floor(props.snapshot.pot * preset));
    setBetAmount(target);
  };

  const canBet = createMemo(() => myTurn() && maxBet() > 0);
  const canCheck = createMemo(() => myTurn() && toCall() <= 0);
  const canCall = createMemo(() => myTurn() && toCall() > 0);

  const effectiveAmount = createMemo(() => {
    const amt = betAmount();
    if (amt <= 0) return potSized();
    return Math.min(maxBet(), Math.max(amt, toCall() + minRaise()));
  });

  return (
    <div class="tp-actionbar" role="group" aria-label="行动区">
      <Show when={myTurn()}>
        <div class="tp-actionbar__slider-row">
          <div class="tp-actionbar__presets">
            {PRESETS.map((p, i) => (
              <button
                type="button"
                class={`tp-btn tp-btn--preset ${selectedPreset() === i ? "tp-btn--preset-active" : ""}`}
                onClick={() => applyPreset(p, i)}
              >
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
          <div class="tp-actionbar__slider">
            <input
              type="range"
              min={0}
              max={maxBet()}
              step={100}
              value={betAmount() || potSized()}
              aria-label="下注金额"
              onChange={(e) => {
                setSelectedPreset(-1);
                setBetAmount(Number((e.target as HTMLInputElement).value));
              }}
            />
            <span class="tp-actionbar__amount">
              {formatChips(effectiveAmount())}
            </span>
          </div>
        </div>
      </Show>

      <div class="tp-actionbar__buttons">
        <Show when={canCheck()}>
          <button
            type="button"
            class="tp-btn tp-btn--secondary"
            onClick={() => props.onAction("check")}
          >
            过牌
          </button>
        </Show>
        <Show when={canCall()}>
          <button
            type="button"
            class="tp-btn tp-btn--secondary"
            onClick={() => props.onAction("call")}
          >
            跟注 {formatChips(toCall())}
          </button>
        </Show>
        <Show when={!myTurn()}>
          <span class="tp-actionbar__status" aria-live="polite">
            {props.snapshot.status === "handEnded" ||
            props.snapshot.status === "waiting"
              ? "等待下一手"
              : props.busy
                ? "对手思考中…"
                : "等待对手行动"}
          </span>
        </Show>
        <Show when={canBet()}>
          <button
            type="button"
            class="tp-btn tp-btn--primary"
            onClick={() => props.onAction("bet", effectiveAmount())}
          >
            下注 {formatChips(effectiveAmount())}
          </button>
          <button
            type="button"
            class="tp-btn tp-btn--ghost"
            onClick={() => props.onAction("fold")}
          >
            弃牌
          </button>
        </Show>
      </div>
    </div>
  );
};
