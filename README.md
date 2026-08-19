<div align="center">

# 🃏 Token Poker

**Six-max no-limit Texas hold'em for [Synergy](https://github.com/SII-Holos/synergy)** —
play against five AI opponents, each with a personality of its own.

A Synergy Plugin API 4 plugin · Pure-TypeScript poker engine · MIT licensed

<img width="1200" alt="Token Poker table" src="https://github.com/user-attachments/assets/0ae0f3d4-c9c7-4df3-8ea0-2dcbe989e408" />

</div>

## About

Token Poker is a complete poker table that runs inside [Synergy](https://github.com/SII-Holos/synergy), the AI agent workspace. You take a seat at a six-handed table and play no-limit Texas hold'em against five AI opponents — Ada, Grace, Alan, Katherine, and Edsger — each with a distinct persona and playing style.

Opponent decisions are made through Synergy's agent runtime (`agent.call`), and every call falls back to a deterministic heuristic so the game never stalls, even when the model is slow or unavailable.

> The chips are virtual and exist only inside the game. This is purely for entertainment.

## Features

- **Full poker rules** — blinds, betting rounds, minimum-raise enforcement, all-in, side pots, and showdown with hand ranking
- **Five AI opponents** — LLM-driven decisions with personality styles, plus a heuristic fallback path
- **Live table** — per-seat action bubbles, a turn indicator, thinking states, and street-by-street community card reveals
- **Polished settlement** — ranked showdown showing every player's best five-card combination, winners highlighted with payouts
- **Persistence** — virtual chips and session stats survive restarts through plugin settings
- **Sidebar entry** — launch the full-screen table straight from the Synergy navigation

## Why it's built this way

The poker engine is a pure TypeScript module with zero runtime dependencies — betting state machine, hand evaluation, and side-pot splitting are all fully unit-tested in isolation. The AI layer wraps it through the plugin API, and the trusted Solid.js UI renders snapshots published by the runtime. Each layer can be reasoned about, tested, and swapped independently.

## Install

Requires Synergy `>=3.0.11`.

```bash
synergy plugin add file:///path/to/token-poker
synergy plugin approve token-poker
```

The plugin requests the following capabilities:

| Capability                         | Why                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `agent.call`                       | Opponent decisions via the `token-poker.pro` agent (nano/mini model roles) |
| `settings.read` / `settings.write` | Persist chips and stats across sessions                                    |
| `ui.hostActions`                   | Sidebar entry for the poker table                                          |

## Development

```bash
bun install
bun test                             # engine + AI unit tests
bunx tsc --noEmit                    # type check
bunx synergy-plugin build            # build the plugin
bunx synergy-plugin validate --runtime-discovery
bunx synergy-plugin pack             # package the tarball
```

## Architecture

```
src/
├─ engine/   Pure-TypeScript poker engine (no LLM, fully testable)
│  ├─ cards.ts       deck & shuffling
│  ├─ evaluate.ts    hand evaluation
│  ├─ game.ts        betting-round state machine
│  └─ pots.ts        side-pot splitting
├─ ai/       Opponent decision layer
│  ├─ roster.ts      five personas & styles
│  ├─ prompt.ts      LLM decision prompt
│  ├─ parse.ts       fault-tolerant JSON parsing
│  ├─ fallback.ts    heuristic strategy
│  └─ seeds.ts       deterministic randomness
├─ runtime/  Plugin runtime
│  ├─ manager.ts     command locking, AI loop, event publishing
│  ├─ persistence.ts settings-backed save state
│  └─ schemas.ts     Zod contracts
└─ ui/       Trusted Solid.js table UI
```

## License

[MIT](LICENSE)
