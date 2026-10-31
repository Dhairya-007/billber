import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Group, Person } from "../db";
import type { ID } from "../money";
import * as repo from "../repo";
import { displayName } from "../share";
import { Avatar, Button, Field, inputClass, Sheet, SheetHeader } from "./ui";

const EMOJIS = ["🏖️", "🏠", "🍕", "✈️", "🚗", "🎉", "🏔️", "💼"];

function AddPersonRow({ onAdded }: { onAdded: (person: Person) => void }) {
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    onAdded(await repo.addPerson(name));
    setName("");
  };
  return (
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
      <input aria-label="New person's name" value={name} placeholder="Add a person by name" onChange={(event) => setName(event.target.value)} className={inputClass} />
      <Button type="submit" tone="sun" aria-label="Add person" className="shrink-0 !px-3.5"><Plus size={24} strokeWidth={3} /></Button>
    </form>
  );
}

export function NewGroupSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (group: Group) => void }) {
  const people = useLiveQuery(() => repo.listPeople(), []) ?? [];
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [chosen, setChosen] = useState<ID[]>([]);
  const others = people.filter(({ isMe }) => !isMe);

  const toggle = (id: ID) => setChosen((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  const create = async () => {
    const group = await repo.createGroup({ name, emoji, memberIds: chosen });
    setName("");
    setChosen([]);
    onCreated(group);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <SheetHeader title="New group" onClose={onClose} />
      <div className="flex flex-col gap-4 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Field label="Group name"><input autoFocus value={name} placeholder="Goa trip" onChange={(event) => setName(event.target.value)} className={inputClass} /></Field>
        <div role="group" aria-label="Group emoji" className="flex justify-between gap-1">
          {EMOJIS.map((value) => (
            <button key={value} type="button" aria-label={`Emoji ${value}`} aria-pressed={emoji === value} onClick={() => setEmoji(value)} className={`grid size-11 place-items-center rounded-xl text-[22px] ${emoji === value ? "bg-sun" : "bg-wash"}`}>{value}</button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-soft">Who's in?</p>
          {others.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {others.map((person) => (
                <button key={person.id} type="button" aria-pressed={chosen.includes(person.id)} onClick={() => toggle(person.id)} className={`flex min-h-11 items-center gap-2 rounded-full py-1 pr-3.5 pl-1.5 font-semibold ${chosen.includes(person.id) ? "bg-ink text-white" : "bg-wash"}`}>
                  <Avatar person={person} size={30} /> {person.name} {chosen.includes(person.id) && <Check size={16} strokeWidth={3.5} />}
                </button>
              ))}
            </div>
          )}
          <AddPersonRow onAdded={(person) => setChosen((ids) => [...new Set([...ids, person.id])])} />
        </div>
        <Button disabled={!name.trim()} onClick={() => void create()}>Create group</Button>
      </div>
    </Sheet>
  );
}

export function MembersSheet({ open, onClose, group, people }: { open: boolean; onClose: () => void; group: Group; people: Person[] }) {
  const [message, setMessage] = useState("");
  const others = people.filter(({ id }) => !group.memberIds.includes(id));

  const remove = async (id: ID) => {
    // Shown inside the sheet, because a toast would sit behind the open dialog.
    setMessage("");
    try {
      await repo.removeMember(group.id, id);
    } catch (problem) {
      setMessage(problem instanceof Error ? problem.message : "Couldn't remove them");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="People in this group">
      <SheetHeader title="People" onClose={onClose} />
      <div className="flex flex-col gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <ul>
          {group.memberIds.map((id) => (
            <li key={id} className="flex min-h-14 items-center gap-3">
              <Avatar person={people.find((person) => person.id === id)} size={40} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{displayName(people, id)}</span>
              {!people.find((person) => person.id === id)?.isMe && !group.archived && (
                <button type="button" aria-label={`Remove ${displayName(people, id)}`} onClick={() => void remove(id)} className="grid size-11 place-items-center rounded-full text-owe"><Trash2 size={21} /></button>
              )}
            </li>
          ))}
        </ul>
        {message && <p role="alert" className="text-[16px] font-bold text-owe">{message}</p>}
        {!group.archived && (
          <>
            {others.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {others.map((person) => (
                  <button key={person.id} type="button" onClick={() => void repo.addMember(group.id, person.id)} className="flex min-h-11 items-center gap-2 rounded-full bg-wash py-1 pr-3.5 pl-1.5 font-semibold">
                    <Avatar person={person} size={30} /> {person.name} <Plus size={16} strokeWidth={3} />
                  </button>
                ))}
              </div>
            )}
            <AddPersonRow onAdded={(person) => void repo.addMember(group.id, person.id)} />
          </>
        )}
        <Button tone="plain" onClick={() => { void repo.updateGroup(group.id, { archived: !group.archived }); onClose(); }}>{group.archived ? "Unarchive group" : "Archive group"}</Button>
      </div>
    </Sheet>
  );
}
