"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Code, Boxes, Layers, Braces } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { CodebaseReactFlowNode } from "@/graph";
import type { SymbolKind } from "@/entities";
import { useGraphStore } from "@/stores/graph-store";
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
export const SymbolNodeCard = React.memo(function SymbolNodeCard({
  id,
  data,
  selected,
}: NodeProps<CodebaseReactFlowNode>): React.JSX.Element {
  const isHoveredInStore = useGraphStore((state) => state.hoveredNodeId === id);

  if (data.entityType !== "symbol") {
    return <div />;
  }

  const symbol = data.entity;
  const kind = symbol.kind;
  const Icon = getSymbolIcon(kind);
  const badgeVariant = getSymbolBadgeVariant(kind);
  const isHovered =
    isHoveredInStore || Boolean((data as Record<string, unknown>).isHovered);

  return (
    <div
      role="article"
      aria-label={`Symbol node: ${symbol.name} (${kind})`}
      data-testid={`canvas-node-symbol-${id}`}
      data-node-id={id}
      data-selected={Boolean(selected)}
      className={cn(
        "relative rounded-lg p-3 w-[240px] max-w-[240px] select-none transition-colors duration-150 shadow-xs",
        "bg-[#15171b] border",
        selected
          ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/50 z-20"
          : isHovered
            ? "border-zinc-700 bg-zinc-900/90 z-10"
            : "border-zinc-800/80 hover:border-zinc-700",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-zinc-400 border border-[#15171b] rounded-full -left-[4px]"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 rounded-md bg-zinc-900 border border-zinc-800 shrink-0 text-zinc-400">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h4
              className="text-xs font-mono font-medium text-zinc-100 truncate"
              title={symbol.name}
            >
              {symbol.name}
            </h4>
            <p className="text-[10px] text-zinc-500 truncate font-mono">
              {symbol.signature || kind}
            </p>
          </div>
        </div>
        <Badge
          variant={badgeVariant}
          className="shrink-0 text-[10px] font-mono px-1.5 py-0.2"
        >
          {kind}
        </Badge>
      </div>

      {symbol.isExported && (
        <div className="mt-2 pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
          <span>exported</span>
          <span className="text-emerald-400 text-[9px] uppercase font-mono">
            {symbol.visibility}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-zinc-400 border border-[#15171b] rounded-full -right-[4px]"
      />
    </div>
  );
});
