/** Card face / back rendering. */
import type { Component } from "solid-js";
import type { Card } from "../engine/cards";
import { RANK_CHARS, SUIT_CHARS } from "../engine/cards";

export const CardFace: Component<{ card: Card; small?: boolean }> = (props) => {
  const red = props.card.suit === "h" || props.card.suit === "d";
  return (
    <span
      class={`tp-card ${props.small ? "tp-card--small" : ""} ${red ? "tp-card--red" : "tp-card--black"}`}
      aria-label={`${RANK_CHARS[props.card.rank]}${SUIT_CHARS[props.card.suit]}`}
    >
      <span class="tp-card__rank">{RANK_CHARS[props.card.rank]}</span>
      <span class="tp-card__suit">{SUIT_CHARS[props.card.suit]}</span>
    </span>
  );
};

export const CardBack: Component<{ small?: boolean }> = (props) => (
  <span
    class={`tp-card tp-card--back ${props.small ? "tp-card--small" : ""}`}
    aria-label="牌背"
  />
);

export const HoleCards: Component<{ cards: Card[] | null; small?: boolean }> = (
  props,
) => {
  if (!props.cards || props.cards.length === 0) {
    return (
      <span class="tp-hole">
        <CardBack small={props.small} />
        <CardBack small={props.small} />
      </span>
    );
  }
  return (
    <span class="tp-hole">
      {props.cards.map((card) => (
        <CardFace card={card} small={props.small} />
      ))}
    </span>
  );
};

export const CommunityCards: Component<{ cards: Card[]; street: string }> = (
  props,
) => {
  const slots = ["flop", "flop", "flop", "turn", "river"];
  const dealt = props.cards.length;
  return (
    <span class="tp-community">
      {slots.map((_, i) =>
        i < dealt ? (
          <CardFace card={props.cards[i]} small />
        ) : (
          <CardBack small />
        ),
      )}
      <span class="tp-community__street">{props.street}</span>
    </span>
  );
};
