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
        game: new Game({
          config: {
            seats: 6,
            smallBlind: SMALL_BLIND,
            bigBlind: BIG_BLIND,
            startingStack: STARTING_STACK,
          },
          dealerSeat: 4,
          players: this.rosterPlayers(stored),
          seed: handSeed(Math.floor(Date.now() / 1000), 1),
        }),
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

  private rosterPlayers(
    stored: StoredState,
  ): {
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
      if (turn === null) return;
      const player = snap.players.find((p) => p.seat === turn)!;
      if (!player.isBot) return;
      const action = await this.decideFor(context, session, snap, turn, player);
      try {
        session.game.applyAction(turn, action);
      } catch {
        // Defensive: fallback to fold if the LLM action is invalid.
        session.game.applyAction(turn, { action: "fold" });
      }
      this.publishChanged(context, session, this.publicSnapshot(session));
    }
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
    session.game.startHand();
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
      this.sessions.delete(context.scopeId);
    });
  }

  /** Current snapshot (query). Lock-free so UI refreshes during the AI chain. */
  async get(context: PluginInvocationContext): Promise<GameSnapshot> {
    const session = await this.session(context);
    const snap = session.game.snapshot();
    if (snap.status === "waiting") {
      return this.withLock(session, () => this.startNewHand(context, session));
    }
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
      await saveState(context, session.stored);
    });
  }
}

export const gameManager = new GameManager();
