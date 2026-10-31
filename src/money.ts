// All money maths for Billber. Pure functions only, with no UI or storage, so it can move to a server unchanged.
// Amounts are always integer paise. Fractions are handled with BigInt, so a float can never round a balance.

export type ID = string;
export type Paise = number;
export type SplitType = "equal" | "exact" | "percent" | "shares";
export type SplitInput = { personId: ID; value: number };
export type Split = { personId: ID; owed: Paise };
export type Payer = { personId: ID; paid: Paise };
export type Transfer = { from: ID; to: ID; amount: Paise };

export class MoneyError extends Error {}

const VALUE_SCALE = 10_000n; // percentages and shares keep four decimal places

function scaled(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new MoneyError("Values must be zero or more");
  return BigInt(Math.round(value * Number(VALUE_SCALE)));
}

// Largest-remainder method: round everyone down, then hand the leftover paise to the largest remainders.
// Ties break on person id, so the answer never depends on the order people were listed in.
function allocate(total: Paise, weights: { personId: ID; weight: bigint }[]): Split[] {
  const sum = weights.reduce((acc, { weight }) => acc + weight, 0n);
  if (sum <= 0n) throw new MoneyError("Enter a share for at least one person");
  const bigTotal = BigInt(total);
  const rows = weights.map(({ personId, weight }) => ({
    personId,
    floor: (bigTotal * weight) / sum,
    remainder: (bigTotal * weight) % sum,
  }));
  const leftover = Number(bigTotal - rows.reduce((acc, row) => acc + row.floor, 0n));
  const winners = [...rows]
    .filter(({ remainder }) => remainder > 0n)
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return a.personId < b.personId ? -1 : 1;
    })
    .slice(0, leftover)
    .map(({ personId }) => personId);
  return rows.map(({ personId, floor }) => ({ personId, owed: Number(floor) + (winners.includes(personId) ? 1 : 0) }));
}

export function computeSplits(amount: Paise, type: SplitType, input: SplitInput[]): Split[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new MoneyError("Enter an amount");
  if (input.length === 0) throw new MoneyError("Choose at least one person");
  if (new Set(input.map(({ personId }) => personId)).size !== input.length) throw new MoneyError("Each person can appear once");

  if (type === "equal") return allocate(amount, input.map(({ personId }) => ({ personId, weight: 1n })));

  if (type === "exact") {
    for (const { value } of input) {
      if (!Number.isSafeInteger(value) || value < 0) throw new MoneyError("Exact amounts must be whole paise");
    }
    const sum = input.reduce((acc, { value }) => acc + value, 0);
    if (sum !== amount) throw new MoneyError("Exact amounts must add up to the total");
    return input.map(({ personId, value }) => ({ personId, owed: value }));
  }

  const weights = input.map(({ personId, value }) => ({ personId, weight: scaled(value) }));
  if (type === "percent" && weights.reduce((acc, { weight }) => acc + weight, 0n) !== 100n * VALUE_SCALE) {
    throw new MoneyError("Percentages must add up to 100");
  }
  return allocate(amount, weights);
}

export function assertPayers(amount: Paise, payers: Payer[]) {
  if (payers.length === 0) throw new MoneyError("Choose who paid");
  if (new Set(payers.map(({ personId }) => personId)).size !== payers.length) throw new MoneyError("Each payer can appear once");
  const sum = payers.reduce((acc, { paid }) => {
    if (!Number.isSafeInteger(paid) || paid < 0) throw new MoneyError("Paid amounts must be whole paise");
    return acc + paid;
  }, 0);
  if (sum !== amount) throw new MoneyError("Paid amounts must add up to the total");
}

type NetExpense = { payers: Payer[]; splits: Split[]; deletedAt?: number };
type NetSettlement = { fromId: ID; toId: ID; amount: Paise; deletedAt?: number };

