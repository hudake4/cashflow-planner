"use client";

import { useEffect, useState } from "react";
import type { BillDTO, IncomeDTO, ScenarioInput } from "@/contracts/api";
import { parseMoneyToCents } from "@/domain/money";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";

const KINDS = [
  { value: "ADD_BILL", label: "Add a bill" },
  { value: "ADD_INCOME", label: "Add income" },
  { value: "REMOVE_BILL", label: "Remove a bill" },
  { value: "REMOVE_INCOME", label: "Remove income" },
] as const;

type ScenarioKind = ScenarioInput["kind"];

const firstId = (items: { id: string }[]) => items[0]?.id ?? "";

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
  const [kind, setKind] = useState<ScenarioKind>("ADD_BILL");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [targetId, setTargetId] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  useEffect(() => {
    if (open) {
      setKind("ADD_BILL");
      setName("");
      setAmount("");
      setDate("");
      setErrors({});
      setTargetId(firstId(bills));
    }
  }, [open, bills, incomes]);

  const isRemove = kind === "REMOVE_BILL" || kind === "REMOVE_INCOME";
  const list = kind === "REMOVE_BILL" ? bills : incomes;

  const changeKind = (next: ScenarioKind) => {
    setKind(next);
    setErrors({});
    if (next === "REMOVE_BILL") setTargetId(firstId(bills));
    else if (next === "REMOVE_INCOME") setTargetId(firstId(incomes));
  };

  const apply = () => {
    if (isRemove) {
      onApply({ kind, id: targetId });
      onClose();
      return;
    }

    const cents = parseMoneyToCents(amount);
    const nextErrors: { amount?: string; date?: string } = {};
    if (amount.trim() === "") nextErrors.amount = "Amount is required";
    else if (cents === null) nextErrors.amount = "Enter an amount like 1250 or 1,250.00 (up to 2 decimals)";
    else if (cents <= 0) nextErrors.amount = "Amount must be greater than zero";
    if (date === "") nextErrors.date = "Date is required";
    if (nextErrors.amount || nextErrors.date) {
      setErrors(nextErrors);
      return;
    }

    onApply({
      kind,
      name: name.trim() || (kind === "ADD_BILL" ? "Scenario bill" : "Scenario income"),
      // Validation above guarantees a positive whole-cent value; the fallback is unreachable.
      amountCents: cents ?? 0,
      date,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="What-if scenario" description="Preview a hypothetical change. Nothing is saved." testId="scenario-dialog">
      <div className="space-y-4">
        <Field label="Type" testId="scenario-kind">
          <Select value={kind} onChange={(e) => changeKind(e.target.value as ScenarioKind)} data-testid="scenario-kind">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        {isRemove ? (
          <Field label="Item" testId="scenario-target">
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} data-testid="scenario-target">
              {list.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Name" testId="scenario-name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New purchase" maxLength={80} data-testid="scenario-name" />
            </Field>
            <Field label="Amount" error={errors.amount} testId="scenario-amount">
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="scenario-amount" />
            </Field>
            <Field label="Date" error={errors.date} testId="scenario-date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="scenario-date" />
            </Field>
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
