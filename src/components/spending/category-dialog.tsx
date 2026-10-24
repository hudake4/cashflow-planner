"use client";

import { useState } from "react";
import { SPENDING_CATEGORIES } from "@/contracts/api";
import type { SpendingCategory, SpendingResponse, SpendingTransactionDTO } from "@/contracts/api";
import { api, errorMessage } from "@/lib/api-client";
import { fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Switch } from "@/components/ui/field";
import { InlineStatus } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABELS } from "./categories";

/**
 * Picks a category for one transaction. By default the choice is also remembered for the merchant, so the
 * analyzer sorts that merchant's other transactions, and the ones that arrive later, the same way.
 */
export function CategoryDialog({
  transaction,
  currency,
  onClose,
  onSaved,
}: {
  transaction: SpendingTransactionDTO | null;
  currency: string;
  onClose: () => void;
  onSaved: (next: SpendingResponse) => void;
}) {
  return (
    <Dialog
      open={transaction !== null}
      onClose={onClose}
      title="Change category"
      description={transaction ? `${transaction.name} · ${fmtShort(transaction.date)} · ${money(transaction.cents, currency)}` : undefined}
      size="sm"
      testId="category-dialog"
    >
      {/* Keyed so each transaction opens with fresh form state. */}
      {transaction && <CategoryForm key={transaction.id} transaction={transaction} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function CategoryForm({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: SpendingTransactionDTO;
  onClose: () => void;
  onSaved: (next: SpendingResponse) => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<SpendingCategory>(transaction.category);
  const [applyToMerchant, setApplyToMerchant] = useState(transaction.merchantLearnable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: SpendingCategory | null) {
    setSaving(true);
    setError(null);
    try {
      const result = await api.setTransactionCategory(transaction.id, { category: next, applyToMerchant: applyToMerchant && transaction.merchantLearnable });
      onSaved(result);
      toast(next === null ? "Category reset to automatic." : `Category set to ${CATEGORY_LABELS[next]}.`, "success");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      aria-busy={saving}
      onSubmit={(e) => {
        e.preventDefault();
        void submit(category);
      }}
    >
      {error && <InlineStatus tone="error">{error}</InlineStatus>}
      <p className="text-xs break-words text-muted-foreground" data-testid="category-dialog-description">
        {transaction.description}
      </p>

      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value as SpendingCategory)} data-testid="category-select">
          {SPENDING_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>

      {transaction.merchantLearnable && (
        <Switch
          checked={applyToMerchant}
          onChange={setApplyToMerchant}
          label={`Do this for every ${transaction.name} transaction`}
          description="Applies to the ones already here and to new ones after your next refresh."
          testId="category-apply-merchant"
        />
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {transaction.source !== "AUTO" && (
          <Button variant="ghost" onClick={() => void submit(null)} disabled={saving} className="mr-auto" data-testid="category-reset">
            Reset to automatic
          </Button>
        )}
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} data-testid="category-save">
          Save
        </Button>
      </div>
    </form>
  );
}
