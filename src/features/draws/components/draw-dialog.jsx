"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Trophy,
  Dices,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DrawWheel } from "./draw-wheel";
import { celebrate, playCelebrationSound } from "./celebrate";
import { previewDrawAction, runDrawAction } from "../actions";

/**
 * The draw flow: preview -> spin -> winner.
 *
 * The order matters and is deliberate. We ask the server for the result FIRST, then
 * animate the wheel onto it. The alternative — spin, then ask — would mean the
 * animation and the truth could disagree, and the wheel would be theatre laid over
 * a result the user already half-saw.
 */
export function DrawDialog({ committee, open, onOpenChange, canOverride }) {
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [phase, setPhase] = useState("preview"); // preview | spinning | winner
  const [result, setResult] = useState(null);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // Load the preview whenever the dialog opens.
  useEffect(() => {
    if (!open || !committee) return;

    setPreview(null);
    setPreviewError(null);
    setResult(null);
    setPhase("preview");
    setOverride(false);
    setReason("");

    previewDrawAction(committee.id).then((r) => {
      if (r.ok) setPreview(r.data);
      else setPreviewError(r.error.message);
    });
  }, [open, committee]);

  function handleDraw() {
    startTransition(async () => {
      const r = await runDrawAction({
        committeeId: committee.id,
        override,
        overrideReason: reason,
        mode: "MANUAL",
      });

      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }

      // The winner is already decided and stored. The wheel now animates onto it.
      setResult(r.data);
      setPhase("spinning");
    });
  }

  function handleSpinComplete() {
    setPhase("winner");
    celebrate();
    playCelebrationSound();
  }

  const winnerIndex =
    result && preview
      ? preview.candidates.findIndex((c) => c.id === result.winnerId)
      : null;

  return (
    <Dialog
      open={open}
      // Don't let the dialog be dismissed mid-spin: the draw has already happened
      // server-side, and closing here would hide a result that's now permanent.
      onOpenChange={phase === "spinning" ? undefined : onOpenChange}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dices className="size-4" aria-hidden="true" />
            {phase === "winner" ? "We have a winner" : "Run the draw"}
          </DialogTitle>
          <DialogDescription>
            {committee?.name}
            {preview ? ` · Cycle ${preview.cycleNumber}` : ""}
          </DialogDescription>
        </DialogHeader>

        {previewError && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{previewError}</span>
          </div>
        )}

        {!preview && !previewError && (
          <div className="space-y-3 py-6">
            <Skeleton className="mx-auto size-56 rounded-full" />
            <Skeleton className="mx-auto h-4 w-40" />
          </div>
        )}

        {preview && (
          <div className="space-y-5">
            {phase !== "winner" && (
              <div className="text-center">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Pot this cycle
                </p>
                <p className="brand-text-gradient tabular text-3xl font-semibold">
                  {preview.payoutDisplay}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {preview.candidates.length} member
                  {preview.candidates.length === 1 ? "" : "s"} still eligible
                </p>
              </div>
            )}

            <DrawWheel
              candidates={preview.candidates}
              winnerIndex={winnerIndex}
              spinning={phase === "spinning"}
              onSpinComplete={handleSpinComplete}
              size={280}
            />

            <AnimatePresence>
              {phase === "winner" && result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="glass rounded-xl p-5 text-center"
                >
                  <Trophy className="text-warning mx-auto size-7" aria-hidden="true" />
                  <p className="mt-2 text-xl font-semibold">{result.winnerName}</p>
                  <p className="text-muted-foreground text-sm">
                    receives{" "}
                    <span className="tabular text-foreground font-medium">
                      {result.payoutDisplay}
                    </span>
                  </p>

                  {result.isOverride && (
                    <Badge variant="destructive" className="mt-3">
                      Drawn with override
                    </Badge>
                  )}

                  {/* The proof, shown to the user rather than merely claimed. */}
                  <div className="border-border/60 mt-4 border-t pt-3 text-left">
                    <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      Verifiable — the seed was committed before the draw
                    </p>
                    <dl className="space-y-1 font-mono text-[10px] break-all">
                      <div>
                        <dt className="text-muted-foreground inline">commit: </dt>
                        <dd className="inline">{result.seedCommitment?.slice(0, 32)}…</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground inline">seed: </dt>
                        <dd className="inline">{result.serverSeed?.slice(0, 32)}…</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground inline">index: </dt>
                        <dd className="inline">
                          {result.winnerIndex} of {result.eligibleSnapshot?.length}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The gate */}
            {phase === "preview" && !preview.collectionComplete && (
              <div className="border-warning/40 bg-warning/10 space-y-3 rounded-lg border p-3">
                <p className="flex items-start gap-2 text-sm">
                  <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">Not fully collected.</span>{" "}
                    {preview.shortfalls.map((s) => s.memberName).join(", ")} still owe
                    for this cycle. Drawing now hands someone the pot while others are
                    still paying into it.
                  </span>
                </p>

                {canOverride ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                        className="size-4 rounded"
                      />
                      Draw anyway (recorded as an override)
                    </label>

                    {override && (
                      <div className="space-y-1.5">
                        <Label htmlFor="override-reason" className="text-xs">
                          Reason (required, permanently audited)
                        </Label>
                        <Textarea
                          id="override-reason"
                          rows={2}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="e.g. both members paid in cash at the meeting; receipts to follow"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Only an organization owner can override this.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "preview" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDraw}
                disabled={
                  isPending ||
                  !preview ||
                  (!preview.collectionComplete && (!override || reason.trim().length < 5))
                }
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                <Dices className="size-4" />
                Draw winner
              </Button>
            </>
          )}

          {phase === "spinning" && (
            <p className="text-muted-foreground w-full text-center text-sm">
              Drawing…
            </p>
          )}

          {phase === "winner" && (
            <>
              <Button variant="outline" onClick={() => setPhase("spinning")}>
                <RotateCcw className="size-4" />
                Replay
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
