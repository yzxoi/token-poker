/** GameManager: per-scope game sessions, serialized commands, AI opponent loop. */
import type { PluginInvocationContext } from "@ericsanchezok/synergy-plugin";
import {
  Game,
  type GameSnapshot,
  type PlayerAction,
  type PlayerState,
} from "../engine/game";
import { styleForSeat } from "../ai/roster";
import { decideFallback } from "../ai/fallback";
import { buildDecisionPrompt } from "../ai/prompt";
import { parseDecisionText } from "../ai/parse";
import { decisionSeed, handSeed } from "../ai/seeds";
import { loadState, saveState, type StoredState } from "./persistence";

export const STARTING_STACK = 100_000;
export const SMALL_BLIND = 500;
export const BIG_BLIND = 1_000;

export interface GameSession {
  scopeId: string;
  game: Game;
  stored: StoredState;
  /** Monotonic hand counter for seeding. */
  handIndex: number;
  /** In-memory per-hand nonce. */
  nonce: number;
  /** True while an AI chain is running (prevents concurrent commands). */
  busy: boolean;
  /** Latest snapshot (for recovery persistence). */
  lastSnapshot: GameSnapshot | null;
  revision: number;
  /** Balance before the current hand (for net tracking). */
  handStartBalance: number;
}

export class GameManager {
  private sessions = new Map<string, GameSession>();

  /** Ensure a session exists for the scope (loads or creates state). */
  private async session(
    context: PluginInvocationContext,
  ): Promise<GameSession> {
    const scopeId = context.scopeId;
    let session = this.sessions.get(scopeId);
    if (!session) {
      const stored = await loadState(context);
      session = {
        scopeId,
        game: this.restoreGame(stored),
        stored,
        handIndex: 1,
        nonce: Math.floor(Math.random() * 0xffffffff),
        busy: false,
        lastSnapshot: null,
        revision: 0,
        handStartBalance: stored.balance,
      };
      this.sessions.set(scopeId, session);
    }
    return session;
  }

  /** Rebuild a Game from persisted state, or a fresh waiting game. */
  private restoreGame(stored: StoredState): Game {
    const recovery = stored.recovery;
    if (!recovery) {
      return new Game({
        config: {
          seats: 6,
          smallBlind: SMALL_BLIND,
          bigBlind: BIG_BLIND,
          startingStack: STARTING_STACK,
        },
        dealerSeat: 4,
        players: this.rosterPlayers(stored),
        seed: handSeed(Math.floor(Date.now() / 1000), 0),
      });
    }
    // Rebuild the mid-hand state we persisted on leave. The user hand is not
    // replayed; a fresh recovery hand starts from the same financial
    // position (stored.balance is authoritative for the user, stacks for AI).
    const players = this.rosterPlayers(stored).map((p) =>
      p.seat === 0 ? { ...p, stack: stored.balance } : p,
    );
    return new Game({
      config: {
        seats: 6,
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        startingStack: STARTING_STACK,
      },
      dealerSeat: 4,
      players,
      seed: handSeed(Math.floor(Date.now() / 1000), 0),
    });
  }

  private rosterPlayers(stored: StoredState): {
    seat: number;
    name: string;
    stack: number;
    isBot: boolean;
    style?: string;
  }[] {
    const seats: {
      seat: number;
      name: string;
      stack: number;
      isBot: boolean;
      style?: string;
    }[] = [];
    seats.push({
      seat: 0,
      name: stored.user.name || "你",
      stack: stored.balance || STARTING_STACK,
      isBot: false,
    });
    for (let seat = 1; seat <= 5; seat++) {
      const style = styleForSeat(seat);
      seats.push({
        seat,
        name: stored.roster[String(seat)] || style.name,
        stack: STARTING_STACK,
        isBot: true,
        style: style.name,
      });
    }
    return seats;
  }

  /**
   * Public snapshot for the UI: hides AI hole cards so opponents cannot be
   * read. Showdown hands are still visible through `lastResult.showdown`.
   */
  private publicSnapshot(session: GameSession): GameSnapshot {
    const snap = session.game.snapshot();
    return {
      ...snap,
      players: snap.players.map((p) => ({
        ...p,
        holeCards: p.isBot ? null : p.holeCards,
      })),
      revision: session.revision,
    };
  }

  /** Serialize all commands per session. */
  private async withLock<T>(
    session: GameSession,
    fn: () => Promise<T>,
  ): Promise<T> {
    while (session.busy) {
      await new Promise((r) => setTimeout(r, 10));
    }
    session.busy = true;
    try {
      return await fn();
    } finally {
      session.busy = false;
    }
  }

