/** Card face / back rendering with deal-in animations. */
import type { Component } from "solid-js";
import type { Card } from "../engine/cards";
import { RANK_CHARS, SUIT_CHARS } from "../engine/cards";

export const CardFace: Component<{
  card: Card;
  small?: boolean;
  index?: number;
}> = (props) => {
  const red = props.card.suit === "h" || props.card.suit === "d";
  return (
    <span
      class={`tp-card ${props.small ? "tp-card--small" : ""} ${red ? "tp-card--red" : "tp-card--black"}`}
      style={{ "--tp-card-index": props.index ?? 0 }}
      aria-label={`${RANK_CHARS[props.card.rank]}${SUIT_CHARS[props.card.suit]}`}
    >
      <span class="tp-card__rank">{RANK_CHARS[props.card.rank]}</span>
      <span class="tp-card__suit">{SUIT_CHARS[props.card.suit]}</span>
    </span>
  );
};

export const CardBack: Component<{ small?: boolean; index?: number }> = (
  props,
) => (
  <span
    class={`tp-card tp-card--back ${props.small ? "tp-card--small" : ""}`}
    style={{ "--tp-card-index": props.index ?? 0 }}
    aria-label="牌背"
  >
    <span class="tp-card__backmark" />
  </span>
);

/** Overlapping fan of two hole cards. */
export const HoleCards: Component<{ cards: Card[] | null; small?: boolean }> = (
  props,
) => {
  const back = () => (
    <>
      <CardBack small={props.small} index={0} />
      <CardBack small={props.small} index={1} />
    </>
  );
  return (
    <span class="tp-hole" aria-label="手牌">
      {props.cards && props.cards.length > 0
        ? props.cards.map((card, i) => (
            <CardFace card={card} small={props.small} index={i} />
          ))
        : back()}
    </span>
  );
};

export const CommunityCards: Component<{ cards: Card[]; street: string }> = (
  props,
) => {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div class="tp-community" aria-label={`公共牌 ${props.street}`}>
      <div class="tp-community__row">
        {slots.map((i) =>
          i < props.cards.length ? (
            <CardFace card={props.cards[i]} small index={i} />
          ) : (
            <span class="tp-card tp-card--empty" aria-label="未发牌" />
          ),
        )}
      </div>
      <span class="tp-community__street">{props.street}</span>
    </div>
  );
};
