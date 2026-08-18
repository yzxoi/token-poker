/** Poker page: joins the table, subscribes to events, renders table + action bar. */
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import type { Component } from "solid-js";
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

  const refresh = async () => {
    try {
      const snap = (await props.operations.query(
        "game.get",
        {},
      )) as GameSnapshot;
      setSnapshot(snap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  onMount(async () => {
    try {
      const snap = (await props.operations.command(
        "game.join",
        {},
      )) as GameSnapshot;
      setSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    const unsubscribe = props.events.subscribe("game.state.changed", () => {
      void refresh();
    });
    onCleanup(unsubscribe);
  });

  const act = async (
    action: "fold" | "call" | "bet" | "check",
    amount?: number,
  ) => {
    setBusy(true);
    try {
      const snap = (await props.operations.command("game.action", {
        action,
        amount,
      })) as GameSnapshot;
      setSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const newHand = async () => {
    setBusy(true);
    try {
      const snap = (await props.operations.command(
        "game.newHand",
        {},
      )) as GameSnapshot;
      setSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
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
              >
                下一手
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
};

export default PokerPage;
