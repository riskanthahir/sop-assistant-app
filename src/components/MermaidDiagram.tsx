import React, { useEffect, useId, useState } from 'react';
import type { FlowchartData } from '../types';

interface MermaidDiagramProps {
  flowchart: FlowchartData;
  dark: boolean;
  onRenderFailed?: () => void;
}

function sanitizeId(raw: string, fallbackIdx: number): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `n_${fallbackIdx}_${cleaned}`;
  }
  return cleaned;
}

function escapeMermaidLabel(raw: string): string {
  return raw
    .replace(/["`<>]/g, ' ')
    .replace(/[[\]{}()]/g, ' ')
    .replace(/[;|#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function buildMermaidDefinition(flowchart: FlowchartData): string | null {
  if (!flowchart?.nodes?.length || !flowchart?.edges?.length) return null;

  const idMap = new Map<string, string>();
  const lines: string[] = ['flowchart TD'];

  flowchart.nodes.forEach((node, idx) => {
    const safeId = sanitizeId(node.id, idx);
    idMap.set(node.id, safeId);
    const label = escapeMermaidLabel(node.label) || `Step ${idx + 1}`;
    if (node.type === 'start' || node.type === 'end') {
      lines.push(`  ${safeId}(["${label}"])`);
    } else if (node.type === 'decision') {
      lines.push(`  ${safeId}{"${label}"}`);
    } else {
      lines.push(`  ${safeId}["${label}"]`);
    }
  });

  let validEdgeCount = 0;
  for (const edge of flowchart.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    const edgeLabel = escapeMermaidLabel(edge.label || '');
    if (edgeLabel) {
      lines.push(`  ${from} -->|"${edgeLabel}"| ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
    validEdgeCount += 1;
  }

  return validEdgeCount > 0 ? lines.join('\n') : null;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  flowchart,
  dark,
  onRenderFailed,
}) => {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const definition = buildMermaidDefinition(flowchart);
    if (!definition) {
      setFailed(true);
      onRenderFailed?.();
      return;
    }

    (async () => {
      try {
        const mod = await import('mermaid');
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'neutral',
          fontFamily: 'Manrope, Noto Sans Sinhala, Noto Sans Tamil, sans-serif',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: false,
            curve: 'basis',
          },
        });
        const renderId = `sop_flow_${reactId}_${Date.now()}`;
        const result = await mermaid.render(renderId, definition);
        if (!cancelled && result?.svg) {
          setSvg(result.svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          onRenderFailed?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flowchart, dark, reactId, onRenderFailed]);

  if (failed || !svg) {
    return null;
  }

  return (
    <div
      className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 [&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
