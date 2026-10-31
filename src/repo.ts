// The only module that touches storage. When a backend arrives, this file changes and the screens don't.
import { category, guessCategory } from "./categories";
import { db, type Change, type Expense, type Group, type Person, type Settlement } from "./db";
import { assertPayers, computeSplits, formatMoney, MoneyError, netBalances, type ID, type Paise, type Payer, type SplitInput, type SplitType } from "./money";
import type { Backup } from "./schema";

const CURRENCY_KEY = "billber.currency";
const LAST_KEY = "billber.last.";
const NUDGE_KEY = "billber.expensesSinceBackup";
export const NUDGE_EVERY = 20;

const newId = () => crypto.randomUUID();

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembered preferences are a convenience, so losing one is harmless.
  }
}

export function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const defaultCurrency = () => readLocal(CURRENCY_KEY, "INR");
export const setDefaultCurrency = (currency: string) => writeLocal(CURRENCY_KEY, currency);

// Asking on first save makes the browser far less likely to clear the data under storage pressure.
function requestPersistence() {
  void globalThis.navigator?.storage?.persist?.().catch(() => undefined);
}

export const listPeople = () => db.people.toArray();
export const listGroups = () => db.groups.toArray();
export const groupExpenses = (groupId: ID) => db.expenses.where({ groupId }).toArray();
export const groupSettlements = (groupId: ID) => db.settlements.where({ groupId }).toArray();

export async function getMe(): Promise<Person | undefined> {
  return (await db.people.toArray()).find((person) => person.isMe);
}

export async function setup(name: string, currency: string): Promise<Person> {
  requestPersistence();
  setDefaultCurrency(currency);
  const me: Person = { id: newId(), name: name.trim(), isMe: true, createdAt: Date.now() };
  await db.people.add(me);
  return me;
}

export async function addPerson(name: string, emoji?: string): Promise<Person> {
  const clean = name.trim();
  if (!clean) throw new Error("Enter a name");
  const existing = (await db.people.toArray()).find((person) => person.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const person: Person = { id: newId(), name: clean, emoji: emoji || undefined, createdAt: Date.now() };
  await db.people.add(person);
  return person;
}

export const updatePerson = (id: ID, changes: Partial<Pick<Person, "name" | "emoji">>) => db.people.update(id, changes);

export async function deletePerson(id: ID) {
  const inUse = (await db.groups.toArray()).some((group) => group.memberIds.includes(id));
  if (inUse) throw new Error("Remove this person from their groups first");
  await db.people.delete(id);
}

export async function createGroup(input: { name: string; emoji?: string; currency?: string; memberIds: ID[] }): Promise<Group> {
  const me = await getMe();
  if (!me) throw new Error("Finish setup first");
  const group: Group = {
    id: newId(),
    name: input.name.trim(),
    emoji: input.emoji,
    currency: input.currency ?? defaultCurrency(),
    memberIds: [...new Set([me.id, ...input.memberIds])],
    createdAt: Date.now(),
  };
  if (!group.name) throw new Error("Give the group a name");
  await db.groups.add(group);
  return group;
}

export const getGroup = (id: ID) => db.groups.get(id);
export const updateGroup = (id: ID, changes: Partial<Pick<Group, "name" | "emoji" | "archived">>) => db.groups.update(id, changes);

export async function addMember(groupId: ID, personId: ID) {
  const group = await db.groups.get(groupId);
  if (!group) throw new Error("Group not found");
  if (!group.memberIds.includes(personId)) await db.groups.update(groupId, { memberIds: [...group.memberIds, personId] });
}

export async function groupNets(groupId: ID): Promise<Map<ID, Paise>> {
  const group = await db.groups.get(groupId);
  const [expenses, settlements] = await Promise.all([
    db.expenses.where({ groupId }).toArray(),
    db.settlements.where({ groupId }).toArray(),
  ]);
  return netBalances(expenses, settlements, group?.memberIds ?? []);
}

export async function removeMember(groupId: ID, personId: ID) {
  const [group, nets] = await Promise.all([db.groups.get(groupId), groupNets(groupId)]);
  if (!group) throw new Error("Group not found");
  if ((nets.get(personId) ?? 0) !== 0) throw new Error("Settle this person's balance before removing them");
  await db.groups.update(groupId, { memberIds: group.memberIds.filter((id) => id !== personId) });
}

export type ExpenseDraft = {
  id?: ID; groupId: ID; amount: Paise; description?: string; category?: string; date?: string; note?: string;
  payers: Payer[]; splitType: SplitType; splitInput: SplitInput[];
};

export async function saveExpense(draft: ExpenseDraft): Promise<Expense> {
  const group = await db.groups.get(draft.groupId);
  if (!group) throw new Error("Group not found");
  if (group.archived) throw new Error("This group is archived");
  // Splits are always recomputed here, so the sheet can only ever preview money, never decide it.
  const splits = computeSplits(draft.amount, draft.splitType, draft.splitInput);
  assertPayers(draft.amount, draft.payers);
  const payers = draft.payers.filter(({ paid }) => paid > 0);
  // People who have left can stay on their old expenses, so editing history keeps working.
  const previous = draft.id ? await db.expenses.get(draft.id) : undefined;
  const known = new Set([...group.memberIds, ...(previous?.splits ?? []).map(({ personId }) => personId), ...(previous?.payers ?? []).map(({ personId }) => personId)]);
  if (![...payers.map(({ personId }) => personId), ...splits.map(({ personId }) => personId)].every((id) => known.has(id))) {
    throw new MoneyError("Everyone on an expense must be in the group");
  }

  const now = Date.now();
  const description = draft.description?.trim() || category(draft.category ?? "other").label;
  const summary = `${description}, ${formatMoney(draft.amount, group.currency)}`;
  const change: Change = { at: now, action: previous ? "edited" : "added", summary };
  const expense: Expense = {
    id: draft.id ?? newId(),
    groupId: draft.groupId,
    description,
    category: draft.category ?? guessCategory(description),
    amount: draft.amount,
    date: draft.date ?? today(),
    payers,
    splitType: draft.splitType,
    splitInput: draft.splitInput,
    splits,
    note: draft.note?.trim() || undefined,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    history: [...(previous?.history ?? []), change],
  };
  await db.expenses.put(expense);
  writeLocal(LAST_KEY + draft.groupId, {
    payers: payers.map(({ personId }) => personId),
    splitType: expense.splitType,
    splitInput: expense.splitInput,
  });
  if (!previous) {
    requestPersistence();
    writeLocal(NUDGE_KEY, readLocal(NUDGE_KEY, 0) + 1);
  }
  return expense;
}

export const putExpense = (expense: Expense) => db.expenses.put(expense);

export function lastUsed(groupId: ID): { payers: ID[]; splitType: SplitType; splitInput: SplitInput[] } | null {
  return readLocal(LAST_KEY + groupId, null);
}

export async function deleteExpense(id: ID) {
  const expense = await db.expenses.get(id);
  if (!expense) return;
  const now = Date.now();
  await db.expenses.update(id, {
    deletedAt: now,
    history: [...(expense.history ?? []), { at: now, action: "deleted", summary: expense.description }],
  });
}

export async function restoreExpense(id: ID) {
  const expense = await db.expenses.get(id);
  if (!expense) return;
  const { deletedAt: _removed, ...rest } = expense;
  await db.expenses.put({
    ...rest,
    history: [...(expense.history ?? []), { at: Date.now(), action: "restored", summary: expense.description }],
  });
}

export async function descriptionSuggestions(groupId: ID): Promise<string[]> {
  const expenses = await db.expenses.where({ groupId }).toArray();
  return [...new Set(expenses.filter(({ deletedAt }) => !deletedAt).sort((a, b) => b.createdAt - a.createdAt).map(({ description }) => description))];
}

export async function addSettlement(input: { groupId: ID; fromId: ID; toId: ID; amount: Paise }): Promise<Settlement> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new MoneyError("Enter an amount");
  if (input.fromId === input.toId) throw new MoneyError("Choose two different people");
  if ((await db.groups.get(input.groupId))?.archived) throw new Error("This group is archived");
  const settlement: Settlement = { ...input, id: newId(), date: today(), createdAt: Date.now() };
  await db.settlements.add(settlement);
  return settlement;
}

