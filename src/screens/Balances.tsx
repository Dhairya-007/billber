import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { balanceLines, formatDay, summarize } from "../balances";
import { ShareSheet } from "../components/ShareSheet";
import { Avatar, BackLink, Button, Field, inputClass, Sheet, SheetHeader, useToast } from "../components/ui";
import { evaluateAmount, formatMoney, toInputValue, type Transfer } from "../money";
import * as repo from "../repo";
import { nameOf, transferLine } from "../share";

export function Balances() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [open, setOpen] = useState<Transfer>();
  const [settling, setSettling] = useState<Transfer>();
  const [amountText, setAmountText] = useState("");
  const [sharing, setSharing] = useState(false);

  const group = useLiveQuery(async () => (await repo.getGroup(id)) ?? null, [id]);
  const people = useLiveQuery(() => repo.listPeople(), []) ?? [];
  const expenses = useLiveQuery(() => repo.groupExpenses(id), [id]) ?? [];
  const settlements = useLiveQuery(() => repo.groupSettlements(id), [id]) ?? [];
  if (group === undefined) return null;
  if (group === null) return <main className="p-6"><BackLink to="/" label="Back to home" /><p className="text-[17px]">This group isn't on this phone.</p></main>;

  const currency = group.currency;
  const { total, nets, transfers, paid, share } = summarize(group, expenses, settlements);
  const name = (personId: string) => nameOf(people, personId);
  const lines = open ? balanceLines(open.from, expenses, settlements, name) : [];
  const amount = evaluateAmount(amountText, currency);
  const spenders = [...new Set([...group.memberIds, ...paid.keys(), ...share.keys()])];

  const startSettling = (transfer: Transfer) => {
    setOpen(undefined);
    setAmountText(toInputValue(transfer.amount, currency));
    setSettling(transfer);
  };

  const settle = async () => {
    if (!settling || !amount) return;
    const record = await repo.addSettlement({ groupId: group.id, fromId: settling.from, toId: settling.to, amount });
    setSettling(undefined);
    toast.show("Marked as settled", () => repo.deleteSettlement(record.id));
  };

  return (
    <main className="min-h-dvh pb-10">
      <header className="torn bg-ink px-5 pt-[max(10px,env(safe-area-inset-top))] text-white">
        <BackLink to={`/g/${group.id}`} label={`Back to ${group.name}`} color="#ffd000" />
        <h1 className="display mt-1 text-[38px] text-sun">Balances</h1>
        <p className="mt-2 text-[18px] font-semibold">{group.emoji} {group.name}</p>
      </header>

      <section aria-label="Who owes whom" className="px-4 pt-5">
        {transfers.length === 0 && <p className="display py-8 text-center text-[30px]">All settled up</p>}
        <ul className="flex flex-col gap-2">
          {transfers.map((transfer) => (
            <li key={`${transfer.from}-${transfer.to}`} className="rounded-3xl bg-wash p-1.5">
              <button type="button" aria-label={`${transferLine(people, transfer.from, transfer.to, transfer.amount, currency)}. See the expenses behind it.`} onClick={() => setOpen(transfer)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left">
                <Avatar person={people.find((person) => person.id === transfer.from)} size={42} />
                <span className="min-w-0 flex-1 text-[19px] leading-tight font-bold">{transferLine(people, transfer.from, transfer.to, transfer.amount, currency)}</span>
                <ChevronRight size={22} strokeWidth={2.75} className="shrink-0" />
              </button>
              {!group.archived && <Button tone="sun" className="mt-1 w-full" onClick={() => startSettling(transfer)}>Mark as settled</Button>}
            </li>
          ))}
        </ul>
        <Button tone="plain" className="mt-3 w-full" onClick={() => setSharing(true)}>Share summary</Button>
      </section>

      <section aria-label="Spending" className="px-4 pt-7">
        <h2 className="display text-[26px]">Spending</h2>
        <p className="mt-1 text-[17px] font-semibold">{formatMoney(total, currency)} in total</p>
        <ul className="mt-2">
          {spenders.map((personId) => (
            <li key={personId} className="flex min-h-14 items-center gap-3 border-b border-line py-2">
              <Avatar person={people.find((person) => person.id === personId)} size={36} />
              <span className="min-w-0 flex-1 truncate font-bold">{name(personId)}</span>
              <span className="text-right text-[15px] leading-snug">
                <span className="block font-semibold">Paid {formatMoney(paid.get(personId) ?? 0, currency)}</span>
                <span className="block text-soft">Share {formatMoney(share.get(personId) ?? 0, currency)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={Boolean(open)} onClose={() => setOpen(undefined)} title="What makes up this balance">
        {open && (
          <>
            <SheetHeader title={`${name(open.from)}'s balance`} onClose={() => setOpen(undefined)} />
            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
              <ul>
                {lines.map(({ id: lineId, date, label, effect }) => (
                  <li key={lineId} className="flex min-h-14 items-center gap-3 border-b border-line py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{label}</span>
                      <span className="block text-[14px] text-soft">{formatDay(date)}</span>
                    </span>
                    <span className={`text-right text-[15px] font-bold ${effect >= 0 ? "text-owed" : "text-owe"}`}>{effect >= 0 ? "Owed back" : "Owes"} {formatMoney(effect, currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="py-4 text-[18px] font-extrabold">Overall, {name(open.from)} owes {formatMoney(nets.get(open.from) ?? 0, currency)}</p>
              {!group.archived && <Button tone="sun" className="w-full" onClick={() => startSettling(open)}>Mark as settled</Button>}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(settling)} onClose={() => setSettling(undefined)} title="Mark as settled">
        {settling && (
          <>
            <SheetHeader title="Mark as settled" onClose={() => setSettling(undefined)} />
            <div className="flex flex-col gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
              <p className="text-[17px] font-medium">{name(settling.from)} paid {name(settling.to)} outside the app. Billber only records it.</p>
              <Field label="Amount paid back"><input autoFocus inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} className={inputClass} /></Field>
              <Button disabled={!amount} onClick={() => void settle()}>Save {amount ? formatMoney(amount, currency) : ""}</Button>
            </div>
          </>
        )}
      </Sheet>

      <ShareSheet open={sharing} onClose={() => setSharing(false)} group={group} people={people} expenses={expenses} settlements={settlements} />
    </main>
  );
}
