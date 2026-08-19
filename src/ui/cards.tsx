/** Card face / back rendering with deal-in animations. */
import { For, createMemo, Show, type Component } from "solid-js";
import type { Card } from "../engine/cards";
import { RANK_CHARS, SUIT_CHARS } from "../engine/cards";

/** Base classes only; deal/flip animations are applied via one-shot classes. */
export const CardFace: Component<{
  card: Card;
  small?: boolean;
  index?: number;
  deal?: boolean;
  flip?: boolean;
  /** Highlight (e.g. a hole card used in the showdown's best five). */
  marked?: boolean;
}> = (props) => {
  const red = props.card.suit === "h" || props.card.suit === "d";
  return (
    <span
      class={`tp-card ${props.small ? "tp-card--small" : ""} ${red ? "tp-card--red" : "tp-card--black"} ${
        props.deal ? "tp-card--deal" : ""
      } ${props.flip ? "tp-card--flip" : ""} ${props.marked ? "tp-card--marked" : ""}`}
      style={{ "--tp-card-index": props.index ?? 0 }}
      aria-label={`${RANK_CHARS[props.card.rank]}${SUIT_CHARS[props.card.suit]}`}
    >
      <span class="tp-card__rank">{RANK_CHARS[props.card.rank]}</span>
      <span class="tp-card__suit">{SUIT_CHARS[props.card.suit]}</span>
    </span>
  );
};

export const CardBack: Component<{
  small?: boolean;
  index?: number;
  deal?: boolean;
}> = (props) => (
  <span
    class={`tp-card tp-card--back ${props.small ? "tp-card--small" : ""} ${
      props.deal ? "tp-card--deal" : ""
    }`}
    style={{ "--tp-card-index": props.index ?? 0 }}
    aria-label="牌背"
  />
);

/** Overlapping fan of two hole cards (opponents get face-down backs). */
export const HoleCards: Component<{
  cards: Card[] | null;
  hidden: boolean;
  deal?: boolean;
}> = (props) => {
  const list = createMemo(() => props.cards ?? []);
  return (
    <span class="tp-hole" aria-label="手牌">
      <Show
        when={props.hidden}
        fallback={
          <For each={list()}>
            {(card, i) => (
              <CardFace card={card} small deal={props.deal} index={i()} />
            )}
          </For>
        }
      >
        <CardBack small deal={props.deal} index={0} />
        <CardBack small deal={props.deal} index={1} />
      </Show>
    </span>
  );
};

export const CommunityCards: Component<{
  cards: Card[];
  street: string;
}> = (props) => {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div class="tp-community" aria-label={`公共牌 ${props.street}`}>
      <div class="tp-community__row">
        {/* Each slot is an explicit reactive Show: it re-evaluates whenever
            props.cards changes, so newly dealt streets actually render. (A
            <For> over a static slot array never re-renders — its item
            functions only re-run when the `each` reference changes.)
            Undealt slots render as face-down backs, matching the reference
            look (white backing with a simple mark). */}
        {slots.map((i) => (
          <Show
            when={i < props.cards.length}
            fallback={
              <span class="tp-community__placeholder" aria-label="未发牌">
                <CardBack small index={i} />
              </span>
            }
          >
            <CardFace card={props.cards[i]} small index={i} flip />
          </Show>
        ))}
      </div>
      <span class="tp-community__street">{props.street}</span>
    </div>
  );
};

/**
 * Ranked showdown row cards: the player's best five (hole cards used in the
 * combination are marked) rendered in the engine-provided best-first order.
 */
export const BestHandCards: Component<{
  cards: Card[];
  hole: Card[];
}> = (props) => {
  const holeKeys = createMemo(
    () => new Set(props.hole.map((c) => `${c.rank}${c.suit}`)),
  );
  return (
    <span class="tp-besthand" aria-label="最佳五张">
      <For each={props.cards}>
        {(card, i) => (
          <CardFace
            card={card}
            small
            index={i()}
            marked={holeKeys().has(`${card.rank}${card.suit}`)}
          />
        )}
      </For>
    </span>
  );
};
