import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import * as repo from "./repo";
import { groupBackup, packGroup, parseBackup, textSummary, unpackGroup } from "./share";

async function trip() {
  const me = await repo.setup("Dhairya", "INR");
  const rahul = await repo.addPerson("Rahul");
  const priya = await repo.addPerson("Priya");
  const group = await repo.createGroup({ name: "Goa", emoji: "🏖️", memberIds: [rahul.id, priya.id] });
  return { me, rahul, priya, group };
}

const equal = (ids: string[]) => ({ splitType: "equal" as const, splitInput: ids.map((personId) => ({ personId, value: 1 })) });

beforeEach(async () => {
  await repo.clearAll();
});

describe("expenses", () => {
  it("computes splits itself, and keeps balances correct through edit, delete and undo", async () => {
    const { me, rahul, priya, group } = await trip();
    const ids = [me.id, rahul.id, priya.id];
    const expense = await repo.saveExpense({ groupId: group.id, amount: 100000, description: "dinner", payers: [{ personId: me.id, paid: 100000 }], ...equal(ids) });
    expect(expense.category).toBe("food");
    expect(expense.splits.reduce((acc, { owed }) => acc + owed, 0)).toBe(100000);
    expect((await repo.groupNets(group.id)).get(me.id)).toBe(100000 - expense.splits.find(({ personId }) => personId === me.id)!.owed);

    await repo.saveExpense({ ...expense, id: expense.id, amount: 90000, payers: [{ personId: me.id, paid: 90000 }] });
    expect((await repo.groupNets(group.id)).get(me.id)).toBe(60000);
    expect((await db.expenses.get(expense.id))?.history?.map(({ action }) => action)).toEqual(["added", "edited"]);

    await repo.deleteExpense(expense.id);
    expect((await repo.groupNets(group.id)).get(me.id)).toBe(0);
    await repo.restoreExpense(expense.id);
    expect((await repo.groupNets(group.id)).get(me.id)).toBe(60000);
  });

  it("refuses money that doesn't add up, and people outside the group", async () => {
    const { me, rahul, group } = await trip();
    await expect(repo.saveExpense({ groupId: group.id, amount: 1000, payers: [{ personId: me.id, paid: 900 }], ...equal([me.id]) })).rejects.toThrow();
    const stranger = await repo.addPerson("Stranger");
    await expect(repo.saveExpense({ groupId: group.id, amount: 1000, payers: [{ personId: me.id, paid: 1000 }], ...equal([stranger.id]) })).rejects.toThrow();
    await expect(repo.saveExpense({ groupId: group.id, amount: 1000, payers: [{ personId: rahul.id, paid: 1000 }], splitType: "exact", splitInput: [{ personId: me.id, value: 400 }] })).rejects.toThrow();
    expect(await db.expenses.count()).toBe(0);
  });

  it("remembers the last payer and split per group", async () => {
    const { rahul, me, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 1000, payers: [{ personId: rahul.id, paid: 1000 }], splitType: "shares", splitInput: [{ personId: me.id, value: 1 }] });
    expect(repo.lastUsed(group.id)).toMatchObject({ payers: [rahul.id], splitType: "shares" });
  });

  it("does not allow changes to an archived group", async () => {
    const { me, rahul, group } = await trip();
    await repo.updateGroup(group.id, { archived: true });
    await expect(repo.saveExpense({ groupId: group.id, amount: 1000, payers: [{ personId: me.id, paid: 1000 }], ...equal([me.id]) })).rejects.toThrow("archived");
    await expect(repo.addSettlement({ groupId: group.id, fromId: rahul.id, toId: me.id, amount: 100 })).rejects.toThrow("archived");
  });

  it("can still edit an old expense after someone on it has left the group", async () => {
    const { me, rahul, group } = await trip();
    const expense = await repo.saveExpense({ groupId: group.id, amount: 60000, description: "Lunch", payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id, rahul.id]) });
    await repo.addSettlement({ groupId: group.id, fromId: rahul.id, toId: me.id, amount: 30000 });
    await repo.removeMember(group.id, rahul.id);
    await repo.saveExpense({ ...expense, description: "Team lunch" });
    expect((await db.expenses.get(expense.id))?.description).toBe("Team lunch");
  });
});

