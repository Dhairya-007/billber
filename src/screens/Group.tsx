import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Plus, Scale, Share2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as repo from "../repo";
import { activity, formatDay, summarize } from "../balances";
import { category } from "../categories";
import { AddExpenseSheet } from "../components/AddExpenseSheet";
import { MembersSheet } from "../components/GroupSheet";
import { ShareSheet } from "../components/ShareSheet";
import { BackLink, colorFor, inkOn, Sheet, SheetHeader } from "../components/ui";
import type { Expense, Person, Settlement } from "../db";
import { formatMoney } from "../money";
import { displayName, transferLine } from "../share";

function ActionLink({ icon, label, to, onClick }: { icon: ReactNode; label: string; to?: string; onClick?: () => void }) {
  const className = "flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-2xl bg-black/15 text-[13px] font-bold";
  return to ? <Link to={to} className={className}>{icon}{label}</Link> : <button type="button" onClick={onClick} className={className}>{icon}{label}</button>;
}

// Plain words only: "you get back ₹450", never a negative number.
function yourPart(expense: Expense, me: Person, people: Person[], currency: string) {
  const paid = expense.payers.find(({ personId }) => personId === me.id)?.paid ?? 0;
  const owed = expense.splits.find(({ personId }) => personId === me.id)?.owed ?? 0;
  const net = paid - owed;
  const payer = expense.payers.length > 1 ? `${expense.payers.length} people` : displayName(people, expense.payers[0].personId);
  const text = net > 0 ? `you get back ${formatMoney(net, currency)}` : net < 0 ? `you owe ${formatMoney(net, currency)}` : paid || owed ? "you're even" : "not involved";
  return { payer, text, tone: net > 0 ? "text-owed" : net < 0 ? "text-owe" : "text-soft" };
}

