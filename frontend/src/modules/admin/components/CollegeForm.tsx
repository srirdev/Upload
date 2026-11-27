import { useState } from "react";
import { Check, Plus, Save } from "lucide-react";
import { adminSend, useAdminMutation } from "@/modules/admin/api";
import type { College, Slot } from "@/modules/admin/api/types";
import { Field } from "@/modules/admin/components/common";
import { Button } from "@/shared/components/ui/button";
import { Modal } from "@/shared/components/ui/dialog";
import { Switch, Textarea } from "@/shared/components/ui/fields";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/states";
import { toast, toastError } from "@/shared/components/ui/toast";
import { cn } from "@/shared/utils/cn";

const blank = (c?: College) => ({
  name: c?.name ?? "", city: c?.city ?? "", security_cabin: c?.security_cabin ?? "",
  drop_instructions: c?.drop_instructions ?? "", collection_instructions: c?.collection_instructions ?? "",
  latitude: c?.latitude ?? "", longitude: c?.longitude ?? "", active: c?.active ?? true,
});

/** Create or edit a college (name, cabin, instructions, coordinates). */
export function CollegeForm({ college, onClose }: { college?: College; onClose: () => void }) {
  const [f, setF] = useState(blank(college));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useAdminMutation(
    () => {
      const body = {
        ...f, city: f.city || null, drop_instructions: f.drop_instructions || null,
        collection_instructions: f.collection_instructions || null,
        latitude: f.latitude === "" ? null : f.latitude, longitude: f.longitude === "" ? null : f.longitude,
      };
      return college ? adminSend("PUT", `/colleges/${college.id}`, body) : adminSend("POST", "/colleges", body);
    },
    () => {
      toast.success(college ? "College updated" : "College added");
      onClose();
    },
  );
  const valid = f.name.trim().length >= 2 && f.security_cabin.trim().length >= 2;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={college ? "Edit college" : "Add college"}
      description="Students pick their college at sign-up; riders and shops deliver to its security cabin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate(undefined, { onError: toastError })}>
            {save.isPending ? <Spinner className="text-white" /> : <><Save className="size-4" /> Save college</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="College name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
        </div>
        <Field label="Security cabin"><Input value={f.security_cabin} placeholder="Main gate security cabin" onChange={(e) => set("security_cabin", e.target.value)} /></Field>
        <Field label="Drop instructions (for riders and shops)"><Textarea value={f.drop_instructions} onChange={(e) => set("drop_instructions", e.target.value)} /></Field>
        <Field label="Collection instructions (shown to students)"><Textarea value={f.collection_instructions} onChange={(e) => set("collection_instructions", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"><Input inputMode="decimal" value={f.latitude} onChange={(e) => set("latitude", e.target.value)} /></Field>
          <Field label="Longitude"><Input inputMode="decimal" value={f.longitude} onChange={(e) => set("longitude", e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-navy">Active (students can order)</span>
          <Switch label="College active" checked={f.active} onChange={(v) => set("active", v)} tone="mint" />
        </div>
        {save.error && <p role="alert" className="text-sm font-medium text-danger">{save.error.message}</p>}
      </div>
    </Modal>
  );
}

const slotDraft = (s?: Slot) => ({
  label: s?.label ?? "", delivery_time: s?.delivery_time ?? "10:00", cutoff_minutes: String(s?.cutoff_minutes ?? 120),
  capacity: String(s?.capacity ?? 50), active: s?.active ?? true,
});

/** One slot row: edit in place (slots are deactivated, never deleted). `slot` undefined = add row. */
export function SlotRow({ collegeId, slot }: { collegeId: string; slot?: Slot }) {
  const [d, setD] = useState(slotDraft(slot));
  const save = useAdminMutation(
    () => {
      const body = { label: d.label, delivery_time: d.delivery_time, cutoff_minutes: Number(d.cutoff_minutes), capacity: Number(d.capacity), active: d.active };
      return slot ? adminSend("PUT", `/slots/${slot.id}`, body) : adminSend("POST", `/colleges/${collegeId}/slots`, body);
    },
    () => {
      toast.success(slot ? "Slot saved" : "Slot added");
      if (!slot) setD(slotDraft());
    },
  );
  const dirty = !slot || JSON.stringify(d) !== JSON.stringify(slotDraft(slot));
  return (
    <div
      className={cn(
        "grid grid-cols-2 items-center gap-2 rounded-2xl p-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto]",
        slot ? (d.active ? "bg-background ring-1 ring-border" : "bg-surface/70 ring-1 ring-border") : "border-2 border-dashed border-primary/25",
      )}
    >
      <Input aria-label="Slot label" className="h-11" placeholder={slot ? "Label" : "New slot label"} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      <Input aria-label="Delivery time" className="h-11" type="time" value={d.delivery_time} onChange={(e) => setD({ ...d, delivery_time: e.target.value })} />
      <Input aria-label="Cut-off minutes before delivery" className="h-11" type="number" min={0} value={d.cutoff_minutes} onChange={(e) => setD({ ...d, cutoff_minutes: e.target.value })} />
      <Input aria-label="Capacity" className="h-11" type="number" min={1} value={d.capacity} onChange={(e) => setD({ ...d, capacity: e.target.value })} />
      <div className="flex items-center gap-2 px-1">
        <Switch label={`Slot ${d.label || "new"} active`} checked={d.active} onChange={(v) => setD({ ...d, active: v })} tone="mint" />
      </div>
      <Button size="sm" variant={slot ? "soft" : "default"} disabled={!dirty || !d.label.trim() || save.isPending} onClick={() => save.mutate(undefined, { onError: toastError })}>
        {save.isPending ? <Spinner /> : slot ? <><Check className="size-4" /> Save</> : <><Plus className="size-4" /> Add slot</>}
      </Button>
    </div>
  );
}
