import { z } from "zod";

const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().max(500);

export const personSchema = z.object({
  id, name: z.string().min(1).max(80), emoji: z.string().max(16).optional(), isMe: z.boolean().optional(), createdAt: z.number(),
});

export const groupSchema = z.object({
  id, name: z.string().min(1).max(80), emoji: z.string().max(16).optional(), currency: z.string().length(3),
  memberIds: z.array(id).max(200), archived: z.boolean().optional(), createdAt: z.number(),
});

const change = z.object({ at: z.number(), action: z.enum(["added", "edited", "deleted", "restored"]), summary: text });

export const expenseSchema = z.object({
  id, groupId: id, description: text, category: z.string().max(32), amount: paise.positive(), date,
  payers: z.array(z.object({ personId: id, paid: paise })).min(1),
  splitType: z.enum(["equal", "exact", "percent", "shares"]),
  splitInput: z.array(z.object({ personId: id, value: z.number().nonnegative() })),
  splits: z.array(z.object({ personId: id, owed: paise })).min(1),
  note: text.optional(), deletedAt: z.number().optional(), createdAt: z.number(), updatedAt: z.number(),
  history: z.array(change).optional(),
}).refine(({ amount, payers, splits }) => (
  payers.reduce((acc, { paid }) => acc + paid, 0) === amount && splits.reduce((acc, { owed }) => acc + owed, 0) === amount
), "Payers and splits must add up to the amount");

export const settlementSchema = z.object({
  id, groupId: id, fromId: id, toId: id, amount: paise.positive(), date, deletedAt: z.number().optional(), createdAt: z.number(),
});

export const backupSchema = z.object({
  app: z.literal("billber"), version: z.literal(1), exportedAt: z.number(),
  people: z.array(personSchema), groups: z.array(groupSchema), expenses: z.array(expenseSchema), settlements: z.array(settlementSchema),
});

export const sharedGroupSchema = z.object({
  v: z.literal(1), sharedAt: z.number(), group: groupSchema, people: z.array(personSchema),
  expenses: z.array(expenseSchema), settlements: z.array(settlementSchema),
});

export type Backup = z.infer<typeof backupSchema>;
export type SharedGroup = z.infer<typeof sharedGroupSchema>;
