import type { Card } from "./cards";
import { freshDeck } from "./cards";
import { evaluate, compareHands, handName, type HandValue } from "./evaluate";
import { splitPots, type PotContribution } from "./pots";

export type GameStatus =
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "handEnded";

export type PlayerActionType = "fold" | "check" | "call" | "bet" | "allIn";

export interface PlayerAction {
  action: PlayerActionType;
  amount?: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  stack: number;
  holeCards: Card[] | null;
  folded: boolean;
  allIn: boolean;
  contributed: number;
  isBot: boolean;
  style?: string;
}

export interface GameSnapshot {
  handId: string;
  status: GameStatus;
  dealerSeat: number;
  communityCards: Card[];
  pot: number;
  toCall: number;
  minRaise: number;
  currentTurn: number | null;
  lastAction: {
    seat: number;
    text: string;
    amount?: number;
    action: PlayerActionType;
    /** Monotonic per-game action counter so identical actions re-trigger UI. */
    seq?: number;
  } | null;
  blinds: { small: number; big: number };
  /** Server-side monotonic revision; present on snapshots from the runtime. */
  revision?: number;
  players: PlayerState[];
  lastResult: HandResult | null;
}

export interface HandResult {
  winnerSeats: number[];
  winningAmounts: number[];
  potSplits: { seat: number; amount: number }[];
  showdown?: {
    seat: number;
    cards: Card[];
    handName: string;
    bestHand: Card[];
  }[];
}

export type GameEvent =
  | {
      kind: "playerActed";
      seat: number;
      action: PlayerActionType;
      amount?: number;
    }
  | {
      kind: "streetChanged";
      status: Exclude<GameStatus, "waiting" | "handEnded">;
    }
  | { kind: "handEnded"; result: HandResult };

export interface GameConfig {
  seats: number;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
}

export interface GameOptions {
  config: GameConfig;
  /** seat index of the dealer button for this hand. */
  dealerSeat: number;
  players: {
    seat: number;
    name: string;
    stack: number;
    isBot: boolean;
    style?: string;
  }[];
  /** deterministic seed for this hand's deck. */
  seed: number;
}

const DEFAULT_CONFIG: GameConfig = {
  seats: 6,
  smallBlind: 500,
  bigBlind: 1000,
  startingStack: 100_000,
};

interface SeatState {
  seat: number;
  name: string;
  stack: number;
  holeCards: Card[] | null;
  folded: boolean;
  allIn: boolean;
  /** chips contributed in the current betting round (reset each street). */
  contributed: number;
  /** chips contributed across the whole hand (used for pot splitting). */
  totalContributed: number;
  isBot: boolean;
  style?: string;
}

export class Game {
  readonly config: GameConfig;
  readonly dealerSeat: number;
  private seed: number;
  private deck: Card[];
  private deckIndex = 0;
  private seats: SeatState[];
  private community: Card[] = [];
  private status: GameStatus = "waiting";
  private pot = 0;
  private toCall = 0;
  private minRaise = 0;
  private currentTurn: number | null = null;
  private lastAction: GameSnapshot["lastAction"] = null;
  private handId: string;
  private lastResult: HandResult | null = null;
  /** Effective dealer button for the current hand (moves if the dealer busts). */
  private buttonSeat: number;
  /** Monotonic counter assigned to every recorded action. */
  private actionSeq = 0;
  /** Eligible players who still need to act in the current round. */
  private playersToAct = 0;
  /** True when the most recent action raised the current bet. */
  private justRaised = false;

