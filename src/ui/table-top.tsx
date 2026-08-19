/** Poker table page: seats, community cards, pot, dealer button, result overlay. */
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  type Component,
} from "solid-js";
import type { GameSnapshot, PlayerActionType } from "../engine/game";
import { formatChips } from "./format";
import { BestHandCards, CardFace, CommunityCards, HoleCards } from "./cards";

export interface TableTopProps {
  snapshot: GameSnapshot;
}

/** Deterministic avatar tone per seat; hero is monochrome slate. */
const AVATAR_TONES = [
  "slate", // 0: hero — monochrome
  "cyan", // 1
  "purple", // 2
  "orange", // 3
  "pink", // 4
  "lime", // 5
] as const;

/**
 * Seat anchor points for the stadium table (rounded ends left/right, straight
 * edges top/bottom): three seats on each straight edge. Percentages of the
 * table container; seats glide between anchors via CSS left/top transitions.
 */
const SEAT_POSITIONS: { x: number; y: number }[] = [
  { x: 50, y: 94 }, // 0: bottom center (user)
  { x: 28, y: 94 }, // 1: bottom left
  { x: 28, y: 6 }, // 2: top left
  { x: 50, y: 6 }, // 3: top center
  { x: 72, y: 6 }, // 4: top right
  { x: 72, y: 94 }, // 5: bottom right
];

const STREET_LABELS: Record<string, string> = {
  waiting: "等待",
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
  handEnded: "本局结束",
};

/** Per-seat action bubble anchored at the acting seat. */
interface SeatBubble {
  key: string;
  seat: number;
  text: string;
  action: PlayerActionType;
}

