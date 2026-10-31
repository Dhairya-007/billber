import Dexie, { type EntityTable } from "dexie";
import type { ID, Paise, Payer, Split, SplitInput, SplitType } from "./money";

export interface Person { id: ID; name: string; emoji?: string; isMe?: boolean; createdAt: number }

export interface Group {
  id: ID; name: string; emoji?: string; currency: string; memberIds: ID[]; archived?: boolean; createdAt: number;
}

// One line of an expense's history, kept on the record so edits can be listed later.
export interface Change { at: number; action: "added" | "edited" | "deleted" | "restored"; summary: string }

export interface Expense {
  id: ID; groupId: ID; description: string; category: string; amount: Paise; date: string;
  payers: Payer[]; splitType: SplitType; splitInput: SplitInput[]; splits: Split[];
  note?: string; deletedAt?: number; createdAt: number; updatedAt: number; history?: Change[];
}

export interface Settlement {
  id: ID; groupId: ID; fromId: ID; toId: ID; amount: Paise; date: string; deletedAt?: number; createdAt: number;
}

export const db = new Dexie("billber") as Dexie & {
  people: EntityTable<Person, "id">;
  groups: EntityTable<Group, "id">;
  expenses: EntityTable<Expense, "id">;
  settlements: EntityTable<Settlement, "id">;
};

db.version(1).stores({
  people: "id, name",
  groups: "id, createdAt",
  expenses: "id, groupId, date, createdAt",
  settlements: "id, groupId, createdAt",
});
