import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, inputClass } from "../components/ui";
import { CURRENCIES } from "../currencies";
import { setup } from "../repo";

export function Setup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");

  return (
    <main className="flex min-h-dvh flex-col bg-sun">
      <div className="torn bg-ink px-6 pt-[max(48px,env(safe-area-inset-top))] text-sun">
        <h1 className="display text-[64px]">Billber</h1>
        <p className="mt-4 max-w-[17em] text-[22px] leading-tight font-semibold text-white">Who owes what, sorted in three taps.</p>
      </div>
      <form className="flex flex-1 flex-col gap-4 px-6 pt-8 pb-[max(24px,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void setup(name, currency).then(() => navigate("/")); }}>
        <Field label="Your name"><input autoFocus value={name} autoComplete="given-name" onChange={(event) => setName(event.target.value)} className={`${inputClass} !border-ink`} /></Field>
        <Field label="Currency">
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={`${inputClass} !border-ink`}>
            {CURRENCIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <p className="text-[15px] font-medium">No account, and nothing leaves this phone unless you share it.</p>
        <div className="flex-1" />
        <Button type="submit" disabled={!name.trim()}>Start</Button>
      </form>
    </main>
  );
}
