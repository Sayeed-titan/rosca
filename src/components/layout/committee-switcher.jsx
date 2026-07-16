"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setCurrentCommitteeAction } from "@/features/committees/switcher/actions";

/**
 * The one place every page's committee data comes from.
 *
 * Switching here changes what Dashboard, Payments and Draws show everywhere —
 * the point is that only ONE committee's numbers are ever on screen at a time,
 * so nothing gets mixed up between, say, two different committees' pots.
 */
export function CommitteeSwitcher({ committees, selectedId }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (committees.length === 0) {
    return (
      <Link
        href="/committees"
        className="glass text-muted-foreground hover:text-foreground mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Create your first committee
      </Link>
    );
  }

  function handleChange(id) {
    startTransition(async () => {
      const r = await setCurrentCommitteeAction(id);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-muted-foreground px-1 text-[10px] font-medium uppercase tracking-wide">
        Committee
      </p>
      <Select value={selectedId ?? undefined} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-full" aria-label="Selected committee">
          <SelectValue placeholder="Choose a committee" />
        </SelectTrigger>
        <SelectContent>
          {committees.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
