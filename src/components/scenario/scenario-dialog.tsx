"use client";

import { useEffect, useState } from "react";
import type { BillDTO, IncomeDTO, ScenarioInput } from "@/contracts/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// native select used inline

const KINDS = [
  { value: "ADD_BILL", label: "Add a bill" },
  { value: "ADD_INCOME", label: "Add income" },
  { value: "REMOVE_BILL", label: "Remove a bill" },
  { value: "REMOVE_INCOME", label: "Remove income" },
] as const;

export function ScenarioDialog({
  open,
  onClose,
  onApply,
  bills,
  incomes,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (scenario: ScenarioInput) => void;
  bills: BillDTO[];
  incomes: IncomeDTO[];
}) {
  const [kind, setKind] = useState<string>("ADD_BILL");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    if (open) {
      setKind("ADD_BILL");
      setName("");
      setAmount("");
      setDate("");
      setTargetId(bills[0]?.id ?? incomes[0]?.id ?? "");
    }
  }, [open, bills, incomes]);

  const isRemove = kind === "REMOVE_BILL" || kind === "REMOVE_INCOME";
  const list = kind === "REMOVE_BILL" ? bills : incomes;

  const apply = () => {
    const scenario: ScenarioInput =
      isRemove
        ? { kind: kind as ScenarioInput["kind"], id: targetId }
        : {
            kind: kind as ScenarioInput["kind"],
            name: name || (kind === "ADD_BILL" ? "Scenario bill" : "Scenario income"),
            amountCents: Math.round(Number(amount) * 100),
            date,
          };
    onApply(scenario);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="What-if scenario" description="Preview a hypothetical change. Nothing is saved." testId="scenario-dialog">
      <div className="space-y-4">
        <div>
          <Label htmlFor="scenario-kind">Type</Label>
          <select id="scenario-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        {isRemove ? (
          <div>
            <Label htmlFor="scenario-target">Item</Label>
            <select id="scenario-target" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
              {list.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="scenario-name">Name</Label>
              <Input id="scenario-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New purchase" />
            </div>
            <div>
              <Label htmlFor="scenario-amount">Amount</Label>
              <Input id="scenario-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="scenario-date">Date</Label>
              <Input id="scenario-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={apply} data-testid="scenario-apply">Apply</Button>
      </div>
    </Dialog>
  );
}