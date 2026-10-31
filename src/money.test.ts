import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertPayers, computeSplits, evaluateAmount, formatMoney, MoneyError, netBalances, simplify, toInputValue, type Payer, type Split, type SplitInput, type SplitType } from "./money";

const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
const total = fc.integer({ min: 1, max: 100_000_000 });
const group = fc.uniqueArray(fc.constantFrom(...ids), { minLength: 1, maxLength: 8 });
const sum = (rows: Split[]) => rows.reduce((acc, { owed }) => acc + owed, 0);

const anySplit: fc.Arbitrary<{ type: SplitType; input: SplitInput[] }> = group.chain((people) => fc.oneof(
  fc.constant({ type: "equal" as SplitType, input: people.map((personId) => ({ personId, value: 1 })) }),
  fc.array(fc.integer({ min: 1, max: 50 }), { minLength: people.length, maxLength: people.length }).map((values) => ({
    type: "shares" as SplitType, input: people.map((personId, index) => ({ personId, value: values[index] })),
  })),
  fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: people.length, maxLength: people.length }).map((values) => {
    const whole = values.reduce((acc, value) => acc + value, 0);
    const parts = values.map((value) => Math.floor((value * 10000) / whole));
    parts[0] += 10000 - parts.reduce((acc, value) => acc + value, 0);
    return { type: "percent" as SplitType, input: people.map((personId, index) => ({ personId, value: parts[index] / 100 })) };
  }),
));

const anyExpense = fc.tuple(total, anySplit, fc.subarray(ids, { minLength: 1, maxLength: 3 })).map(([amount, { type, input }, payerIds]) => {
  const each = Math.floor(amount / payerIds.length);
  const payers: Payer[] = payerIds.map((personId, index) => ({ personId, paid: index === 0 ? amount - each * (payerIds.length - 1) : each }));
  return { payers, splits: computeSplits(amount, type, input) };
});

describe("splits", () => {
  it("always add up to the exact amount", () => {
    fc.assert(fc.property(total, anySplit, (amount, { type, input }) => {
      const splits = computeSplits(amount, type, input);
      expect(sum(splits)).toBe(amount);
      expect(splits.every(({ owed }) => Number.isSafeInteger(owed) && owed >= 0)).toBe(true);
    }), { numRuns: 3000 });
  });

  it("does not depend on the order people are listed in", () => {
    fc.assert(fc.property(total, anySplit, (amount, { type, input }) => {
      const owed = (rows: Split[]) => Object.fromEntries(rows.map(({ personId, owed: value }) => [personId, value]));
      expect(owed(computeSplits(amount, type, [...input].reverse()))).toEqual(owed(computeSplits(amount, type, input)));
    }));
  });

  it("keeps equal shares within one paisa", () => {
    fc.assert(fc.property(total, group, (amount, people) => {
      const values = computeSplits(amount, "equal", people.map((personId) => ({ personId, value: 1 }))).map(({ owed }) => owed);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }));
  });

  it("splits ₹1,000 three ways as the plan describes", () => {
    const values = computeSplits(100000, "equal", ["a", "b", "c"].map((personId) => ({ personId, value: 1 }))).map(({ owed }) => owed);
    expect([...values].sort()).toEqual([33333, 33333, 33334]);
  });

  it("handles shares and percentages exactly", () => {
    expect(computeSplits(240000, "shares", [{ personId: "a", value: 1 }, { personId: "b", value: 2 }, { personId: "c", value: 1 }]).map(({ owed }) => owed)).toEqual([60000, 120000, 60000]);
    expect(computeSplits(100, "percent", [{ personId: "a", value: 33.33 }, { personId: "b", value: 33.33 }, { personId: "c", value: 33.34 }]).map(({ owed }) => owed)).toEqual([33, 33, 34]);
  });

  it("refuses splits that do not add up", () => {
    expect(() => computeSplits(1000, "exact", [{ personId: "a", value: 400 }, { personId: "b", value: 500 }])).toThrow(MoneyError);
    expect(() => computeSplits(1000, "percent", [{ personId: "a", value: 50 }, { personId: "b", value: 40 }])).toThrow(MoneyError);
    expect(() => computeSplits(1000, "shares", [{ personId: "a", value: 0 }])).toThrow(MoneyError);
    expect(() => computeSplits(0, "equal", [{ personId: "a", value: 1 }])).toThrow(MoneyError);
    expect(() => computeSplits(1000, "equal", [])).toThrow(MoneyError);
    expect(() => assertPayers(1000, [{ personId: "a", paid: 600 }, { personId: "b", paid: 300 }])).toThrow(MoneyError);
  });
});

describe("balances", () => {
  const worked = [
    { payers: [{ personId: "A", paid: 300000 }], splits: ["A", "B", "C"].map((personId) => ({ personId, owed: 100000 })) },
    { payers: [{ personId: "B", paid: 60000 }], splits: ["B", "C"].map((personId) => ({ personId, owed: 30000 })) },
  ];

  it("reproduces the plan's worked example", () => {
    const nets = netBalances(worked, []);
    expect(Object.fromEntries(nets)).toEqual({ A: 200000, B: -70000, C: -130000 });
    expect(simplify(nets)).toEqual([{ from: "C", to: "A", amount: 130000 }, { from: "B", to: "A", amount: 70000 }]);
  });

  it("always sums to zero, and simplified payments clear everyone in at most n - 1 steps", () => {
    fc.assert(fc.property(fc.array(anyExpense, { maxLength: 25 }), (expenses) => {
      const nets = netBalances(expenses, []);
      expect([...nets.values()].reduce((acc, value) => acc + value, 0)).toBe(0);
      const payments = simplify(nets);
      const active = [...nets.values()].filter(Boolean).length;
      expect(payments.length).toBeLessThanOrEqual(Math.max(active - 1, 0));
      const settled = payments.map(({ from, to, amount }) => ({ fromId: from, toId: to, amount }));
      expect([...netBalances(expenses, settled).values()].every((value) => value === 0)).toBe(true);
    }), { numRuns: 1500 });
  });

  it("handles partial settlements and ignores deleted records", () => {
    expect(netBalances(worked, [{ fromId: "C", toId: "A", amount: 50000 }]).get("C")).toBe(-80000);
    expect(netBalances(worked, [{ fromId: "C", toId: "A", amount: 50000, deletedAt: 1 }]).get("C")).toBe(-130000);
    expect(netBalances([{ ...worked[0], deletedAt: 1 }], []).size).toBe(0);
  });
});

describe("keypad maths", () => {
  it.each([["450", 45000], ["450+120", 57000], ["1,200", 120000], ["99.99", 9999], ["1200/3", 40000], ["100÷3", 3333], ["2×150+50", 35000], ["0.1+0.2", 30], ["₹500", 50000], ["1000−1", 99900], ["5.", 500], [".5", 50]])("%s", (input, expected) => {
    expect(evaluateAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "1+", "5/0", "0", "1-5", "1..2", "2**3", "+"])("rejects %s", (input) => {
    expect(evaluateAmount(input)).toBeNull();
  });
});

describe("display", () => {
  it("uses Indian grouping for rupees and never shows a minus sign", () => {
    expect(formatMoney(10000000)).toBe("₹1,00,000");
    expect(formatMoney(45050)).toBe("₹450.50");
    expect(formatMoney(-45000)).toBe("₹450");
  });

  it("respects currencies without decimals", () => {
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
    expect(evaluateAmount("1500", "JPY")).toBe(1500);
    expect(toInputValue(45050)).toBe("450.50");
  });
});
