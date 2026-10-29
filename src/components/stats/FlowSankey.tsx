import { type ComponentProps, useState } from "react";
import { Sankey, Tooltip, type TooltipContentProps } from "recharts";
import { type FlowLink, type FlowNode, fmtPct, pct } from "@/lib/stats";

type SankeyProps = ComponentProps<typeof Sankey>;
type NodeProps = Parameters<Extract<SankeyProps["node"], Function>>[0];
type LinkProps = Parameters<Extract<SankeyProps["link"], Function>>[0];

const HEIGHT = 360;
const LABEL_GAP = 8;

export default function FlowSankey({ nodes, links }: { nodes: FlowNode[]; links: FlowLink[] }) {
  // Recharts hides its tooltip instantly, so hover is tracked here to fade it out in place.
  const [hovering, setHovering] = useState(false);
  const total = nodes.length ? links.filter((l) => l.source === 0).reduce((sum, l) => sum + l.value, 0) : 0;
  if (!total) return null;

  const renderNode = ({ x, y, width, height, index, payload }: NodeProps) => {
    const node = nodes[index];
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={node.color} rx={2} />
        <text
          x={x + width + LABEL_GAP}
          y={y + height / 2}
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--foreground)"
        >
          {node.name} <tspan fill="var(--muted-foreground)">{payload.value}</tspan>
        </text>
      </g>
    );
  };

  const renderLink = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index }: LinkProps) => {
    const color = nodes[links[index].target].color;
    return (
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={linkWidth}
      />
    );
  };

  // Hovering a node shows its total; hovering a link shows that hop.
  const renderTooltip = ({ payload }: TooltipContentProps)=> {
    const item = payload?.[0]?.payload as { name?: string; value: number; source?: { name: string }; target?: { name: string } } | undefined;
    if (!item) return null;
    const title = item.source && item.target ? `${item.source.name} → ${item.target.name}` : item.name;
    return (
      <div
        className="animate-in fade-in rounded-lg border bg-card px-3 py-2 text-[13px] shadow-sm transition-opacity duration-150"
        style={{ opacity: hovering ? 1 : 0 }}
      >
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{item.value}</span> · {fmtPct(pct(item.value, total))} of applied
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">Application Flow</h2>
      </div>
      <div className="overflow-x-auto">
        <Sankey
          data={{ nodes, links }}
          node={renderNode}
          link={renderLink}
          nodeWidth={10}
          nodePadding={24}
          sort={false}
          margin={{ top: 8, right: 120, bottom: 8, left: 8 }}
          width="100%"
          height={HEIGHT}
          style={{ minWidth: 640 }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <Tooltip active content={renderTooltip} isAnimationActive={false} wrapperStyle={{ pointerEvents: "none" }} />
        </Sankey>
      </div>
    </div>
  );
}

