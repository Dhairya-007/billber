import { useLiveQuery } from "dexie-react-hooks";
import { Download, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar, BackLink, Button, Field, inputClass, Sheet, SheetHeader, useToast } from "../components/ui";
import { CURRENCIES } from "../currencies";
import type { Person } from "../db";
import * as repo from "../repo";
import type { Backup } from "../schema";
import { downloadJson, parseBackup } from "../share";

type InstallPrompt = Event & { prompt: () => Promise<void> };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="px-5 pt-6"><h2 className="display mb-3 text-[24px]">{title}</h2>{children}</section>;
}

export function Settings({ me }: { me: Person }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const people = useLiveQuery(() => repo.listPeople(), []) ?? [];
  const groups = useLiveQuery(() => repo.listGroups(), []) ?? [];
  const [name, setName] = useState(me.name);
  const [currency, setCurrency] = useState(repo.defaultCurrency());
  const [incoming, setIncoming] = useState<Backup>();
  const [clearing, setClearing] = useState(false);
  const [install, setInstall] = useState<InstallPrompt>();

  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const backup = async () => {
    downloadJson(`billber-backup-${repo.today()}.json`, await repo.exportAll());
    repo.markBackedUp();
    toast.show("Backup downloaded");
  };

  const pick = async (chosen?: File) => {
    if (!chosen) return;
    try {
      setIncoming(parseBackup(await chosen.text()));
    } catch {
      toast.show("That isn't a valid Billber backup");
    }
    if (file.current) file.current.value = "";
  };

  const restore = async (mode: "merge" | "replace") => {
    if (!incoming) return;
    await repo.importAll(incoming, mode);
    setIncoming(undefined);
    toast.show("Backup imported");
  };

  const removePerson = async (id: string) => {
    try {
      await repo.deletePerson(id);
    } catch (problem) {
      toast.show(problem instanceof Error ? problem.message : "Couldn't remove them");
    }
  };

  const archived = groups.filter((group) => group.archived);

  return (
    <main className="min-h-dvh pb-12">
      <header className="torn bg-sun px-5 pt-[max(10px,env(safe-area-inset-top))]">
        <BackLink to="/" label="Back to home" />
        <h1 className="display mt-1 text-[38px]">Settings</h1>
      </header>

      <Section title="You">
        <div className="flex flex-col gap-3">
          <Field label="Your name"><input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim()) void repo.updatePerson(me.id, { name: name.trim() }); }} className={inputClass} /></Field>
          <Field label="Currency for new groups">
            <select value={currency} onChange={(event) => { setCurrency(event.target.value); repo.setDefaultCurrency(event.target.value); }} className={inputClass}>
              {CURRENCIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="People">
        <ul>
          {people.filter(({ isMe }) => !isMe).map((person) => (
            <li key={person.id} className="flex min-h-14 items-center gap-3">
              <Avatar person={person} size={40} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{person.name}</span>
              <input aria-label={`Emoji for ${person.name}`} defaultValue={person.emoji ?? ""} placeholder="Emoji" maxLength={8} onBlur={(event) => void repo.updatePerson(person.id, { emoji: event.target.value.trim() || undefined })} className={`${inputClass} !w-20 text-center`} />
              <button type="button" aria-label={`Delete ${person.name}`} onClick={() => void removePerson(person.id)} className="grid size-11 place-items-center text-owe"><Trash2 size={21} /></button>
            </li>
          ))}
          {people.length <= 1 && <li className="text-soft">People you add to groups appear here.</li>}
        </ul>
      </Section>

      {archived.length > 0 && (
        <Section title="Archived groups">
          <ul>{archived.map(({ id, name: groupName, emoji }) => <li key={id}><Link to={`/g/${id}`} className="flex min-h-12 items-center text-[17px] font-semibold underline underline-offset-4">{emoji} {groupName}</Link></li>)}</ul>
        </Section>
      )}

      <Section title="Your data">
        <p className="mb-3 text-[16px] text-soft">Everything is stored on this phone only. A backup file also moves your data to a new phone.</p>
        <div className="flex flex-col gap-2">
          {install && <Button tone="sun" onClick={() => { void install.prompt(); setInstall(undefined); }}>Install Billber</Button>}
          <Button tone="sun" className="flex items-center justify-center gap-2" onClick={() => void backup()}><Download size={21} /> Export backup</Button>
          <Button tone="plain" className="flex items-center justify-center gap-2" onClick={() => file.current?.click()}><Upload size={21} /> Import backup</Button>
          <input ref={file} type="file" aria-label="Backup file" accept="application/json,.json" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
          <Button tone="danger" onClick={() => setClearing(true)}>Clear all data</Button>
        </div>
      </Section>

      <Sheet open={Boolean(incoming)} onClose={() => setIncoming(undefined)} title="Import backup">
        <SheetHeader title="Import backup" onClose={() => setIncoming(undefined)} />
        <div className="flex flex-col gap-2 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <p className="pb-2 text-[17px]">{incoming?.groups.length} groups and {incoming?.expenses.length} expenses found.</p>
          <Button onClick={() => void restore("merge")}>Add to what's here</Button>
          <Button tone="danger" onClick={() => void restore("replace")}>Replace everything</Button>
        </div>
      </Sheet>

      <Sheet open={clearing} onClose={() => setClearing(false)} title="Clear all data">
        <SheetHeader title="Clear all data?" onClose={() => setClearing(false)} />
        <div className="flex flex-col gap-2 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <p className="pb-2 text-[17px]">This deletes every group and expense on this phone, and it can't be undone.</p>
          <Button tone="danger" onClick={() => void repo.clearAll()}>Delete everything</Button>
          <Button tone="plain" onClick={() => setClearing(false)}>Keep my data</Button>
        </div>
      </Sheet>
    </main>
  );
}
