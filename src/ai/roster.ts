/** AI opponent roster: roles and style parameters. */

export type Aggression =
  | "tight"
  | "passive"
  | "balanced"
  | "aggressive"
  | "maniac";

export interface BotStyle {
  name: string;
  /** Prompt guidance shown to the model. */
  persona: string;
  aggression: Aggression;
  /** Fallback: probability to raise when holding a strong hand. */
  raiseBias: number;
  /** Fallback: probability to call with a marginal hand. */
  callBias: number;
  /** Fallback: probability to bluff-raise with a weak hand. */
  bluffBias: number;
}

export const ROSTER: BotStyle[] = [
  {
    name: "Ada",
    persona:
      "你是一位精确的数学型牌手。你计算底池赔率和期望值，只在赔率有利时投入筹码，极少诈唬。你的行动理性、可预测。",
    aggression: "balanced",
    raiseBias: 0.55,
    callBias: 0.6,
    bluffBias: 0.08,
  },
  {
    name: "Grace",
    persona:
      "你是一位纪律严明的教科书牌手。你严格遵守起手牌标准和位置原则，打得紧而稳。你几乎不诈唬，也很少被诱入边缘局面。",
    aggression: "tight",
    raiseBias: 0.35,
    callBias: 0.45,
    bluffBias: 0.03,
  },
  {
    name: "Alan",
    persona:
      "你是一位抽象思维型牌手。你有时会做出非常规的诈唬和混合打法，让人难以捉摸。你会在恰当的时机下注压力，但也偶尔过度思考。",
    aggression: "aggressive",
    raiseBias: 0.6,
    callBias: 0.55,
    bluffBias: 0.18,
  },
  {
    name: "Katherine",
    persona:
      "你是一位侵略性极强的牌手。你频繁加注施压，用大注逼迫对手做艰难决定。你不怕波动，愿意用边缘牌争夺底池。",
    aggression: "maniac",
    raiseBias: 0.7,
    callBias: 0.5,
    bluffBias: 0.25,
  },
  {
    name: "Edsger",
    persona:
      "你是一位极其保守的牌手。你只玩强牌，遇到压力立即弃牌，从不追逐听牌。你的风格简单但难以被击败——因为你不给对手机会。",
    aggression: "passive",
    raiseBias: 0.3,
    callBias: 0.4,
    bluffBias: 0.02,
  },
];

export function styleForSeat(seat: number): BotStyle {
  return ROSTER[(seat - 1) % ROSTER.length];
}