describe("members and settling", () => {
  it("blocks removing someone until they are settled, including after a partial payback", async () => {
    const { me, rahul, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 60000, payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id, rahul.id]) });
    await expect(repo.removeMember(group.id, rahul.id)).rejects.toThrow("Settle");
    await repo.addSettlement({ groupId: group.id, fromId: rahul.id, toId: me.id, amount: 10000 });
    expect((await repo.groupNets(group.id)).get(rahul.id)).toBe(-20000);
    const rest = await repo.addSettlement({ groupId: group.id, fromId: rahul.id, toId: me.id, amount: 20000 });
    await repo.removeMember(group.id, rahul.id);
    expect((await db.groups.get(group.id))?.memberIds).not.toContain(rahul.id);
    await repo.deleteSettlement(rest.id);
    expect((await repo.groupNets(group.id)).get(rahul.id)).toBe(-20000);
    await repo.restoreSettlement(rest.id);
    expect((await repo.groupNets(group.id)).get(rahul.id)).toBe(0);
  });

  it("reuses people across groups", async () => {
    const { rahul } = await trip();
    expect((await repo.addPerson(" rahul ")).id).toBe(rahul.id);
    await expect(repo.deletePerson(rahul.id)).rejects.toThrow();
  });
});

describe("backup and sharing", () => {
  it("round-trips a backup, and survives a replace", async () => {
    const { me, rahul, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 60000, payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id, rahul.id]) });
    const backup = parseBackup(JSON.stringify(await repo.exportAll()));
    await repo.clearAll();
    await repo.importAll(backup, "replace");
    expect((await repo.groupNets(group.id)).get(me.id)).toBe(30000);
    expect((await repo.getMe())?.id).toBe(me.id);
  });

  it("rejects a tampered backup whose money doesn't add up", async () => {
    const { me, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 60000, payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id]) });
    const backup = await repo.exportAll();
    backup.expenses[0].amount = 50000;
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });

  it("packs a group into a link that opens to the same balances", async () => {
    const { me, rahul, priya, group } = await trip();
    const ids = [me.id, rahul.id, priya.id];
    await repo.saveExpense({ groupId: group.id, amount: 90000, description: "Hotel", payers: [{ personId: me.id, paid: 90000 }], ...equal(ids) });
    const [people, expenses] = [await db.people.toArray(), await db.expenses.toArray()];
    const packed = packGroup(group, people, expenses, []);
    const opened = unpackGroup(packed);
    expect(opened?.group.name).toBe("Goa");
    expect(opened?.people.some(({ isMe }) => isMe)).toBe(false);
    expect(opened?.expenses[0].splits).toEqual(expenses[0].splits);
    expect(unpackGroup("garbage")).toBeNull();
  });

  it("gives big groups a file that imports like any backup", async () => {
    const { me, rahul, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 60000, payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id, rahul.id]) });
    const file = groupBackup(group, await db.people.toArray(), await db.expenses.toArray(), []);
    expect(file.people.some(({ isMe }) => isMe)).toBe(false);
    await repo.clearAll();
    await repo.importAll(parseBackup(JSON.stringify(file)), "merge");
    expect((await repo.groupNets(group.id)).get(rahul.id)).toBe(-30000);
  });

  it("writes a plain-language summary", async () => {
    const { me, rahul, group } = await trip();
    await repo.saveExpense({ groupId: group.id, amount: 60000, payers: [{ personId: me.id, paid: 60000 }], ...equal([me.id, rahul.id]) });
    const text = textSummary((await repo.getGroup(group.id))!, await db.people.toArray(), await db.expenses.toArray(), []);
    expect(text).toContain("Total ₹600");
    expect(text).toContain("Rahul pays you ₹300");
    expect(text).not.toContain("-");
  });
});