export const TableTop: Component<TableTopProps> = (props) => {
  const players = createMemo(() => props.snapshot.players);
  const [bubble, setBubble] = createSignal<SeatBubble | null>(null);

  const seatStyle = (seat: number) => {
    const pos = SEAT_POSITIONS[seat % SEAT_POSITIONS.length];
    return {
      "--tp-seat-x": `${pos.x}%`,
      "--tp-seat-y": `${pos.y}%`,
    } as Record<string, string>;
  };

  // Show a per-seat bubble for every distinct action. Keyed on the engine's
  // monotonic seq (not text) so identical consecutive actions re-trigger. The
  // hide timer is tracked manually so a newer action replaces the old one.
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(
      () => {
        const la = props.snapshot.lastAction;
        if (!la || la.seq === undefined) return null;
        return `${props.snapshot.handId}:${la.seat}:${la.seq}`;
      },
      (key) => {
        if (!key) return;
        const la = props.snapshot.lastAction;
        if (!la || la.seq === undefined) return;
        if (bubbleTimer !== undefined) clearTimeout(bubbleTimer);
        setBubble({ key, seat: la.seat, text: la.text, action: la.action });
        bubbleTimer = setTimeout(() => {
          setBubble((cur) => (cur && cur.key === key ? null : cur));
          bubbleTimer = undefined;
        }, 1700);
      },
    ),
  );

  const heroName = createMemo(() => players().find((p) => p.seat === 0)?.name);

  // Hole cards animate in only during the preflop street of each hand: the
  // class flips false→true exactly once per hand, so stable keyed DOM nodes
  // don't replay the animation on poll refreshes.
  const dealing = createMemo(() => props.snapshot.status === "preflop");
  const street = createMemo(
    () => STREET_LABELS[props.snapshot.status] ?? props.snapshot.status,
  );

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
            street={street()}
          />
        </div>

        {/* seats: keyed by identity so poll refreshes never rebuild nodes */}
        <For each={players()}>
          {(p) => {
            const isTurn =
              props.snapshot.currentTurn === p.seat &&
              props.snapshot.status !== "handEnded";
            const isDealer = props.snapshot.dealerSeat === p.seat;
            const isWinner =
              props.snapshot.status === "handEnded" &&
              (props.snapshot.lastResult?.winnerSeats.includes(p.seat) ??
                false);
            const isLoser =
              props.snapshot.status === "handEnded" &&
              !p.folded &&
              !isWinner &&
              (props.snapshot.lastResult?.showdown?.some(
                (s) => s.seat === p.seat,
              ) ??
                false);
            // Busted only after the hand settles; during play an all-in
            // player keeps the ALL-IN tag instead of a dead overlay.
            const settled =
              props.snapshot.status === "handEnded" ||
              props.snapshot.status === "waiting";
            const isBusted = settled && p.stack <= 0;
            const myBubble = () => {
              const b = bubble();
              return b && b.seat === p.seat ? b : null;
            };
            return (
              <div
                class={`tp-seat ${p.folded ? "tp-seat--folded" : ""} ${isTurn ? "tp-seat--turn" : ""} ${
                  p.allIn ? "tp-seat--allin" : ""
                } ${isWinner ? "tp-seat--winner" : ""} ${isBusted ? "tp-seat--busted" : ""}`}
                style={seatStyle(p.seat)}
              >
                {/* action bubble anchored at this seat */}
                <Show when={myBubble()}>
                  {(b) => (
                    <div
                      class={`tp-bubble tp-bubble--${b().action}`}
                      role="status"
                    >
                      {b().text}
                    </div>
                  )}
                </Show>
                {/* Hole cards peek out from behind the pill; the pill paints
                    over their lower half (body comes later in DOM). */}
                <Show when={!p.folded}>
                  <HoleCards
                    cards={p.holeCards}
                    hidden={p.isBot}
                    deal={dealing()}
                  />
                </Show>
                {/* The flat pill: avatar + name + stack in a row. */}
                <div class="tp-seat__body">
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
                  <Show when={isTurn && p.isBot}>
                    <div
                      class="tp-seat__thinking"
                      role="status"
                      aria-label="思考中"
                    >
                      <span class="tp-seat__thinking-dot" />
                      <span class="tp-seat__thinking-dot" />
                      <span class="tp-seat__thinking-dot" />
                    </div>
                  </Show>
                  <Show when={isTurn && p.seat === 0}>
                    <span class="tp-seat__yourturn">轮到你</span>
                  </Show>
                  <Show when={p.allIn && !isBusted}>
                    <span class="tp-seat__allin">ALL-IN</span>
                  </Show>
                  <Show when={p.folded && !isBusted}>
                    <span class="tp-seat__folded-tag">已弃牌</span>
                  </Show>
                  <Show when={isWinner}>
                    <span class="tp-seat__win">WIN</span>
                  </Show>
                  <Show when={isLoser}>
                    <span class="tp-seat__lose-tag">落败</span>
                  </Show>
                </div>
                <Show when={isBusted}>
                  <span class="tp-seat__busted-tag">已出局</span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Show
        when={
          props.snapshot.status === "handEnded" && props.snapshot.lastResult
        }
      >
        <ResultOverlay snapshot={props.snapshot} heroName={heroName()} />
      </Show>
    </div>
  );
};

const ResultOverlay: Component<{
  snapshot: GameSnapshot;
  heroName?: string;
}> = (props) => {
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
  const userPlayed = createMemo(() => {
    const hero = props.snapshot.players.find((p) => p.seat === 0);
    return hero ? !hero.folded : false;
  });
  const heroAmount = createMemo(() => {
    const idx = result().winnerSeats.indexOf(0);
    return idx >= 0 ? (result().winningAmounts[idx] ?? 0) : 0;
  });

  // Ranked rows: the engine's showdown list is already sorted strongest
  // first. Each row shows the player's best five (hole cards highlighted).
  const rows = createMemo(() => {
    const showdown = result().showdown ?? [];
    return showdown.map((s, rank) => {
      const player = props.snapshot.players.find((p) => p.seat === s.seat);
      const isWinner = result().winnerSeats.includes(s.seat);
      const winIdx = result().winnerSeats.indexOf(s.seat);
      const won = isWinner ? (result().winningAmounts[winIdx] ?? 0) : 0;
      return {
        rank,
        seat: s.seat,
        name: player?.name ?? `座位 ${s.seat}`,
        handName: s.handName,
        bestHand: s.bestHand,
        hole: s.cards,
        isWinner,
        won,
        isHero: s.seat === 0,
      };
    });
  });
  // Folded players (no showdown entry) render as one collapsed line.
  const foldedNames = createMemo(() =>
    props.snapshot.players
      .filter((p) => p.folded && p.seat !== 0)
      .map((p) => p.name)
      .join("、"),
  );

  // Animated count-up for the hero's winnings. Manual raf handle (a cleanup
  // function returned from a createEffect-on callback is not reliably run).
  const [displayAmount, setDisplayAmount] = createSignal(0);
  let countRaf = 0;
  createEffect(
    on(userWon, (won) => {
      cancelAnimationFrame(countRaf);
      if (!won) {
        setDisplayAmount(0);
        return;
      }
      const target = heroAmount();
      const start = performance.now();
      const duration = 900;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayAmount(Math.round(target * eased));
        if (t < 1) countRaf = requestAnimationFrame(tick);
      };
      countRaf = requestAnimationFrame(tick);
    }),
  );

  const title = createMemo(() => {
    if (userWon()) return "你赢了！";
    if (userPlayed()) return "你输了";
    return `${winners()} 获胜`;
  });

  return (
    <div
      class={`tp-result ${userWon() ? "tp-result--win" : "tp-result--lose"}`}
      role="status"
      aria-live="polite"
    >
      <div class="tp-result__spotlight" aria-hidden="true" />
      <div class="tp-result__title">{title()}</div>
      <Show when={userWon()}>
        <div class="tp-result__amount">+{formatChips(displayAmount())}</div>
      </Show>
      <Show when={!userWon() && !userPlayed()}>
        <div class="tp-result__subtitle">
          {winners()} 赢得 {formatChips(props.snapshot.pot)}
        </div>
      </Show>
      <Show when={props.snapshot.communityCards.length > 0}>
        <div class="tp-result__board" aria-label="公共牌">
          {props.snapshot.communityCards.map((c, i) => (
            <CardFace card={c} small index={i} />
          ))}
        </div>
      </Show>
      <Show when={rows().length > 0}>
        <div class="tp-result__ranked" aria-label="摊牌牌型排行">
          <For each={rows()}>
            {(row) => (
              <div
                class={`tp-result__row ${
                  row.isWinner ? "tp-result__row--winner" : ""
                } ${row.isHero ? "tp-result__row--hero" : ""}`}
              >
                <span class="tp-result__rank">{row.rank + 1}</span>
                <span class="tp-result__row-name">{row.name}</span>
                <BestHandCards cards={row.bestHand} hole={row.hole} />
                <span class="tp-result__row-hand">{row.handName}</span>
                <Show when={row.isWinner}>
                  <span class="tp-result__row-win">
                    +{formatChips(row.won)}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={foldedNames().length > 0}>
        <div class="tp-result__folded">已弃牌：{foldedNames()}</div>
      </Show>
    </div>
  );
};
