"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { api, errorMessage, type DownloadedFile } from "@/lib/api-client";
import { fmtDate, fmtRange } from "@/lib/dates";
import { saveFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";

/**
 * Downloads for the period on screen: the register as CSV, and the month's summary as PDF.
 * The server builds both from the same projection the calendar shows.
 */
export function ExportMenu({ range, month, disabled }: { range: { from: string; to: string }; month: string; disabled: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download(fetchFile: () => Promise<DownloadedFile>, done: string) {
    setBusy(true);
    try {
      const { blob, filename } = await fetchFile();
      saveFile(blob, filename);
      toast(done, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="min-h-11" disabled={disabled} loading={busy} data-testid="calendar-export">
          {!busy && <Download aria-hidden="true" data-icon="inline-start" />} Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-64">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11 sm:min-h-9"
          onSelect={() => void download(() => api.downloadRegisterCsv(range), "Register downloaded.")}
          data-testid="calendar-export-csv"
        >
          <FileSpreadsheet aria-hidden="true" />
          <span className="flex flex-col">
            <span>Register (CSV)</span>
            <span className="text-xs text-muted-foreground">{fmtRange(range.from, range.to)}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 sm:min-h-9"
          onSelect={() => void download(() => api.downloadMonthlySummary(month), "Monthly summary downloaded.")}
          data-testid="calendar-export-pdf"
        >
          <FileText aria-hidden="true" />
          <span className="flex flex-col">
            <span>Monthly summary (PDF)</span>
            <span className="text-xs text-muted-foreground">{fmtDate(`${month}-01`, "MMMM yyyy")}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
