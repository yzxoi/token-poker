/** Zod schemas for the token-poker operation contracts. */
import { z } from "zod";

export const cardSchema = z.object({
  rank: z.number().int().min(2).max(14),
  suit: z.enum(["s", "h", "d", "c"]),
});

export const playerStateSchema = z.object({
  seat: z.number().int(),
  name: z.string(),
  stack: z.number(),
  holeCards: z.array(cardSchema).nullable(),
  folded: z.boolean(),
  allIn: z.boolean(),
  contributed: z.number(),
  isBot: z.boolean(),
  style: z.string().optional(),
});

export const potSplitSchema = z.object({
  seat: z.number().int(),
  amount: z.number(),
});

export const handResultSchema = z.object({
  winnerSeats: z.array(z.number().int()),
  winningAmounts: z.array(z.number()),
  potSplits: z.array(potSplitSchema),
  showdown: z
    .array(
      z.object({
        seat: z.number().int(),
        cards: z.array(cardSchema),
        handName: z.string(),
        bestHand: z.array(cardSchema),
      }),
    )
    .optional(),
});

export const gameSnapshotSchema = z.object({
  handId: z.string(),
  status: z.enum([
    "waiting",
    "preflop",
    "flop",
    "turn",
    "river",
    "showdown",
    "handEnded",
  ]),
  dealerSeat: z.number().int(),
  communityCards: z.array(cardSchema),
  pot: z.number(),
  toCall: z.number(),
  minRaise: z.number(),
  currentTurn: z.number().int().nullable(),
  lastAction: z
    .object({
      seat: z.number().int(),
      text: z.string(),
      amount: z.number().optional(),
    })
    .nullable(),
  players: z.array(playerStateSchema),
  lastResult: handResultSchema.nullable(),
});

export const playerActionSchema = z.object({
  action: z.enum(["fold", "check", "call", "bet", "allIn"]),
  amount: z.number().positive().optional(),
});

export const joinInputSchema = z.object({
  name: z.string().max(20).optional(),
});

export const statsSchema = z.object({
  hands: z.number().int(),
  won: z.number().int(),
  net: z.number(),
});
