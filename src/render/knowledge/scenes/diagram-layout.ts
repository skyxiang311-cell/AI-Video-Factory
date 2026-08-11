export type DiagramLayout =
  | "horizontal-flow"
  | "vertical-flow"
  | "cycle"
  | "relation";

export type DiagramPosition = {x: number; y: number};

const round = (value: number): number => Math.round(value * 100) / 100;

export const buildDiagramLayout = (
  layout: DiagramLayout,
  nodeCount: number,
): DiagramPosition[] => {
  if (nodeCount < 2 || nodeCount > 5) {
    throw new Error("流程图节点数量必须为 2 到 5");
  }
  if (layout === "horizontal-flow") {
    return Array.from({length: nodeCount}, (_, index) => ({
      x: round(0.14 + (0.72 * index) / (nodeCount - 1)),
      y: 0.5,
    }));
  }
  if (layout === "vertical-flow") {
    return Array.from({length: nodeCount}, (_, index) => ({
      x: 0.5,
      y: round(0.14 + (0.72 * index) / (nodeCount - 1)),
    }));
  }
  if (layout === "relation") {
    return Array.from({length: nodeCount}, (_, index) => ({
      x: round(0.16 + (0.68 * index) / (nodeCount - 1)),
      y: index % 2 === 0 ? 0.32 : 0.7,
    }));
  }
  if (nodeCount === 3) {
    return [
      {x: 0.5, y: 0.12},
      {x: 0.86, y: 0.76},
      {x: 0.14, y: 0.76},
    ];
  }
  return Array.from({length: nodeCount}, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / nodeCount;
    return {
      x: round(0.5 + Math.cos(angle) * 0.42),
      y: round(0.5 + Math.sin(angle) * 0.38),
    };
  });
};
