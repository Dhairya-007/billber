import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatDay, summarize } from "../balances";
import { category } from "../categories";
import { Avatar, Button, colorFor, inkOn } from "../components/ui";
import type { Expense } from "../db";
import { formatMoney } from "../money";
import { getMe, importAll } from "../repo";
import { displayName, transferLine, unpackGroup } from "../share";

export function SharedView() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const data = useMemo(() => unpackGroup(hash.slice(1)), [hash]);
  const me = useLiveQuery(async () => (await getMe()) ?? null, []);
  const [saved, setSaved] = useState(false);

  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-4 bg-sun p-6">
        <h1 className="display text-[38px]">This link doesn't work</h1>
        <p className="text-[18px] font-medium">It may have been cut off when it was shared. Ask for the link again.</p>
        <Button onClick={() => navigate("/")}>Open Billber</Button>
      </main>
    );
  }

  const { group, people, expenses, settlements, sharedAt } = data;
  const live = expenses as Expense[];
  const { total, transfers } = summarize(group, live, settlements);
  const background = colorFor(group.id);
  const color = inkOn(background);
  const currency = group.currency;
  const sorted = [...live].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const save = async () => {
    await importAll({ people, groups: [group], expenses: live, settlements }, "merge");
    setSaved(true);
  };

  return (
    <main className="min-h-dvh pb-10">
      <header className="torn px-5 pt-[max(28px,env(safe-area-inset-top))]" style={{ background, color }}>
        <p className="text-[15px] font-bold">Shared from Billber, as of {new Date(sharedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <h1 className="display mt-3 text-[38px] leading-[1.05]">{group.emoji} {group.name}</h1>
        <p className="mt-2 text-[20px] font-bold">Total {formatMoney(total, currency)}</p>
      </header>

      <section aria-label="Who owes whom" className="px-4 pt-5">
        {transfers.length === 0 && <p className="display py-6 text-center text-[30px]">All settled up</p>}
        <ul className="flex flex-col gap-2">
          {transfers.map(({ from, to, amount }) => (
            <li key={`${from}-${to}`} className="flex min-h-16 items-center gap-3 rounded-2xl bg-wash px-3 py-2">
              <Avatar person={people.find((person) => person.id === from)} size={42} />
              <span className="text-[19px] leading-tight font-bold">{transferLine(people, from, to, amount, currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Expenses" className="px-4 pt-6">
        <h2 className="display text-[26px]">Expenses</h2>
        <ul className="mt-2">
          {sorted.map((expense) => (
            <li key={expense.id} className="flex min-h-14 items-center gap-3 border-b border-line py-2">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-wash text-[21px]">{category(expense.category).emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{expense.description}</span>
                <span className="block truncate text-[15px] text-soft">{displayName(people, expense.payers[0].personId)} paid, {formatDay(expense.date)}</span>
              </span>
              <span className="font-bold">{formatMoney(expense.amount, currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="px-4 pt-6">
        {saved
          ? <Button tone="sun" className="w-full" onClick={() => navigate(me ? `/g/${group.id}` : "/")}>Open in my Billber</Button>
          : <Button tone="plain" className="w-full" onClick={() => void save()}>Import into my app</Button>}
      </div>
    </main>
  );
}