  private publishChanged(
    context: PluginInvocationContext,
    session: GameSession,
    snapshot: GameSnapshot,
  ): void {
    session.revision++;
    session.lastSnapshot = snapshot;
    void context.events
      ?.publish?.("game.state.changed", {
        handId: snapshot.handId,
        revision: session.revision,
      })
      .catch(() => {});
  }

  /** Drive the AI opponent loop until it is the user's turn or the hand ends. */
  private async runAiLoop(
    context: PluginInvocationContext,
    session: GameSession,
  ): Promise<void> {
    for (let guard = 0; guard < 200; guard++) {
      const snap = session.game.snapshot();
      const turn = snap.currentTurn;
      if (snap.status === "waiting") return;
      if (snap.status === "handEnded") {
        await this.finishHand(context, session);
        return;
      }
      if (turn === null) {
        // No one can act: either an all-in runout is pending or the hand is
        // waiting on the user. Deal the runout one street at a time so the
        // UI can display each board street instead of jumping straight from
        // preflop to settlement.
        if (!session.game.needsRunout()) return;
        await this.publishRunout(context, session);
        if (session.game.snapshot().status === "handEnded") {
          await this.finishHand(context, session);
          return;
        }
        continue;
      }
      const player = snap.players.find((p) => p.seat === turn)!;
      if (!player.isBot) return;
      const action = await this.decideFor(context, session, snap, turn, player);
      try {
        session.game.applyAction(turn, action);
      } catch {
        // The AI returned an invalid action (typically a raise below the
        // minimum). Repair it into the closest legal action — folding here
        // used to cascade: a few mis-bets in a row folded every opponent
        // and ended the hand before the flop.
        const repaired = this.repairAction(snap, player, action);
        try {
          session.game.applyAction(turn, repaired);
        } catch {
          try {
            session.game.applyAction(turn, { action: "fold" });
          } catch {
            return;
          }
        }
      }
      this.publishChanged(context, session, this.publicSnapshot(session));
    }
  }