// net = paid - owed + settled sent - settled received. Positive means the group owes them.
export function netBalances(expenses: NetExpense[], settlements: NetSettlement[], memberIds: ID[] = []): Map<ID, Paise> {
  const nets = new Map<ID, Paise>(memberIds.map((id) => [id, 0]));
  const add = (id: ID, amount: Paise) => nets.set(id, (nets.get(id) ?? 0) + amount);
  for (const { payers, splits, deletedAt } of expenses) {
    if (deletedAt) continue;
    for (const { personId, paid } of payers) add(personId, paid);
    for (const { personId, owed } of splits) add(personId, -owed);
  }
  for (const { fromId, toId, amount, deletedAt } of settlements) {
    if (deletedAt) continue;
    add(fromId, amount);
    add(toId, -amount);
  }
  const total = [...nets.values()].reduce((acc, value) => acc + value, 0);
  if (total !== 0) throw new Error(`Group balances must add up to zero, got ${total}`);
  return nets;
}

// Matches the biggest debtor with the biggest creditor, which needs at most n - 1 payments.
export function simplify(nets: Map<ID, Paise>): Transfer[] {
  const pick = (sign: 1 | -1) => [...nets].filter(([, value]) => value * sign > 0).map(([id, value]) => ({ id, value: value * sign }));
  const biggestFirst = (a: { id: ID; value: Paise }, b: { id: ID; value: Paise }) => b.value - a.value || (a.id < b.id ? -1 : 1);
  const creditors = pick(1);
  const debtors = pick(-1);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(biggestFirst);
    debtors.sort(biggestFirst);
    const creditor = creditors[0];
    const debtor = debtors[0];
    const amount = Math.min(creditor.value, debtor.value);
    out.push({ from: debtor.id, to: creditor.id, amount });
    creditor.value -= amount;
    debtor.value -= amount;
    if (!creditor.value) creditors.shift();
    if (!debtor.value) debtors.shift();
  }
  return out;
}

export function currencyDecimals(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(amount: Paise, currency = "INR"): string {
  const decimals = currencyDecimals(currency);
  const value = Math.abs(amount) / 10 ** decimals;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// Keypad input such as "450+120" or "1200/3", evaluated with exact fractions.
export function evaluateAmount(input: string, currency = "INR"): Paise | null {
  type Fraction = { n: bigint; d: bigint };
  const tokens = input.replace(/[,\s₹]/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").match(/\d*\.\d+|\d+\.?|[+\-*/]|./g);
  if (!tokens) return null;
  let index = 0;

  const number = (): Fraction | null => {
    const token = tokens[index];
    if (!token || !/^(\d+\.?\d*|\.\d+)$/.test(token)) return null;
    index += 1;
    const [whole, fraction = ""] = token.split(".");
    return { n: BigInt(`${whole}${fraction}`), d: 10n ** BigInt(fraction.length) };
  };
  const product = (): Fraction | null => {
    let value = number();
    while (value && (tokens[index] === "*" || tokens[index] === "/")) {
      const divide = tokens[index] === "/";
      index += 1;
      const next = number();
      if (!next || (divide && next.n === 0n)) return null;
      value = divide ? { n: value.n * next.d, d: value.d * next.n } : { n: value.n * next.n, d: value.d * next.d };
    }
    return value;
  };

  let result = product();
  while (result && (tokens[index] === "+" || tokens[index] === "-")) {
    const sign = tokens[index] === "+" ? 1n : -1n;
    index += 1;
    const next = product();
    if (!next) return null;
    result = { n: result.n * next.d + sign * next.n * result.d, d: result.d * next.d };
  }
  if (!result || index !== tokens.length || result.n <= 0n) return null;
  const paise = Number((2n * result.n * 10n ** BigInt(currencyDecimals(currency)) + result.d) / (2n * result.d));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

// The display string for a money input, such as 45050 -> "450.50".
export function toInputValue(amount: Paise, currency = "INR"): string {
  const decimals = currencyDecimals(currency);
  const value = amount / 10 ** decimals;
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}
