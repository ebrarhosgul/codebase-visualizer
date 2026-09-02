"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Code, Boxes, Layers, Braces } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { CodebaseReactFlowNode } from "@/graph";
import type { SymbolKind } from "@/entities";
import { cn } from "@/lib/utils";

function getSymbolBadgeVariant(kind: SymbolKind): BadgeVariant {
  switch (kind) {
    case "function":
    case "method":
      return "syntax-fn";
    case "class":
      return "syntax-class";
    case "interface":
    case "type_alias":
      return "syntax-type";
    default:
      return "default";
  }
}

function getSymbolIcon(kind: SymbolKind) {
  switch (kind) {
    case "class":
      return Boxes;
    case "interface":
    case "type_alias":
      return Layers;
    case "function":
    case "method":
      return Braces;
    default:
      return Code;
  }
}

/**
 * Custom React Flow card node representing symbol declarations.
 */
export function SymbolNodeCard({
  data,
  selected,
}: NodeProps<CodebaseReactFlowNode>): React.JSX.Element {
  if (data.entityType !== "symbol") {
    return <div />;
  }

  const symbol = data.entity;
  const kind = symbol.kind;
  const Icon = getSymbolIcon(kind);
  const badgeVariant = getSymbolBadgeVariant(kind);

  return (
    <div
      role="article"
      aria-label={`Symbol node: ${symbol.name} (${kind})`}
      className={cn(
        "relative rounded-lg p-3 min-w-[200px] max-w-[300px] select-none transition-all shadow-md",
        "bg-[var(--surface-card)] border",
        selected
          ? "border-[var(--border-focus)] ring-2 ring-[var(--border-focus)] shadow-lg"
          : "border-[var(--border-default)] hover:border-[var(--text-muted)]",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 bg-[var(--syntax-fn)] border border-[var(--surface-card)]"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-[var(--surface-panel-secondary)] shrink-0 text-[var(--syntax-fn)]">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4
              className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate"
              title={symbol.name}
            >
              {symbol.name}
            </h4>
            <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">
              {symbol.signature || kind}
            </p>
          </div>
        </div>
        <Badge variant={badgeVariant} className="shrink-0">
          {kind}
        </Badge>
      </div>

      {symbol.isExported && (
        <div className="mt-2 pt-1 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
          <span>exported</span>
          <span className="text-[var(--status-success)] text-[9px] uppercase">
            {symbol.visibility}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 bg-[var(--syntax-fn)] border border-[var(--surface-card)]"
      />
    </div>
  );
}
