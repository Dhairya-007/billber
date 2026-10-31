import type { Expense, Group, Settlement } from "./db";
import { netBalances, simplify, type ID, type Paise, type Transfer } from "./money";

export type GroupSummary = {
  total: Paise;
  nets: Map<ID, Paise>;
  transfers: Transfer[];
  paid: Map<ID, Paise>;
  share: Map<ID, Paise>;
};

export function summarize(group: Group, expenses: Expense[], settlements: Settlement[]): GroupSummary {
  const live = expenses.filter(({ deletedAt }) => !deletedAt);
  const nets = netBalances(live, settlements, group.memberIds);
  const paid = new Map<ID, Paise>();
  const share = new Map<ID, Paise>();
  for (const expense of live) {
    for (const { personId, paid: value } of expense.payers) paid.set(personId, (paid.get(personId) ?? 0) + value);
    for (const { personId, owed } of expense.splits) share.set(personId, (share.get(personId) ?? 0) + owed);
  }
  return { total: live.reduce((acc, { amount }) => acc + amount, 0), nets, transfers: simplify(nets), paid, share };
}

export type BalanceLine = { id: ID; date: string; label: string; effect: Paise; at: number };

// Every record that moved a person's balance. The effects always add up to their net balance.
export function balanceLines(personId: ID, expenses: Expense[], settlements: Settlement[], nameOf: (id: ID) => string): BalanceLine[] {
  const lines: BalanceLine[] = [];
  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    const paid = expense.payers.find((payer) => payer.personId === personId)?.paid ?? 0;
    const owed = expense.splits.find((split) => split.personId === personId)?.owed ?? 0;
    if (paid || owed) lines.push({ id: expense.id, date: expense.date, label: expense.description, effect: paid - owed, at: expense.createdAt });
  }
  for (const { id, date, fromId, toId, amount, deletedAt, createdAt } of settlements) {
    if (deletedAt) continue;
    if (fromId === personId) lines.push({ id, date, label: `Paid back ${nameOf(toId)}`, effect: amount, at: createdAt });
    if (toId === personId) lines.push({ id, date, label: `Paid back by ${nameOf(fromId)}`, effect: -amount, at: createdAt });
  }
  return lines.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
}

export type Activity = { key: string; at: number; text: string };

export function activity(expenses: Expense[], settlements: Settlement[], transferText: (settlement: Settlement) => string): Activity[] {
  const rows: Activity[] = [];
  for (const { id, history = [] } of expenses) {
    history.forEach(({ at, action, summary }, index) => rows.push({ key: `${id}-${index}`, at, text: `${action[0].toUpperCase()}${action.slice(1)} ${summary}` }));
  }
  for (const settlement of settlements) {
    rows.push({ key: settlement.id, at: settlement.createdAt, text: `Settled: ${transferText(settlement)}` });
    if (settlement.deletedAt) rows.push({ key: `${settlement.id}-deleted`, at: settlement.deletedAt, text: `Removed settlement: ${transferText(settlement)}` });
  }
  return rows.sort((a, b) => b.at - a.at);
}

export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
