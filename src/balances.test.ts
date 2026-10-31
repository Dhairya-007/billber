import { describe, expect, it } from "vitest";
import { balanceLines, summarize } from "./balances";
import type { Expense, Group, Settlement } from "./db";

const group: Group = { id: "g", name: "Goa", currency: "INR", memberIds: ["a", "b", "c"], createdAt: 1 };
const expense = (id: string, amount: number, payer: string, owed: Record<string, number>, deletedAt?: number): Expense => ({
  id, groupId: "g", description: id, category: "other", amount, date: "2026-10-31",
  payers: [{ personId: payer, paid: amount }], splitType: "equal", splitInput: [],
  splits: Object.entries(owed).map(([personId, value]) => ({ personId, owed: value })), createdAt: 1, updatedAt: 1, deletedAt,
});

describe("group summary", () => {
  const expenses = [expense("Hotel", 300000, "a", { a: 100000, b: 100000, c: 100000 }), expense("Cab", 60000, "b", { b: 30000, c: 30000 }), expense("Gone", 5000, "c", { a: 5000 }, 9)];
  const settlements: Settlement[] = [{ id: "s", groupId: "g", fromId: "c", toId: "a", amount: 30000, date: "2026-10-31", createdAt: 2 }];

  it("ignores deleted expenses in totals and spend", () => {
    const { total, paid, share } = summarize(group, expenses, settlements);
    expect(total).toBe(360000);
    expect(paid.get("a")).toBe(300000);
    expect(paid.get("c")).toBeUndefined();
    expect(share.get("c")).toBe(130000);
  });

  it("explains every balance: the breakdown adds up to the net", () => {
    const { nets } = summarize(group, expenses, settlements);
    for (const id of group.memberIds) {
      const lines = balanceLines(id, expenses, settlements, (person) => person);
      expect(lines.reduce((acc, { effect }) => acc + effect, 0)).toBe(nets.get(id));
    }
  });
});
