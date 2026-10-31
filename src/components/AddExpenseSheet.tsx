import { useLiveQuery } from "dexie-react-hooks";
import { Check, Delete } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, guessCategory } from "../categories";
import type { Expense, Group, Person } from "../db";
import { evaluateAmount, formatMoney, toInputValue, type ID } from "../money";
import * as repo from "../repo";
import { displayName } from "../share";
import { initialValue, parsePaise, SplitEditor, splitInput, splitStatus, type SplitState } from "./SplitEditor";
import { Avatar, Button, Field, fitSize, inputClass, Sheet, useToast } from "./ui";

type Panel = "keypad" | "payer" | "split" | "people" | "more";

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", ".", "0", "back", "+"];
const OPERATORS = "+−×÷";

function Word({ children, onClick, active }: { children: ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button type="button" aria-expanded={active} onClick={onClick} className={`-mx-0.5 inline-block min-h-9 rounded-lg px-0.5 font-extrabold underline decoration-2 underline-offset-4 ${active ? "bg-sun" : ""}`}>
      {children}
    </button>
  );
}

function startingSplit(group: Group, editing?: Expense): SplitState {
  if (editing) {
    return {
      type: editing.splitType,
      included: editing.splitInput.map(({ personId }) => personId),
      values: Object.fromEntries(editing.splitInput.map(({ personId, value }) => [
        personId,
        editing.splitType === "exact" ? toInputValue(value, group.currency) : String(value),
      ])),
    };
  }
  const last = repo.lastUsed(group.id);
  // Percentages and shares carry over, like a 60/40 rent split. Exact amounts only fit one bill, so they don't.
  const reusable = last && (last.splitType === "percent" || last.splitType === "shares")
    && last.splitInput.every(({ personId }) => group.memberIds.includes(personId));
  if (reusable) {
    return {
      type: last.splitType,
      included: last.splitInput.map(({ personId }) => personId),
      values: Object.fromEntries(last.splitInput.map(({ personId, value }) => [personId, String(value)])),
    };
  }
  return { type: "equal", included: group.memberIds, values: {} };
}

function startingPayers(group: Group, me: Person, editing?: Expense): ID[] {
  if (editing) return editing.payers.map(({ personId }) => personId);
  const last = repo.lastUsed(group.id)?.payers.filter((id) => group.memberIds.includes(id));
  if (last?.length === 1) return last;
  return [group.memberIds.includes(me.id) ? me.id : group.memberIds[0]];
}

type Props = { open: boolean; onClose: () => void; me: Person; groupId?: ID; editing?: Expense; choosableGroups?: Group[] };

export function AddExpenseSheet({ open, onClose, ...rest }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={rest.editing ? "Edit expense" : "Add expense"} tall>
      {open && <SheetBody key={rest.editing?.id ?? "new"} onClose={onClose} {...rest} />}
    </Sheet>
  );
}

function SheetBody({ onClose, me, groupId, editing, choosableGroups }: Omit<Props, "open">) {
  const [currentGroupId, setCurrentGroupId] = useState(groupId ?? choosableGroups?.[0]?.id);
  const group = useLiveQuery(() => (currentGroupId ? repo.getGroup(currentGroupId) : undefined), [currentGroupId]);
  if (!group) return null;
  return <Form key={group.id} {...{ onClose, me, group, editing, choosableGroups }} onGroup={setCurrentGroupId} />;
}

type FormProps = { onClose: () => void; me: Person; group: Group; editing?: Expense; choosableGroups?: Group[]; onGroup: (id: ID) => void };

