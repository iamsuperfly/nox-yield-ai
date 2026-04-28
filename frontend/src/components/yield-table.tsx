"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MOCK_YIELDS, formatBps } from "@/lib/yields";

export function YieldTable() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-glow" />
            Strategy universe
          </CardTitle>
          <CardDescription>
            Live yields the AI agent reads inside the TEE.{" "}
            <span className="text-zinc-500">
              Mock data in BUILD 1 — replaced by Chainlink Functions in BUILD 2.
            </span>
          </CardDescription>
        </div>
        <Badge variant="info">Mock feed</Badge>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Strategy</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right pr-6">APY</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_YIELDS.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="pl-6">
                  <div className="font-medium text-zinc-100">{row.label}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{row.blurb}</div>
                </TableCell>
                <TableCell>
                  <RiskPill tier={row.riskTier} />
                </TableCell>
                <TableCell className="text-zinc-300">
                  {row.durationDays >= 365
                    ? `${(row.durationDays / 365).toFixed(1)}y`
                    : `${row.durationDays}d`}
                </TableCell>
                <TableCell className="text-right pr-6">
                  <span className="font-mono text-base font-semibold text-emerald-glow">
                    {formatBps(row.apyBps)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RiskPill({ tier }: { tier: "Low" | "Mid" | "High" }) {
  const cls =
    tier === "Low"
      ? "border-emerald-glow/30 bg-emerald-glow/10 text-emerald-glow"
      : tier === "Mid"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {tier}
    </span>
  );
}