  /** Deal the remaining board one street at a time, publishing each street. */
  private async publishRunout(
    context: PluginInvocationContext,
    session: GameSession,
  ): Promise<void> {
    while (session.game.needsRunout()) {
      session.game.advanceRunout();
      this.publishChanged(context, session, this.publicSnapshot(session));
      if (session.game.snapshot().status === "handEnded") return;
      // Pause between streets so the UI shows flop → turn → river progression.
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  /**
   * Repair an invalid AI action into the closest legal one. Bet amounts are
   * treated as raise deltas: a bet that only matches the current bet becomes
   * a call, an undersized raise is clamped up to the minimum raise (or the
   * whole stack, which the engine always allows), and a zero bet with
   * nothing to call becomes a check.
   */
  private repairAction(
    snap: GameSnapshot,
    player: PlayerState,
    action: PlayerAction,
  ): PlayerAction {
    const toCallDelta = Math.max(0, snap.toCall - player.contributed);
    if (action.action === "bet") {
      const desired = Math.max(0, action.amount ?? 0);
      if (toCallDelta > 0 && desired <= toCallDelta) {
        return { action: "call" };
      }
      if (toCallDelta === 0 && desired <= 0) {
        return { action: "check" };
      }
      const minLegal = toCallDelta + snap.minRaise;
      const amount = Math.min(player.stack, Math.max(minLegal, desired));
      if (amount > 0 && player.contributed + amount >= snap.toCall) {
        return { action: "bet", amount };
      }
    }
    return toCallDelta > 0 ? { action: "call" } : { action: "check" };
  }

  private async decideFor(
    context: PluginInvocationContext,
    session: GameSession,
    snap: GameSnapshot,
    seat: number,
    player: PlayerState,
  ): Promise<PlayerAction> {
    const style = styleForSeat(seat);
    const ai = session.stored.ai;
    const seed = decisionSeed(session.nonce, seat, snap.status);

    // When AI is off, always fallback.
    if (ai.frequency === "off") {
      return decideFallback({ snapshot: snap, seat, style, seed });
    }

    try {
      const result = await context.agent?.call?.({
        agent: "token-poker.pro",
        text: buildDecisionPrompt(snap, seat, style),
        modelRole: ai.modelRole,
        timeoutMs: 15_000,
        maxOutputChars: 1_000,
      });
      const text = result?.text ?? "";
      const parsed = parseDecisionText(text);
      if (parsed) return parsed.action;
    } catch {
      // Fall through to heuristic.
    }
    return decideFallback({ snapshot: snap, seat, style, seed });
  }

  /** Persist balances/stats and prepare for the next hand. */
  private async finishHand(
    context: PluginInvocationContext,
    session: GameSession,
  ): Promise<void> {
    const snap = session.game.snapshot();
    const user = snap.players.find((p) => p.seat === 0)!;
    const result = session.game.getLastResult();
    if (result) {
      session.stored.stats.hands += 1;
      const userWon = result.potSplits
        .filter((s) => s.seat === 0)
        .reduce((a, s) => a + s.amount, 0);
      if (userWon > 0) session.stored.stats.won += 1;
      session.stored.stats.net += user.stack - session.handStartBalance;
    }
    session.stored.balance = user.stack;
    session.stored.recovery = null;
    await saveState(context, session.stored);
  }

  /** Start a new hand (used by join/newHand). */
  private async startNewHand(
    context: PluginInvocationContext,
    session: GameSession,
  ): Promise<GameSnapshot> {
    session.handStartBalance = session.stored.balance;
    const dealer = (session.game.dealerSeat + 1) % 6;
    session.game = new Game({
      config: {
        seats: 6,
        smallBlind: SMALL_BLIND,
        bigBlind: BIG_BLIND,
        startingStack: STARTING_STACK,
      },
      dealerSeat: dealer,
      players: this.rosterPlayers(session.stored),
      seed: handSeed(session.nonce, session.handIndex++),
    });
    try {
      session.game.startHand();
    } catch {
      // Not enough live players (hero busted and nobody else can act):
      // surface it as a snapshot in "waiting" state so the UI can offer a
      // rebuy instead of a dead table.
      this.publishChanged(context, session, this.publicSnapshot(session));
      return this.publicSnapshot(session);
    }
    this.publishChanged(context, session, this.publicSnapshot(session));
    await this.runAiLoop(context, session);
    return this.publicSnapshot(session);
  }

  /** Join the table (creates/restores a session). */
  async join(
    context: PluginInvocationContext,
    name?: string,
  ): Promise<GameSnapshot> {
    const session = await this.session(context);
    return this.withLock(session, async () => {
      if (name && name.trim()) {
        session.stored.user.name = name.trim().slice(0, 20);
        await saveState(context, session.stored);
      }
      if (session.game.snapshot().status === "waiting") {
        return this.startNewHand(context, session);
      }
      const snap = this.publicSnapshot(session);
      this.publishChanged(context, session, snap);
      return snap;
    });
  }

  /** User action. */
  async action(
    context: PluginInvocationContext,
    input: PlayerAction,
  ): Promise<GameSnapshot> {
    const session = await this.session(context);
    return this.withLock(session, async () => {
      const snap = session.game.snapshot();
      if (snap.status === "waiting" || snap.status === "handEnded") {
        throw new Error("牌局未开始");
      }
      if (snap.currentTurn !== 0) throw new Error("还没轮到你");
      session.game.applyAction(0, input);
      this.publishChanged(context, session, this.publicSnapshot(session));
      await this.runAiLoop(context, session);
      return this.publicSnapshot(session);
    });
  }

  /** Request a new hand. */
  async newHand(context: PluginInvocationContext): Promise<GameSnapshot> {
    const session = await this.session(context);
    return this.withLock(session, async () => {
      const snap = session.game.snapshot();
      if (snap.status !== "waiting" && snap.status !== "handEnded") {
        return this.publicSnapshot(session);
      }
      return this.startNewHand(context, session);
    });
  }

  /** Leave the table (persist current state). */
  async leave(context: PluginInvocationContext): Promise<void> {
    const session = await this.session(context);
    return this.withLock(session, async () => {
      const snap = session.game.snapshot();
      if (snap.status !== "waiting" && snap.status !== "handEnded") {
        session.stored.recovery = this.publicSnapshot(session);
      }
      await saveState(context, session.stored);
      // Keep the in-memory session alive: every page/tab in this scope shares
      // it, so one tab closing or reloading must not reset the table for the
      // others. The AI loop only runs inside in-flight commands, so there is
      // no background work to cancel here.
    });
  }

  /**
   * Current snapshot (query). Never starts hands and never writes state —
   * queries are side-effect free; new hands are started by join/newHand.
   */
  async get(context: PluginInvocationContext): Promise<GameSnapshot> {
    const session = await this.session(context);
    return this.publicSnapshot(session);
  }

  /** Stats for the UI. */
  async stats(context: PluginInvocationContext): Promise<StoredState["stats"]> {
    const session = await this.session(context);
    return session.stored.stats;
  }

  /** Reset balance to starting stack. */
  async rebuy(context: PluginInvocationContext): Promise<void> {
    const session = await this.session(context);
    return this.withLock(session, async () => {
      session.stored.balance = STARTING_STACK;
      session.stored.stats = { hands: 0, won: 0, net: 0 };
      session.stored.recovery = null;
      await saveState(context, session.stored);
    });
  }
}

export const gameManager = new GameManager();
