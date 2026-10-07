import type { CandidateComputer } from "./textRevision";

/**
 * 文本审核候选的“按新稿件重算”：
 * 依据文字仍在新稿件中，才围绕该依据重新给出候选；依据被整段移除则不产出
 * （调用方会把旧候选标记失效）。
 */
export const recomputeTextCandidates: CandidateComputer = ({ taskId, content, revisionId }) => {
  if (taskId !== "text-001") return [];
  const evidence = "优惠券只能在新设备上使用";
  if (!content.includes(evidence)) return [];
  // 重算时间随修订批次略有波动，模拟重新评估后的置信度
  const wave = (revisionId.charCodeAt(revisionId.length - 1) % 3) * 0.01;
  return [
    {
      conflictId: "conflict-text-001",
      target: `“${evidence}”观点类型（按修订稿重算 v${revisionId.slice(-4)}）`,
      evidenceText: evidence,
      candidates: [
        { author: "何序", labelId: "negative", value: "负向观点：规则不透明（修订稿重算）", confidence: 0.94 - wave },
        { author: "周岚", labelId: "request", value: "诉求：提前说明限制（修订稿重算）", confidence: 0.87 + wave },
        { author: "抽检模型", labelId: "neutral", value: "中性事实：描述使用范围（修订稿重算）", confidence: 0.72 },
      ],
    },
  ];
};