export const deleteSettlement = (id: ID) => db.settlements.update(id, { deletedAt: Date.now() });
export const restoreSettlement = async (id: ID) => {
  const settlement = await db.settlements.get(id);
  if (settlement) {
    const { deletedAt: _removed, ...rest } = settlement;
    await db.settlements.put(rest);
  }
};

export async function exportAll(): Promise<Backup> {
  const [people, groups, expenses, settlements] = await Promise.all([
    db.people.toArray(), db.groups.toArray(), db.expenses.toArray(), db.settlements.toArray(),
  ]);
  return { app: "billber", version: 1, exportedAt: Date.now(), people, groups, expenses, settlements };
}

export function markBackedUp() {
  writeLocal(NUDGE_KEY, 0);
}

export const shouldNudgeBackup = () => readLocal(NUDGE_KEY, 0) >= NUDGE_EVERY;

export async function importAll(backup: Pick<Backup, "people" | "groups" | "expenses" | "settlements">, mode: "merge" | "replace") {
  await db.transaction("rw", db.people, db.groups, db.expenses, db.settlements, async () => {
    if (mode === "replace") {
      await Promise.all([db.people.clear(), db.groups.clear(), db.expenses.clear(), db.settlements.clear()]);
    } else {
      // Keep this phone's "me", so importing somebody else's backup doesn't create a second one.
      const me = await getMe();
      if (me) backup = { ...backup, people: backup.people.map(({ isMe: _isMe, ...person }) => (person.id === me.id ? me : person)) };
    }
    await db.people.bulkPut(backup.people);
    await db.groups.bulkPut(backup.groups);
    await db.expenses.bulkPut(backup.expenses);
    await db.settlements.bulkPut(backup.settlements);
  });
}

export async function clearAll() {
  await Promise.all([db.people.clear(), db.groups.clear(), db.expenses.clear(), db.settlements.clear()]);
  try {
    Object.keys(localStorage).filter((key) => key.startsWith("billber.")).forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing else to clear if storage is blocked.
  }
}