function Form({ onClose, me, group, editing, choosableGroups, onGroup }: FormProps) {
  const toast = useToast();
  const currency = group.currency;
  const people = useLiveQuery(() => repo.listPeople(), []) ?? [];
  const suggestions = useLiveQuery(() => repo.descriptionSuggestions(group.id), [group.id]) ?? [];
  const [amountText, setAmountText] = useState(editing ? toInputValue(editing.amount, currency) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [pickedCategory, setPickedCategory] = useState(editing?.category ?? "");
  const [date, setDate] = useState(editing?.date ?? repo.today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [panel, setPanel] = useState<Panel>("keypad");
  const [payerIds, setPayerIds] = useState(() => startingPayers(group, me, editing));
  const [paid, setPaid] = useState<Record<ID, string>>(() => Object.fromEntries((editing?.payers ?? []).map(({ personId, paid: value }) => [personId, toInputValue(value, currency)])));
  const [split, setSplit] = useState<SplitState>(() => startingSplit(group, editing));
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (panel === "keypad") amountRef.current?.focus(); }, [panel]);

  const amount = evaluateAmount(amountText, currency);
  const hasMaths = /[+−×÷*/-]/.test(amountText.slice(1));
  const status = splitStatus(split, amount, currency);
  const guessed = guessCategory(description);
  const categoryId = pickedCategory || guessed;
  const multiple = payerIds.length > 1;
  const paidLeft = useMemo(() => {
    if (!multiple || !amount) return 0;
    return amount - payerIds.reduce((acc, id) => acc + parsePaise(paid[id] ?? "", currency), 0);
  }, [amount, currency, multiple, paid, payerIds]);
  const canSave = Boolean(amount && status.splits && paidLeft === 0);
  const matches = description ? suggestions.filter((text) => text.toLowerCase().startsWith(description.toLowerCase()) && text !== description).slice(0, 3) : suggestions.slice(0, 3);

  const press = (key: string) => {
    setError("");
    if (key === "back") return setAmountText((text) => text.slice(0, -1));
    setAmountText((text) => {
      if (OPERATORS.includes(key) && (!text || OPERATORS.includes(text.slice(-1)))) return text;
      return text + key;
    });
  };

  const setIncluded = (id: ID) => {
    const included = split.included.includes(id) ? split.included.filter((value) => value !== id) : [...split.included, id];
    setSplit({
      ...split,
      included,
      values: split.type === "equal" ? split.values : Object.fromEntries(included.map((person, index) => [
        person,
        split.values[person] ?? initialValue(split.type, included.length, amount, currency, index),
      ])),
    });
  };

  const togglePayer = (id: ID) => setPayerIds((ids) => {
    if (!ids.includes(id)) return [...ids, id];
    return ids.length > 1 ? ids.filter((value) => value !== id) : ids;
  });

  const save = async () => {
    if (!amount) return;
    try {
      const saved = await repo.saveExpense({
        id: editing?.id,
        groupId: group.id,
        amount,
        description,
        category: categoryId,
        date,
        note,
        payers: multiple ? payerIds.map((personId) => ({ personId, paid: parsePaise(paid[personId] ?? "", currency) })) : [{ personId: payerIds[0], paid: amount }],
        splitType: split.type,
        splitInput: splitInput(split, currency),
      });
      onClose();
      if (editing) toast.show("Saved", () => repo.putExpense(editing));
      else toast.show("Added", () => repo.deleteExpense(saved.id));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That didn't save. Try again.");
    }
  };

  const remove = async () => {
    if (!editing) return;
    await repo.deleteExpense(editing.id);
    onClose();
    toast.show("Deleted", () => repo.restoreExpense(editing.id));
  };

  const payerWord = multiple ? `${payerIds.length} people` : payerIds[0] === me.id ? "you" : displayName(people, payerIds[0]);
  const splitWord = { equal: "equally", exact: "by exact amounts", percent: "by percent", shares: "by shares" }[split.type];
  const count = split.included.length;

  return (
    <div className="flex h-full flex-col">
      <div className="torn shrink-0 bg-sun px-5 pt-3">
        <div className="flex min-h-11 items-center justify-between">
          {choosableGroups && choosableGroups.length > 1 && !editing ? (
            <select aria-label="Group" value={group.id} onChange={(event) => onGroup(event.target.value)} className="-ml-1 max-w-[70%] truncate bg-transparent py-2 text-[17px] font-bold">
              {choosableGroups.map(({ id, name, emoji }) => <option key={id} value={id}>{emoji} {name}</option>)}
            </select>
          ) : <p className="truncate text-[17px] font-bold">{group.emoji} {group.name}</p>}
          <button type="button" onClick={onClose} className="-mr-2 min-h-11 px-2 text-[17px] font-bold">Cancel</button>
        </div>
        <div className="flex items-baseline gap-1">
          <span aria-hidden className="display" style={{ fontSize: fitSize(`₹${amountText}`, 36) }}>{formatMoney(0, currency).replace(/[\d.,\s]/g, "")}</span>
          <input
            ref={amountRef}
            autoFocus
            aria-label="Amount"
            inputMode="none"
            autoComplete="off"
            value={amountText}
            placeholder="0"
            onChange={(event) => { setError(""); setAmountText(event.target.value.replace(/[^\d.+\-−×÷*/,]/g, "")); }}
            onKeyDown={(event) => { if (event.key === "Enter" && canSave) void save(); }}
            className="display w-full min-w-0 bg-transparent placeholder:text-ink/30 focus:outline-none"
            style={{ fontSize: fitSize(`₹${amountText}`, 52) }}
          />
        </div>
        <p aria-live="polite" className="min-h-6 text-[17px] font-bold">{hasMaths && amount ? `= ${formatMoney(amount, currency)}` : ""}</p>
        <input aria-label="What was it for?" value={description} placeholder="What was it for?" onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl bg-white/70 px-3.5 text-[17px] font-semibold placeholder:text-ink/70 focus:bg-white" />
        {matches.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {matches.map((text) => <button key={text} type="button" onClick={() => setDescription(text)} className="min-h-9 shrink-0 rounded-full bg-ink/10 px-3 text-[15px] font-semibold">{text}</button>)}
          </div>
        )}
      </div>

      <p className="px-4 pt-2 text-center text-[18px] font-medium leading-9">
        Paid by <Word active={panel === "payer"} onClick={() => setPanel(panel === "payer" ? "keypad" : "payer")}>{payerWord}</Word>, split{" "}
        <Word active={panel === "split"} onClick={() => setPanel(panel === "split" ? "keypad" : "split")}>{splitWord}</Word> with{" "}
        <Word active={panel === "people"} onClick={() => setPanel(panel === "people" ? "keypad" : "people")}>{count === 1 ? "1 person" : `${count} people`}</Word>
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2">
        {panel === "keypad" && (
          <div className="grid h-full max-h-[440px] grid-cols-4 gap-2 pb-2" role="group" aria-label="Keypad">
            {KEYS.map((key) => {
              const operator = OPERATORS.includes(key);
              return (
                <button key={key} type="button" aria-label={key === "back" ? "Delete" : key} onClick={() => press(key)} className={`grid min-h-12 place-items-center rounded-2xl text-[26px] font-bold active:bg-sun ${operator ? "bg-ink text-sun" : "bg-wash"}`}>
                  {key === "back" ? <Delete size={26} strokeWidth={2.5} /> : key}
                </button>
              );
            })}
          </div>
        )}

        {panel === "payer" && (
          <div>
            <ul>
              {group.memberIds.map((id) => {
                const chosen = payerIds.includes(id);
                return (
                  <li key={id} className="flex min-h-14 items-center gap-3">
                    <button type="button" aria-pressed={chosen} onClick={() => { if (multiple) togglePayer(id); else { setPayerIds([id]); setPanel("keypad"); } }} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar person={people.find((person) => person.id === id)} size={40} />
                      <span className="truncate text-[17px] font-semibold">{displayName(people, id)}</span>
                      {chosen && <Check size={22} strokeWidth={3} className="shrink-0" />}
                    </button>
                    {multiple && chosen && <input aria-label={`${displayName(people, id)} paid`} inputMode="decimal" value={paid[id] ?? ""} placeholder="0" onChange={(event) => setPaid({ ...paid, [id]: event.target.value })} className={`${inputClass} !w-28 text-right`} />}
                  </li>
                );
              })}
            </ul>
            {group.memberIds.length > 1 && (
              <Button tone="plain" className="mt-2 w-full" onClick={() => { if (multiple) setPayerIds([payerIds[0]]); else setPayerIds(group.memberIds.slice(0, 2)); }}>
                {multiple ? "One person paid" : "Multiple people paid"}
              </Button>
            )}
            {multiple && amount && paidLeft !== 0 && <p className="mt-2 text-center font-bold text-owe">{formatMoney(paidLeft, currency)} {paidLeft > 0 ? "left to assign" : "too much"}</p>}
          </div>
        )}

        {panel === "split" && <SplitEditor state={split} onChange={setSplit} amount={amount} currency={currency} people={people} status={status} />}

        {panel === "people" && (
          <ul className="grid grid-cols-3 gap-2">
            {group.memberIds.map((id) => {
              const included = split.included.includes(id);
              return (
                <li key={id}>
                  <button type="button" aria-pressed={included} aria-label={`${displayName(people, id)} ${included ? "included" : "left out"}`} onClick={() => setIncluded(id)} className={`relative flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl p-2 ${included ? "" : "opacity-55"}`}>
                    <span className="relative">
                      <Avatar person={people.find((person) => person.id === id)} size={52} />
                      {included && <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-ink text-white"><Check size={15} strokeWidth={3.5} /></span>}
                    </span>
                    <span className="max-w-full truncate text-[15px] font-semibold">{displayName(people, id)}</span>
                    <span className="text-[13px] font-medium text-soft">{included ? "In" : "Left out"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {panel === "more" && (
          <div className="flex flex-col gap-3 pb-2">
            <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} /></Field>
            <Field label="Category">
              <select value={categoryId} onChange={(event) => setPickedCategory(event.target.value)} className={inputClass}>
                {CATEGORIES.map(({ id, label, emoji }) => <option key={id} value={id}>{emoji} {label}</option>)}
              </select>
            </Field>
            <Field label="Note"><textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} className={`${inputClass} py-2.5`} /></Field>
            {editing && <Button tone="danger" onClick={() => void remove()}>Delete expense</Button>}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-white px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="pb-2 text-center font-bold text-owe">{error}</p>}
        <div className="flex gap-2">
          <Button tone="plain" className="shrink-0" aria-expanded={panel === "more"} onClick={() => setPanel(panel === "more" ? "keypad" : "more")}>{panel === "keypad" ? "More" : "Keypad"}</Button>
          <Button className="flex-1" disabled={!canSave} onClick={() => void save()}>{editing ? "Save changes" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}


