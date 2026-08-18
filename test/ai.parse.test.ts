import { describe, expect, test } from "bun:test";
import {
  extractJsonObject,
  parseDecision,
  parseDecisionText,
} from "../src/ai/parse";

describe("parse", () => {
  test("plain JSON object", () => {
    const parsed = parseDecisionText('{"action": "fold"}');
    expect(parsed).toEqual({ action: { action: "fold" } });
  });

  test("JSON inside code fence", () => {
    const parsed = parseDecisionText('```json\n{"action": "call"}\n```');
    expect(parsed).toEqual({ action: { action: "call" } });
  });

  test("prose around JSON", () => {
    const parsed = parseDecisionText(
      '我认为应该加注。\n{"action": "bet", "amount": 2500}\n以上。',
    );
    expect(parsed).toEqual({ action: { action: "bet", amount: 2500 } });
  });

  test("bet with string amount", () => {
    const parsed = parseDecisionText('{"action": "bet", "amount": "3000"}');
    expect(parsed).toEqual({ action: { action: "bet", amount: 3000 } });
  });

  test("raise normalized to bet", () => {
    const parsed = parseDecisionText('{"action": "raise", "amount": 4000}');
    expect(parsed).toEqual({ action: { action: "bet", amount: 4000 } });
  });

  test("invalid action rejected", () => {
    expect(parseDecisionText('{"action": "banana"}')).toBeNull();
  });

  test("invalid amount rejected", () => {
    expect(parseDecisionText('{"action": "bet", "amount": -5}')).toBeNull();
    expect(parseDecisionText('{"action": "bet"}')).toBeNull();
  });

  test("no JSON rejected", () => {
    expect(parseDecisionText("我弃牌吧")).toBeNull();
  });

  test("malformed JSON rejected", () => {
    expect(parseDecisionText('{"action": "fold"')).toBeNull();
  });

  test("extractJsonObject balanced scan", () => {
    expect(extractJsonObject('x {"a": {"b": 1}} y')).toEqual({ a: { b: 1 } });
  });
});
