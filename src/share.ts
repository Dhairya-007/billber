import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Expense, Group, Person, Settlement } from "./db";
import { formatMoney, netBalances, simplify, type ID } from "./money";
import { backupSchema, sharedGroupSchema, type Backup, type SharedGroup } from "./schema";

export const MAX_LINK_LENGTH = 30000; // Longer links get cut off by chat apps and some browsers

export function nameOf(people: Person[], id: ID): string {
  return people.find((person) => person.id === id)?.name ?? "Someone";
}

export function displayName(people: Person[], id: ID): string {
  const person = people.find((entry) => entry.id === id);
  return person?.isMe ? "You" : person?.name ?? "Someone";
}

// "Priya pays you ₹1,300" with the right verb for you, or a plain third-person line otherwise.
export function transferLine(people: Person[], from: ID, to: ID, amount: number, currency: string): string {
  const money = formatMoney(amount, currency);
  const payer = people.find((person) => person.id === from);
  const receiver = people.find((person) => person.id === to);
  if (payer?.isMe) return `You pay ${receiver?.name ?? "someone"} ${money}`;
  if (receiver?.isMe) return `${payer?.name ?? "Someone"} pays you ${money}`;
  return `${payer?.name ?? "Someone"} pays ${receiver?.name ?? "someone"} ${money}`;
}

export function textSummary(group: Group, people: Person[], expenses: Expense[], settlements: Settlement[]): string {
  const live = expenses.filter(({ deletedAt }) => !deletedAt);
  const total = live.reduce((acc, { amount }) => acc + amount, 0);
  const transfers = simplify(netBalances(live, settlements, group.memberIds));
  const lines = transfers.map(({ from, to, amount }) => transferLine(people, from, to, amount, group.currency));
  return [
    `${group.emoji ? `${group.emoji} ` : ""}${group.name}`,
    `Total ${formatMoney(total, group.currency)}`,
    ...(lines.length ? lines : ["All settled up"]),
  ].join("\n");
}

export function packGroup(group: Group, people: Person[], expenses: Expense[], settlements: Settlement[]): string {
  const members = new Set(group.memberIds);
  const live = expenses.filter(({ deletedAt }) => !deletedAt).map(({ history: _history, ...expense }) => expense);
  for (const expense of live) {
    for (const { personId } of [...expense.payers, ...expense.splits]) members.add(personId);
  }
  const data: SharedGroup = {
    v: 1,
    sharedAt: Date.now(),
    group,
    // isMe is left out, because "you" means something different to whoever opens the link.
    people: people.filter(({ id }) => members.has(id)).map(({ isMe: _isMe, ...person }) => person),
    expenses: live,
    settlements: settlements.filter(({ deletedAt }) => !deletedAt),
  };
  return compressToEncodedURIComponent(JSON.stringify(data));
}

export function unpackGroup(packed: string): SharedGroup | null {
  try {
    const json = decompressFromEncodedURIComponent(packed);
    return json ? sharedGroupSchema.parse(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

export function shareLink(packed: string): string {
  return `${location.origin}/s#${packed}`;
}

// One group as a normal backup file, for groups too big to fit in a link.
export function groupBackup(group: Group, people: Person[], expenses: Expense[], settlements: Settlement[]): Backup {
  return {
    app: "billber",
    version: 1,
    exportedAt: Date.now(),
    people: people.map(({ isMe: _isMe, ...person }) => person),
    groups: [group],
    expenses,
    settlements,
  };
}

export function parseBackup(text: string): Backup {
  return backupSchema.parse(JSON.parse(text));
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Opens the phone's share sheet where there is one, and falls back to copying.
export async function shareText(text: string, url?: string): Promise<"shared" | "copied" | "cancelled"> {
  const full = url ? `${text}\n${url}` : text;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(url ? { text, url } : { text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(full);
  return "copied";
}