export function GroupScreen({ me }: { me: Person }) {
  const { id = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense>();
  const [panel, setPanel] = useState<"people" | "share" | "history" | null>(null);

  const group = useLiveQuery(async () => (await repo.getGroup(id)) ?? null, [id]);
  const people = useLiveQuery(() => repo.listPeople(), []) ?? [];
  const expenses = useLiveQuery(() => repo.groupExpenses(id), [id]) ?? [];
  const settlements = useLiveQuery(() => repo.groupSettlements(id), [id]) ?? [];

  useEffect(() => {
    if (search.get("add")) {
      setAdding(true);
      setSearch({}, { replace: true });
    }
  }, [search, setSearch]);

  const days = useMemo(() => {
    type Row = { key: string; date: string; at: number; expense?: Expense; settlement?: Settlement };
    const rows: Row[] = [
      ...expenses.filter(({ deletedAt }) => !deletedAt).map((expense) => ({ key: expense.id, date: expense.date, at: expense.createdAt, expense })),
      ...settlements.filter(({ deletedAt }) => !deletedAt).map((settlement) => ({ key: settlement.id, date: settlement.date, at: settlement.createdAt, settlement })),
    ];
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
    const grouped = new Map<string, Row[]>();
    for (const row of rows) grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
    return [...grouped];
  }, [expenses, settlements]);

  if (group === undefined) return null;
  if (group === null) return <main className="p-6"><BackLink to="/" label="Back to home" /><p className="text-[17px]">This group isn't on this phone.</p></main>;

  const background = colorFor(group.id);
  const color = inkOn(background);
  const summary = summarize(group, expenses, settlements);
  const net = summary.nets.get(me.id) ?? 0;
  const currency = group.currency;
  const history = activity(expenses, settlements, ({ fromId, toId, amount }) => transferLine(people, fromId, toId, amount, currency));

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="torn px-5 pt-[max(10px,env(safe-area-inset-top))]" style={{ background, color }}>
        <BackLink to="/" label="Back to home" color={color} />
        <h1 className="display mt-1 text-[38px] leading-[1.05]">{group.emoji} {group.name}</h1>
        <p className="mt-2 text-[20px] font-bold">{!group.memberIds.includes(me.id) ? "Imported group" : net > 0 ? `You are owed ${formatMoney(net, currency)}` : net < 0 ? `You owe ${formatMoney(net, currency)}` : "You are settled up"}</p>
        <p className="text-[15px] font-medium">Total {formatMoney(summary.total, currency)}</p>
        <nav aria-label="Group actions" className="mt-4 grid grid-cols-4 gap-2">
          <ActionLink icon={<Scale size={22} strokeWidth={2.5} />} label="Balances" to={`/g/${group.id}/balances`} />
          <ActionLink icon={<Share2 size={22} strokeWidth={2.5} />} label="Share" onClick={() => setPanel("share")} />
          <ActionLink icon={<Users size={22} strokeWidth={2.5} />} label="People" onClick={() => setPanel("people")} />
          <ActionLink icon={<Clock size={22} strokeWidth={2.5} />} label="History" onClick={() => setPanel("history")} />
        </nav>
      </header>

      {group.archived && <p className="mx-4 mt-4 rounded-2xl bg-wash p-4 text-[16px] font-semibold">This group is archived and read-only.</p>}

      <section aria-label="Expenses" className="flex-1 px-4 pt-4 pb-32">
        {days.length === 0 && <p className="px-2 pt-10 text-center text-[18px] font-semibold text-soft">No expenses yet. Tap + to add the first one.</p>}
        {days.map(([date, rows]) => (
          <div key={date} className="mb-3">
            <h2 className="px-1 pb-1 text-[15px] font-bold text-soft">{formatDay(date)}</h2>
            <ul>
              {rows.map(({ key, expense, settlement }) => {
                if (settlement) {
                  return <li key={key} className="flex min-h-14 items-center gap-3 px-1 py-2"><span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-wash text-[20px]">🤝</span><span className="text-[16px] font-semibold">{transferLine(people, settlement.fromId, settlement.toId, settlement.amount, currency).replace(/ pays /, " paid ").replace(/^You pay /, "You paid ")}</span></li>;
                }
                const { payer, text, tone } = yourPart(expense!, me, people, currency);
                return (
                  <li key={key}>
                    <button type="button" disabled={group.archived} onClick={() => setEditing(expense)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-1 py-2 text-left active:bg-wash">
                      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-wash text-[21px]">{category(expense!.category).emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-bold">{expense!.description}</span>
                        <span className="block truncate text-[15px] text-soft">{payer} paid {formatMoney(expense!.amount, currency)}</span>
                      </span>
                      <span className={`max-w-[42%] text-right text-[15px] font-bold ${tone}`}>{text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {!group.archived && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-[460px] justify-end px-5">
          <button type="button" aria-label="Add expense" onClick={() => setAdding(true)} className="pointer-events-auto grid size-[68px] place-items-center rounded-full bg-ink text-sun shadow-lg active:scale-95"><Plus size={36} strokeWidth={3} /></button>
        </div>
      )}

      <AddExpenseSheet open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(undefined); }} me={me} groupId={group.id} editing={editing} />
      <MembersSheet open={panel === "people"} onClose={() => setPanel(null)} group={group} people={people} />
      <ShareSheet open={panel === "share"} onClose={() => setPanel(null)} group={group} people={people} expenses={expenses} settlements={settlements} />
      <Sheet open={panel === "history"} onClose={() => setPanel(null)} title="History">
        <SheetHeader title="History" onClose={() => setPanel(null)} />
        <ul className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {history.length === 0 && <li className="py-4 text-soft">Nothing yet.</li>}
          {history.map(({ key, at, text }) => (
            <li key={key} className="border-b border-line py-2.5">
              <p className="text-[16px] font-semibold">{text}</p>
              <p className="text-[14px] text-soft">{new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
            </li>
          ))}
        </ul>
      </Sheet>
    </main>
  );
}
