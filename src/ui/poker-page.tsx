/** Poker page: joins the table, subscribes to events, renders table + action bar. */
import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  type Component,
} from "solid-js";
import type { PluginSurfaceContext } from "@ericsanchezok/synergy-plugin/ui";
import type { GameSnapshot } from "../engine/game";
import { TableTop } from "./table-top";
import { ActionBar } from "./action-bar";
import { formatChips } from "./format";
import "./poker.css";

/**
 * The host passes the PluginSurfaceContext directly as this component's props
 * (createComponent(loaded.default, context)), not as { context: ... }.
 */
const PokerPage: Component<PluginSurfaceContext> = (props) => {
  const [snapshot, setSnapshot] = createSignal<GameSnapshot | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshInFlight = false;

  /**
   * Fetch and apply the current snapshot. Revisions come from the server so
   * identical snapshots are dropped (stops the 1.5s flicker: every poll used
   * to replace the snapshot object and re-run entry animations). Also
   * suppresses the cascade of refresh() calls when an event fires while a
   * fetch is already in flight — the in-flight fetch runs after the state
   * change and is already the freshest.
   */
  const refresh = async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const snap = (await props.operations.query(
        "game.get",
        {},
      )) as GameSnapshot;
      setSnapshot((prev) => (prev?.revision === snap.revision ? prev : snap));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      refreshInFlight = false;
      // Slow safety net (5s): events cover normal flow, this covers the rare
      // missed/dropped event. The fast flicker came from polling at 1.5s.
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 5000);
    }
  };

  onMount(async () => {
    // Subscribe BEFORE joining so we never miss state-change events fired
    // while the (long-running, AI-loop-driving) join command is in flight.
    const unsubscribe = props.events.subscribe("game.state.changed", () => {
      void refresh();
    });
    onCleanup(() => {
      unsubscribe();
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      // Leaving avoids keeping the server's AI loop (and LLM calls) running
      // after the tab is closed.
      void props.operations.command("game.leave", {}).catch(() => {});
    });
    try {
      // Do not await: game.join drives the AI loop for the whole preflop
      // betting round; the polling refresh loop shows actions as they happen.
      void props.operations
        .command("game.join", {})
        .then((raw) => {
          const snap = raw as GameSnapshot;
          setSnapshot((prev) =>
            prev?.revision === snap.revision ? prev : snap,
          );
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  const act = (action: "fold" | "call" | "bet" | "check", amount?: number) => {
    setBusy(true);
    // Fire-and-forget: do NOT await the command. The server drives the whole
    // AI loop inside the command response (tens of seconds), so awaiting it
    // would freeze the UI until the entire betting round is over. The polling
    // refresh loop keeps the table live while opponents act.
    void props.operations
      .command("game.action", { action, amount })
      .then((raw) => {
        const snap = raw as GameSnapshot;
        setSnapshot((prev) => (prev?.revision === snap.revision ? prev : snap));
        setBusy(false);
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        await refresh();
      });
    // Kick the poll loop immediately so opponent actions stream in.
    void refresh();
  };

  const newHand = () => {
    setBusy(true);
    void props.operations
      .command("game.newHand", {})
      .then((raw) => {
        const snap = raw as GameSnapshot;
        setSnapshot((prev) => (prev?.revision === snap.revision ? prev : snap));
        setBusy(false);
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        await refresh();
      });
    void refresh();
  };

  const rebuy = () => {
    setBusy(true);
    void props.operations
      .command("game.rebuy", {})
      .then(() => {
        setBusy(false);
        return newHand();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      });
  };

  const heroBusted = () => {
    const snap = snapshot();
    if (!snap) return false;
    const hero = snap.players.find((p) => p.seat === 0);
    return !!hero && hero.stack <= 0;
  };

  return (
    <section class="tp-page" aria-label="德州扑克牌桌">
      <header class="tp-header">
        <div class="tp-header__title">
          <span class="tp-header__name">No-Limit Inference</span>
          <span class="tp-header__blinds">500/1K · 6-max</span>
        </div>
        <Show when={snapshot()}>
          <div class="tp-header__stats">
            <span>
              {snapshot()!.players[0]?.name ?? "你"} ·{" "}
              {formatChips(snapshot()!.players[0]?.stack ?? 0)}
            </span>
          </div>
        </Show>
      </header>

      <Show when={error()}>
        <div class="tp-error" role="alert">
          {error()}
        </div>
      </Show>

      <Show
        when={snapshot()}
        fallback={<div class="tp-loading">加入牌桌…</div>}
      >
        <div class="tp-body">
          <TableTop snapshot={snapshot()!} />
          <ActionBar
            snapshot={snapshot()!}
            busy={busy()}
            onAction={(action, amount) => void act(action, amount)}
          />
          <Show
            when={
              snapshot()!.status === "handEnded" ||
              snapshot()!.status === "waiting"
            }
          >
            <div class="tp-next">
              <button
                type="button"
                class="tp-btn tp-btn--primary"
                onClick={() => void newHand()}
                disabled={heroBusted() && snapshot()!.status === "waiting"}
              >
                下一手
              </button>
              <Show when={heroBusted()}>
                <button
                  type="button"
                  class="tp-btn tp-btn--ghost"
                  onClick={() => void rebuy()}
                >
                  重新买入
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
};

export default PokerPage;