  constructor(options: GameOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.dealerSeat = options.dealerSeat;
    this.buttonSeat = options.dealerSeat;
    this.seed = options.seed;
    this.handId = `h-${options.seed.toString(36)}`;
    this.deck = freshDeck(options.seed);
    this.seats = options.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      stack: p.stack,
      holeCards: null,
      folded: false,
      allIn: false,
      contributed: 0,
      totalContributed: 0,
      isBot: p.isBot,
      style: p.style,
    }));
  }

  getHandId(): string {
    return this.handId;
  }

  snapshot(): GameSnapshot {
    return {
      handId: this.handId,
      status: this.status,
      dealerSeat: this.buttonSeat,
      communityCards: [...this.community],
      pot: this.pot,
      toCall: this.toCall,
      minRaise: this.minRaise,
      currentTurn: this.currentTurn,
      lastAction: this.lastAction,
      blinds: {
        small: this.config.smallBlind,
        big: this.config.bigBlind,
      },
      players: this.seats.map((p) => ({
        seat: p.seat,
        name: p.name,
        stack: p.stack,
        holeCards: p.holeCards ? [...p.holeCards] : null,
        folded: p.folded,
        allIn: p.allIn,
        contributed: p.contributed,
        isBot: p.isBot,
        style: p.style,
      })),
      lastResult: this.lastResult,
    };
  }

  /** Record the latest action with a fresh monotonic seq. */
  private recordAction(
    seat: number,
    text: string,
    action: PlayerActionType,
    amount?: number,
  ): void {
    this.lastAction = { seat, text, amount, action, seq: ++this.actionSeq };
  }

  /** Start a new hand: post blinds, deal hole cards, set first actor. */
  startHand(): GameEvent[] {
    if (this.status !== "waiting") throw new Error("hand already started");
    const events: GameEvent[] = [];
    const activeSeats = this.seats
      .filter((p) => p.stack > 0)
      .map((p) => p.seat);
    if (activeSeats.length < 2)
      throw new Error("need at least 2 players with stack");
    for (const p of this.seats) {
      p.folded = false;
      p.allIn = false;
      p.contributed = 0;
      p.totalContributed = 0;
    }
    this.community = [];
    this.pot = 0;
    this.lastResult = null;
    this.deckIndex = 0;
    this.deck = freshDeck(this.seed);
    this.justRaised = false;

    // Move the button to the next live seat when the current dealer is busted.
    if (!activeSeats.includes(this.buttonSeat)) {
      for (let i = 1; i <= this.config.seats; i++) {
        const candidate = (this.dealerSeat + i) % this.config.seats;
        if (activeSeats.includes(candidate)) {
          this.buttonSeat = candidate;
          break;
        }
      }
    }

    const dealerIdx = activeSeats.indexOf(this.buttonSeat);
    const sbSeat = activeSeats[(dealerIdx + 1) % activeSeats.length];
    const bbSeat = activeSeats[(dealerIdx + 2) % activeSeats.length];

    const post = (seat: number, amount: number) => {
      const p = this.seat(seat);
      const actual = Math.min(amount, p.stack);
      p.stack -= actual;
      p.contributed += actual;
      p.totalContributed += actual;
      this.pot += actual;
      if (p.stack === 0) p.allIn = true;
      return actual;
    };

    const sb = post(sbSeat, this.config.smallBlind);
    const bb = post(bbSeat, this.config.bigBlind);
    this.toCall = this.config.bigBlind;
    this.minRaise = this.config.bigBlind;

    for (let round = 0; round < 2; round++) {
      for (const s of activeSeats) {
        this.seat(s).holeCards = [this.draw(), this.draw()];
      }
    }

    this.status = "preflop";
    this.playersToAct = this.countEligible();
    // Heads-up: SB (dealer) acts first; otherwise the seat left of the BB.
    this.currentTurn =
      activeSeats.length === 2
        ? this.buttonSeat
        : activeSeats[(dealerIdx + 3) % activeSeats.length];
    this.recordAction(bbSeat, `大盲 ${bb}`, "bet", bb);
    events.push({
      kind: "playerActed",
      seat: sbSeat,
      action: "bet",
      amount: sb,
    });
    events.push({
      kind: "playerActed",
      seat: bbSeat,
      action: "bet",
      amount: bb,
    });
    events.push({ kind: "streetChanged", status: "preflop" });
    return events;
  }

  private seat(n: number): SeatState {
    return this.seats.find((p) => p.seat === n)!;
  }

  private draw(): Card {
    return this.deck[this.deckIndex++];
  }

  /** Eligible = in the hand, able to act, and holding chips. */
  private countEligible(): number {
    return this.seats.filter((p) => !p.folded && !p.allIn && p.stack > 0)
      .length;
  }

  /** Apply a player action. Returns events; throws on invalid action. */
  applyAction(seat: number, action: PlayerAction): GameEvent[] {
    if (this.status === "waiting" || this.status === "handEnded") {
      throw new Error("牌局未开始");
    }
    if (this.currentTurn !== seat) {
      throw new Error(`不是 ${seat} 的行动回合`);
    }
    const p = this.seat(seat);
    if (p.folded || p.allIn) throw new Error("该玩家已弃牌或全下");

    const events: GameEvent[] = [];
    const toCall = Math.min(this.toCall - p.contributed, p.stack);
    this.justRaised = false;
    switch (action.action) {
      case "fold": {
        p.folded = true;
        this.recordAction(seat, "弃牌", "fold");
        events.push({ kind: "playerActed", seat, action: "fold" });
        break;
      }
      case "check": {
        if (toCall > 0) throw new Error("必须跟注或弃牌");
        this.recordAction(seat, "过牌", "check");
        events.push({ kind: "playerActed", seat, action: "check" });
        break;
      }
      case "call": {
        if (toCall <= 0) {
          this.recordAction(seat, "过牌", "check");
          events.push({ kind: "playerActed", seat, action: "check" });
        } else {
          const paid = this.putIn(seat, toCall);
          this.recordAction(seat, `跟注 ${paid}`, "call", paid);
          events.push({
            kind: "playerActed",
            seat,
            action: "call",
            amount: paid,
          });
        }
        break;
      }
      case "bet": {
        const amount = action.amount ?? 0;
        if (amount <= 0) throw new Error("下注金额必须为正");
        if (amount > p.stack) throw new Error("下注金额超过筹码");
        const newTotal = p.contributed + amount;
        if (newTotal < this.toCall) throw new Error("下注不足到顶注");
        const raiseAmount = newTotal - this.toCall;
        if (
          raiseAmount > 0 &&
          raiseAmount < this.minRaise &&
          amount < p.stack
        ) {
          throw new Error("加注不足最小加注额");
        }
        const paid = this.putIn(seat, amount);
        if (p.contributed > this.toCall) {
          this.justRaised = true;
          this.minRaise = Math.max(this.minRaise, p.contributed - this.toCall);
          this.toCall = p.contributed;
        }
        this.recordAction(seat, `下注 ${paid}`, "bet", paid);
        events.push({ kind: "playerActed", seat, action: "bet", amount: paid });
        break;
      }
      case "allIn": {
        const paid = this.putIn(seat, p.stack);
        if (p.contributed > this.toCall) {
          this.justRaised = true;
          this.minRaise = Math.max(this.minRaise, p.contributed - this.toCall);
          this.toCall = p.contributed;
        }
        this.recordAction(seat, `全下 ${paid}`, "allIn", paid);
        events.push({
          kind: "playerActed",
          seat,
          action: "allIn",
          amount: paid,
        });
        break;
      }
      default:
        throw new Error("未知行动");
    }

    events.push(...this.advance());
    return events;
  }

  private putIn(seat: number, amount: number): number {
    const p = this.seat(seat);
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.contributed += actual;
    p.totalContributed += actual;
    this.pot += actual;
    if (p.stack === 0) p.allIn = true;
    return actual;
  }

  /** Actors in order starting left of the effective dealer button, wrapping. */
  private actionOrder(): number[] {
    const seats = [...Array(this.config.seats).keys()];
    const start = (this.buttonSeat + 1) % this.config.seats;
    return [...seats.slice(start), ...seats.slice(0, start)];
  }

  /** Next eligible seat strictly after `from` in action order, or null. */
  private nextEligible(from: number | null): number | null {
    const order = this.actionOrder();
    const start = from === null ? 0 : (order.indexOf(from) + 1) % order.length;
    for (let i = 0; i < order.length; i++) {
      const seat = order[(start + i) % order.length];
      const p = this.seat(seat);
      if (!p.folded && !p.allIn && p.stack > 0) return seat;
    }
    return null;
  }

  /** True when every eligible player has matched the current bet. */
  private allMatched(): boolean {
    for (const p of this.seats) {
      if (
        !p.folded &&
        !p.allIn &&
        p.stack > 0 &&
        p.contributed !== this.toCall
      ) {
        return false;
      }
    }
    return true;
  }

  /** Advance betting round / street / hand after an action. */
  private advance(): GameEvent[] {
    const events: GameEvent[] = [];
    const nonFolded = this.seats.filter((p) => !p.folded);

    if (nonFolded.length === 1) {
      const winner = nonFolded[0];
      winner.stack += this.pot;
      const result: HandResult = {
        winnerSeats: [winner.seat],
        winningAmounts: [this.pot],
        potSplits: [{ seat: winner.seat, amount: this.pot }],
      };
      this.lastResult = result;
      this.status = "handEnded";
      this.currentTurn = null;
      events.push({ kind: "handEnded", result });
      return events;
    }

    if (this.justRaised) {
      const eligible = this.countEligible();
      this.playersToAct = Math.max(
        0,
        eligible - (this.seat(this.currentTurn!).allIn ? 0 : 1),
      );
    } else {
      this.playersToAct -= 1;
    }
    this.justRaised = false;

    if (this.playersToAct > 0 || !this.allMatched()) {
      const next = this.nextEligible(this.currentTurn);
      if (next === null) {
        // No eligible player can act (everyone else all-in or folded): the
        // remaining board is dealt lazily via needsRunout()/advanceRunout().
        this.currentTurn = null;
        return events;
      }
      this.currentTurn = next;
      return events;
    }

    // Round complete: deal next street or showdown.
    if (this.status === "preflop") {
      this.community.push(this.draw(), this.draw(), this.draw());
      this.status = "flop";
      events.push({ kind: "streetChanged", status: "flop" });
    } else if (this.status === "flop") {
      this.community.push(this.draw());
      this.status = "turn";
      events.push({ kind: "streetChanged", status: "turn" });
    } else if (this.status === "turn") {
      this.community.push(this.draw());
      this.status = "river";
      events.push({ kind: "streetChanged", status: "river" });
    } else if (this.status === "river") {
      this.status = "showdown";
      events.push(...this.settle());
      return events;
    }

    this.toCall = 0;
    this.minRaise = this.config.bigBlind;
    this.justRaised = false;
    for (const p of this.seats) {
      if (!p.folded) p.contributed = 0;
    }
    this.playersToAct = this.countEligible();
    const headsUp =
      nonFolded.length === 2 && !this.seat(this.buttonSeat).folded;
    const first =
      headsUp && !this.seat(this.buttonSeat).allIn
        ? this.buttonSeat
        : this.nextEligible(this.buttonSeat);
    if (first === null) {
      // All-in runout: deal the remaining board lazily, one street at a time.
      this.currentTurn = null;
      return events;
    }
    this.currentTurn = first;
    return events;
  }

  /**
   * True when betting is complete but board cards still need to be dealt
   * (all-in runout). The caller drives the board one street at a time via
   * advanceRunout() so the UI can display each street.
   */
  needsRunout(): boolean {
    if (this.currentTurn !== null) return false;
    if (
      this.status !== "preflop" &&
      this.status !== "flop" &&
      this.status !== "turn" &&
      this.status !== "river"
    ) {
      return false;
    }
    if (this.seats.filter((p) => !p.folded).length <= 1) return false;
    return this.countEligible() === 0;
  }

  /** Deal exactly one more board street (or settle at the river). */
  advanceRunout(): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status === "preflop") {
      this.community.push(this.draw(), this.draw(), this.draw());
      this.status = "flop";
      events.push({ kind: "streetChanged", status: "flop" });
    } else if (this.status === "flop") {
      this.community.push(this.draw());
      this.status = "turn";
      events.push({ kind: "streetChanged", status: "turn" });
    } else if (this.status === "turn") {
      this.community.push(this.draw());
      this.status = "river";
      events.push({ kind: "streetChanged", status: "river" });
    } else if (this.status === "river") {
      this.status = "showdown";
      events.push(...this.settle());
    }
    return events;
  }

  /** Evaluate showdown and award pots. */
  private settle(): GameEvent[] {
    const nonFolded = this.seats.filter((p) => !p.folded);
    const contributions: PotContribution[] = nonFolded.map((p) => ({
      seat: p.seat,
      amount: p.totalContributed,
    }));
    const rankSeats = (candidates: number[]): number[] => {
      const hands = new Map<number, HandValue>();
      for (const seat of candidates) {
        const p = this.seat(seat);
        hands.set(seat, evaluate([...(p.holeCards ?? []), ...this.community]));
      }
      const best = [...hands.values()].reduce((a, b) =>
        compareHands(a, b) >= 0 ? a : b,
      );
      return candidates.filter(
        (seat) => compareHands(hands.get(seat)!, best) === 0,
      );
    };
    const splits = splitPots(contributions, rankSeats);
    const totals = new Map<number, number>();
    for (const s of splits)
      totals.set(s.seat, (totals.get(s.seat) ?? 0) + s.amount);
    for (const [seat, amount] of totals) {
      this.seat(seat).stack += amount;
    }

    // Ranked showdown: strongest hand first, so the UI can render a sorted
    // list without re-evaluating. Ties keep their seat order.
    const showdownEntries = nonFolded
      .filter((p) => p.holeCards)
      .map((p) => {
        const cards = [...(p.holeCards ?? [])];
        const value = evaluate([...cards, ...this.community]);
        return {
          seat: p.seat,
          cards,
          handName: handName(value),
          bestHand: bestFive(cards, this.community),
          value,
        };
      })
      .sort((a, b) => compareHands(b.value, a.value))
      .map(({ seat, cards, handName: name, bestHand }) => ({
        seat,
        cards,
        handName: name,
        bestHand,
      }));

    const result: HandResult = {
      winnerSeats: [...totals.keys()],
      winningAmounts: [...totals.keys()].map((s) => totals.get(s)!),
      potSplits: splits,
      showdown: showdownEntries,
    };
    this.lastResult = result;
    this.status = "handEnded";
    this.currentTurn = null;
    return [{ kind: "handEnded", result }];
  }

  getLastResult(): HandResult | null {
    return this.lastResult;
  }
}

/** Best 5-card subset of hole+community matching the overall hand value. */
function bestFive(hole: Card[], community: Card[]): Card[] {
  const all = [...hole, ...community];
  const best = evaluate(all);
  const pick: number[] = [];
  let found: Card[] | null = null;
  const walk = (start: number) => {
    if (found) return;
    if (pick.length === 5) {
      if (compareHands(evaluate(pick.map((i) => all[i])), best) === 0) {
        found = pick.map((i) => all[i]);
      }
      return;
    }
    for (let i = start; i < all.length; i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return found ?? all.slice(0, 5);
}
