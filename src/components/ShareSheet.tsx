import { FileDown, Link2, MessageCircle, Share2 } from "lucide-react";
import { useMemo } from "react";
import type { Expense, Group, Person, Settlement } from "../db";
import { downloadJson, groupBackup, MAX_LINK_LENGTH, packGroup, shareLink, shareText, textSummary } from "../share";
import { Button, Sheet, SheetHeader, useToast } from "./ui";

type Props = { open: boolean; onClose: () => void; group: Group; people: Person[]; expenses: Expense[]; settlements: Settlement[] };

export function ShareSheet({ open, onClose, group, people, expenses, settlements }: Props) {
  const toast = useToast();
  const summary = useMemo(() => (open ? textSummary(group, people, expenses, settlements) : ""), [open, group, people, expenses, settlements]);
  const link = useMemo(() => (open ? shareLink(packGroup(group, people, expenses, settlements)) : ""), [open, group, people, expenses, settlements]);
  const tooLong = link.length > MAX_LINK_LENGTH;

  const send = async (text: string, url?: string) => {
    try {
      const result = await shareText(text, url);
      if (result === "copied") toast.show("Copied");
      if (result !== "cancelled") onClose();
    } catch {
      onClose();
      toast.show("Sharing isn't available here");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share">
      <SheetHeader title="Share" onClose={onClose} />
      <div className="flex flex-col gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <pre className="rounded-2xl bg-wash p-4 font-sans text-[16px] leading-snug font-medium whitespace-pre-wrap">{summary}</pre>
        <Button tone="sun" className="flex items-center justify-center gap-2" onClick={() => void send(summary)}><Share2 size={21} /> Share summary</Button>
        <a className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-wash px-5 text-[17px] font-bold" href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer"><MessageCircle size={20} /> Send on WhatsApp</a>
        {tooLong ? (
          <>
            <p className="text-[15px] font-medium text-soft">This group is too big for a link, so share it as a file.</p>
            <Button tone="plain" className="flex items-center justify-center gap-2" onClick={() => downloadJson(`billber-${group.name.toLowerCase().replace(/\W+/g, "-")}.json`, groupBackup(group, people, expenses, settlements))}><FileDown size={21} /> Download file</Button>
          </>
        ) : (
          <>
            <Button tone="plain" className="flex items-center justify-center gap-2" onClick={() => void send(`${group.name} balances on Billber`, link)}><Link2 size={21} /> Share read-only link</Button>
            <p className="text-center text-[14px] text-soft">The link is a snapshot of today. Share it again after changes.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
