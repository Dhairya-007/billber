import type { Person } from "../db";
import { computeSplits, evaluateAmount, formatMoney, toInputValue, type ID, type Paise, type Split, type SplitType } from "../money";
import { displayName } from "../share";
import { Avatar, inputClass } from "./ui";

export const SPLIT_LABELS: Record<SplitType, string> = { equal: "Equal", exact: "Exact", percent: "%", shares: "Shares" };

export type SplitState = { type: SplitType; included: ID[]; values: Record<ID, string> };

export function parsePaise(text: string, currency: string): Paise {
  return text.trim() ? evaluateAmount(text, currency) ?? 0 : 0;
}

// Turns what the user typed into split input, measuring exact amounts in paise.
export function splitInput({ type, included, values }: SplitState, currency: string) {
  return included.map((personId) => {
    const text = values[personId] ?? "";
    if (type === "equal") return { personId, value: 1 };
    if (type === "exact") return { personId, value: parsePaise(text, currency) };
    const value = Number(text);
    return { personId, value: Number.isFinite(value) && value > 0 ? value : 0 };
  });
}

export type SplitStatus = { splits: Split[] | null; left: string | null };

export function splitStatus(state: SplitState, amount: Paise | null, currency: string): SplitStatus {
  if (!amount || state.included.length === 0) return { splits: null, left: null };
  const input = splitInput(state, currency);
  let left: string | null = null;
  if (state.type === "exact") {
    const rest = amount - input.reduce((acc, { value }) => acc + value, 0);
    if (rest !== 0) left = rest > 0 ? `${formatMoney(rest, currency)} left to assign` : `${formatMoney(rest, currency)} too much`;
  }
  if (state.type === "percent") {
    const rest = Math.round((100 - input.reduce((acc, { value }) => acc + value, 0)) * 10000) / 10000;
    if (rest !== 0) left = rest > 0 ? `${rest}% left to assign` : `${-rest}% too much`;
  }
  if (state.type === "shares" && input.every(({ value }) => value === 0)) left = "Enter at least one share";
  if (left) return { splits: null, left };
  try {
    return { splits: computeSplits(amount, state.type, input), left: null };
  } catch {
    return { splits: null, left: "Check the numbers" };
  }
}

export function initialValue(type: SplitType, count: number, amount: Paise | null, currency: string, index: number): string {
  if (type === "shares") return "1";
  if (type === "percent") {
    const each = Math.floor(10000 / count);
    return String((index === 0 ? 10000 - each * (count - 1) : each) / 100);
  }
  if (type === "exact" && amount) {
    const each = Math.floor(amount / count);
    return toInputValue(index === 0 ? amount - each * (count - 1) : each, currency);
  }
  return "";
}

type Props = {
  state: SplitState; onChange: (state: SplitState) => void; amount: Paise | null; currency: string; people: Person[]; status: SplitStatus;
};

export function SplitEditor({ state, onChange, amount, currency, people, status }: Props) {
  const choose = (type: SplitType) => onChange({
    ...state,
    type,
    values: Object.fromEntries(state.included.map((id, index) => [id, initialValue(type, state.included.length, amount, currency, index)])),
  });

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Split type" className="grid grid-cols-4 gap-1 rounded-2xl bg-wash p-1">
        {(Object.keys(SPLIT_LABELS) as SplitType[]).map((type) => (
          <button key={type} type="button" aria-pressed={state.type === type} onClick={() => choose(type)} className={`min-h-11 rounded-xl text-[16px] font-bold ${state.type === type ? "bg-ink text-white" : "text-ink"}`}>
            {SPLIT_LABELS[type]}
          </button>
        ))}
      </div>
      <ul className="flex flex-col">
        {state.included.map((id) => {
          const owed = status.splits?.find(({ personId }) => personId === id)?.owed;
          return (
            <li key={id} className="flex min-h-14 items-center gap-3 py-1">
              <Avatar person={people.find((person) => person.id === id)} size={36} />
              <span className="min-w-0 flex-1 truncate font-semibold">{displayName(people, id)}</span>
              {state.type !== "equal" && (
                <input
                  aria-label={`${displayName(people, id)} ${SPLIT_LABELS[state.type]}`}
                  inputMode="decimal"
                  value={state.values[id] ?? ""}
                  placeholder="0"
                  onChange={(event) => onChange({ ...state, values: { ...state.values, [id]: event.target.value } })}
                  className={`${inputClass} !w-24 text-right`}
                />
              )}
              <span className="w-[5.5rem] text-right text-[16px] font-bold">{owed === undefined ? "" : formatMoney(owed, currency)}</span>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="min-h-6 text-center text-[16px] font-bold text-owe">{status.left}</p>
    </div>
  );
}
