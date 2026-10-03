"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { decideApproval } from "@/actions/server";
import type { Approval } from "@/actions/schemas";
import { ApprovalCard } from "@/components/cards";
import { cn } from "@/lib/utils";
import { Section } from "./section";

export function TodayApprovals({ approvals }: { approvals: Approval[] }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);
  // Decided items leave the list at once; the refresh then brings the server's view.
  const [decided, setDecided] = useState<Set<string>>(new Set());

  const open = approvals.filter((a) => !decided.has(a.id));
  if (open.length === 0) return null;

  async function decide(approval: Approval, decision: "approve" | "reject", note?: string) {
    setSaving(approval.id);
    const result = await decideApproval({ approvalId: approval.id, decision, note });
    setSaving(null);
    if (!result.ok) {
      toast.error(result.error.message);
      // Already decided elsewhere: drop it from the list anyway.
      if (result.error.code !== "conflict") return;
    } else {
      toast.success(`${decision === "approve" ? "Approved" : "Rejected"}: ${approval.summary}`);
    }
    setDecided((prev) => new Set(prev).add(approval.id));
    startTransition(() => router.refresh());
  }

  return (
    <Section title="Needs your approval" href="/archive" linkLabel="See the history">
      <div
        className={cn("grid gap-3 transition-opacity md:grid-cols-2", refreshing && "opacity-70")}
      >
        {open.map((a) => (
          <ApprovalCard
            key={a.id}
            approval={a}
            busy={saving === a.id}
            onApprove={() => decide(a, "approve")}
            onReject={(note) => decide(a, "reject", note)}
          />
        ))}
      </div>
    </Section>
  );
}
