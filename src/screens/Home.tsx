import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { summarize } from "../balances";
import { AddExpenseSheet } from "../components/AddExpenseSheet";
import { NewGroupSheet } from "../components/GroupSheet";
import { Button, colorFor, fitSize, inkOn } from "../components/ui";
import type { Person } from "../db";
import { formatMoney } from "../money";
import * as repo from "../repo";

function standing(net: number, currency: string) {
  if (net > 0) return `You are owed ${formatMoney(net, currency)}`;
  if (net < 0) return `You owe ${formatMoney(net, currency)}`;
  return "You are settled up";
}

export function Home({ me }: { me: Person }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const rows = useLiveQuery(async () => {
    const groups = (await repo.listGroups()).filter(({ archived }) => !archived).sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(groups.map(async (group) => {
      const [expenses, settlements] = await Promise.all([repo.groupExpenses(group.id), repo.groupSettlements(group.id)]);
      const { total, nets } = summarize(group, expenses, settlements);
      return { group, total, net: nets.get(me.id) ?? 0, count: expenses.filter(({ deletedAt }) => !deletedAt).length };
    }));
  }, [me.id]);

  const byCurrency = new Map<string, number>();
  for (const { group, net } of rows ?? []) byCurrency.set(group.currency, (byCurrency.get(group.currency) ?? 0) + net);
  const totals = [...byCurrency];

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="torn bg-sun px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center justify-between">
          <p className="text-[19px] font-extrabold">Billber</p>
          <Link to="/settings" aria-label="Settings" className="-mr-2 grid size-11 place-items-center"><SettingsIcon size={25} strokeWidth={2.5} /></Link>
        </div>
        <p className="mt-5 text-[17px] font-semibold">Hi {me.name}</p>
        {totals.length === 0 ? <h1 className="display mt-1 pb-2 text-[44px]">Nothing owed yet</h1> : totals.map(([currency, net]) => (
          <div key={currency} className="mt-1">
            <p className="text-[20px] font-bold">{net === 0 ? "All settled up" : net > 0 ? "You are owed" : "You owe"}</p>
            {net !== 0 && <h1 className="display mt-1" style={{ fontSize: fitSize(formatMoney(net, currency), 64) }}>{formatMoney(net, currency)}</h1>}
          </div>
        ))}
      </header>

      {rows && repo.shouldNudgeBackup() && (
        <Link to="/settings" className="mx-4 mt-4 block rounded-2xl bg-wash p-4 text-[16px] font-semibold">Your data only lives on this phone. Back it up now.</Link>
      )}

      <section aria-label="Groups" className="flex flex-1 flex-col gap-3 px-4 pt-5 pb-32">
        {rows?.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <p className="display text-[30px]">Start with a group</p>
            <p className="text-[17px] text-soft">A trip, a flat, or tonight's dinner.</p>
            <Button tone="sun" onClick={() => setCreating(true)}>Create a group</Button>
          </div>
        )}
        {rows?.map(({ group, total, net, count }) => {
          const background = colorFor(group.id);
          const color = inkOn(background);
          const member = group.memberIds.includes(me.id);
          return (
            <Link key={group.id} to={`/g/${group.id}`} className="block rounded-3xl p-5 transition-transform active:scale-[.99]" style={{ background, color }}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="display min-w-0 text-[28px] leading-[1.05]">{group.name}</h2>
                <span aria-hidden className="text-[34px] leading-none">{group.emoji}</span>
              </div>
              <p className="mt-5 text-[19px] font-bold">{member ? standing(net, group.currency) : "Imported group"}</p>
              <p className="text-[15px] font-medium">Total {formatMoney(total, group.currency)}, {count === 1 ? "1 expense" : `${count} expenses`}</p>
            </Link>
          );
        })}
        {rows && rows.length > 0 && <Button tone="plain" onClick={() => setCreating(true)}>New group</Button>}
      </section>

      {rows && rows.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-[460px] justify-end px-5">
          <button type="button" aria-label="Add expense" onClick={() => setAdding(true)} className="pointer-events-auto grid size-[68px] place-items-center rounded-full bg-ink text-sun shadow-lg active:scale-95"><Plus size={36} strokeWidth={3} /></button>
        </div>
      )}

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} me={me} choosableGroups={rows?.map(({ group }) => group)} />
      <NewGroupSheet open={creating} onClose={() => setCreating(false)} onCreated={(group) => { setCreating(false); navigate(`/g/${group.id}?add=1`); }} />
    </main>
  );
}
