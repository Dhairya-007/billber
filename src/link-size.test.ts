import { expect, it } from "vitest";
import type { Expense, Group, Person } from "./db";
import { computeSplits } from "./money";
import { MAX_LINK_LENGTH, packGroup } from "./share";

it("fits a realistic trip in a share link", () => {
  const people: Person[] = Array.from({ length: 6 }, (_, index) => ({ id: crypto.randomUUID(), name: `Person ${index}`, createdAt: 1 }));
  const group: Group = { id: crypto.randomUUID(), name: "Goa", currency: "INR", memberIds: people.map(({ id }) => id), createdAt: 1 };
  const expenses: Expense[] = Array.from({ length: 100 }, (_, index) => {
    const amount = 10000 + index * 137;
    const splitInput = people.map(({ id }) => ({ personId: id, value: 1 }));
    return {
      id: crypto.randomUUID(), groupId: group.id, description: `Expense ${index}`, category: "food", amount, date: "2026-10-31",
      payers: [{ personId: people[index % 6].id, paid: amount }], splitType: "equal", splitInput,
      splits: computeSplits(amount, "equal", splitInput), createdAt: 1 + index, updatedAt: 1 + index,
    };
  });
  expect(packGroup(group, people, expenses, []).length).toBeLessThan(MAX_LINK_LENGTH);
});
