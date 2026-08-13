import {describe, expect, it} from "vitest";
import {
  calibrateChapterClaimEvidenceQuality,
  enforceChapterClaimEvidenceQuality,
} from "../src/research/book/chapter-evidence-quality";
import {ChapterAnalysisSchema, type ChapterAnalysis} from "../src/research/book/knowledge-schema";

const ref = {type: "book" as const, chapterId: "chapter-023", page: 499, blockId: "p499-b18"};

const analysisWith = ({
  statement,
  excerpt,
  support = "strong",
  appliesTo = ["2008年中国城乡居民家庭人均收入"],
  evidenceSummary = statement,
}: {
  statement: string;
  excerpt: string;
  support?: "strong" | "partial" | "weak" | "unsupported";
  appliesTo?: string[];
  evidenceSummary?: string;
}): ChapterAnalysis => ChapterAnalysisSchema.parse({
  chapterId: "chapter-023",
  title: "第二十三章 贫富差距与社会公平",
  importance: {score: 90, level: "core", reason: "全书重点章节。"},
  chapterRole: "evidence",
  summary: {oneSentence: "本章讨论收入差距。", detailed: "本章讨论收入差距的测量与解释。"},
  claims: [{
    claimId: "claim-023-gini",
    type: "fact",
    statement,
    importance: {score: 90, level: "core", reason: "本章核心事实。"},
    authorPosition: "作者引用国家统计局数据。",
    scope: {
      appliesTo,
      doesNotNecessarilyApplyTo: ["其他年份或其他国家"],
    },
    evidenceSupport: support,
    bookEvidenceRefs: [ref],
    sourceRefs: [ref],
    confidence: 0.99,
    verificationStatus: "needs_external_check",
  }],
  arguments: [],
  evidence: [{
    evidenceId: "evidence-023-gini",
    type: "statistic",
    summary: evidenceSummary,
    supportsClaimIds: ["claim-023-gini"],
    strength: 0.95,
    sourceRef: ref,
    originalExcerpt: excerpt,
    interpretation: "这是作者引用的统计值，尚未外部核验。",
    confidence: 0.99,
  }],
  concepts: ["基尼系数"],
  examples: [],
  limitations: ["统计值尚未外部核验。"],
  questions: [],
  relationsToOtherChapters: [],
  quality: {confidence: 0.95},
});

describe("Chapter Claim-Evidence quality gate", () => {
  it("calibrates a directly supported numeric Claim as strong", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "根据国家统计局数据，2008年中国城乡居民家庭人均收入的基尼系数为0.491。",
      excerpt: "据国家统计局数据，到2008年我国城乡居民家庭人均收入的基尼系数为0.491，是一个高峰值。",
    }));

    expect(result.analysis.claims[0]!.evidenceSupport).toBe("strong");
    expect(result.blockingIssues).toEqual([]);
  });

  it("blocks a severe excerpt mismatch and marks its Claim unsupported", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "根据国家统计局数据，2008年中国城乡居民家庭人均收入的基尼系数为0.491。",
      excerpt: "当时城市里是低工资和票证制度，社会管理者通过粮票平均分配生活消费品。",
    }));

    expect(result.analysis.claims[0]!.evidenceSupport).toBe("unsupported");
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "SEVERE_EXCERPT_MISMATCH", claimId: "claim-023-gini"}),
      expect.objectContaining({code: "UNSUPPORTED_CLAIM", claimId: "claim-023-gini"}),
    ]));
  });

  it("blocks causal language when the excerpt states only association", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "市场机制的引入导致中国贫富差距扩大。",
      excerpt: "中国贫富差距的扩大与引入市场机制有关系。",
      appliesTo: ["中国改革开放以来的市场转型"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "CAUSAL_OVERCLAIM", claimId: "claim-023-gini"}),
    ]));
  });

  it("blocks partial support unless statement or scope explicitly narrows the Claim", () => {
    const broad = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "教育可以有效缩小贫富差距。",
      excerpt: "此外，教育在解决贫富差距问题上也有作用。",
      evidenceSummary: "教育在解决贫富差距问题上也有作用。",
      support: "partial",
      appliesTo: ["贫富差距"],
    }));
    const narrowed = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "作者认为，教育可能对缓解中国当前贫富差距发挥一定作用。",
      excerpt: "此外，教育在解决贫富差距问题上也有作用。",
      evidenceSummary: "教育在解决贫富差距问题上也有作用。",
      support: "partial",
      appliesTo: ["作者讨论的中国当前贫富差距治理"],
    }));

    expect(broad.analysis.claims[0]!.evidenceSupport).toBe("partial");
    expect(broad.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "PARTIAL_SUPPORT_SCOPE_OVERCLAIM"}),
    ]));
    expect(narrowed.analysis.claims[0]!.evidenceSupport).toBe("partial");
    expect(narrowed.blockingIssues).toEqual([]);
  });

  it("blocks a core Claim without a logically supporting Evidence link", () => {
    const analysis = analysisWith({
      statement: "根据国家统计局数据，2008年中国城乡居民家庭人均收入的基尼系数为0.491。",
      excerpt: "据国家统计局数据，到2008年我国城乡居民家庭人均收入的基尼系数为0.491。",
    });
    analysis.evidence[0]!.supportsClaimIds = [];

    const result = calibrateChapterClaimEvidenceQuality(analysis);

    expect(result.analysis.claims[0]!.evidenceSupport).toBe("unsupported");
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "CORE_CLAIM_WITHOUT_DIRECT_EVIDENCE"}),
    ]));
  });

  it("accepts a scoped Chinese paraphrase as partial rather than weak", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "在作者讨论的当代中产阶层中，不同职业群体的经济状况与生活方式呈现内部差异。",
      excerpt: "中产阶层内部也有明显分化，不同职业群体的收入条件和生活方式并不相同。",
      support: "partial",
      appliesTo: ["作者讨论的当代中产阶层职业群体"],
    }));

    expect(result.analysis.claims[0]!.evidenceSupport).toBe("partial");
    expect(result.blockingIssues).toEqual([]);
  });

  it("removes unsupported Claims and their forced Evidence links", () => {
    const supported = analysisWith({
      statement: "据国家统计局数据，2008年基尼系数为0.491。",
      excerpt: "据国家统计局数据，到2008年基尼系数为0.491。",
    });
    const unsupportedClaim = structuredClone(supported.claims[0]!);
    unsupportedClaim.claimId = "claim-023-invented";
    unsupportedClaim.statement = "1979年基尼系数为0.26。";
    unsupportedClaim.evidenceSupport = "strong";
    const forcedEvidence = structuredClone(supported.evidence[0]!);
    forcedEvidence.evidenceId = "evidence-023-forced";
    forcedEvidence.supportsClaimIds = [unsupportedClaim.claimId];
    supported.claims.push(unsupportedClaim);
    supported.evidence.push(forcedEvidence);

    const result = enforceChapterClaimEvidenceQuality(supported);

    expect(result.unsupportedClaimsRemoved).toBe(1);
    expect(result.analysis.claims.map((claim) => claim.claimId)).toEqual(["claim-023-gini"]);
    expect(result.analysis.evidence.map((evidence) => evidence.evidenceId))
      .toEqual(["evidence-023-gini"]);
    expect(result.blockingIssues).toEqual([]);
  });

  it("removes weak or causal-overclaim output before final persistence", () => {
    const weak = analysisWith({
      statement: "作者认为，中国40年来引入市场机制导致贫富差距扩大。",
      excerpt: "研究发现，中国40年来贫富差距的扩大确实和中国引入市场机制有关系。",
      evidenceSummary: "作者认为，中国40年来贫富差距的扩大与引入市场机制有关。",
      support: "weak",
      appliesTo: ["中国改革开放以来的市场转型"],
    });

    const result = enforceChapterClaimEvidenceQuality(weak);

    expect(result.analysis.claims).toEqual([]);
    expect(result.causalOverclaimsCorrected).toBe(0);
  });

  it("blocks an Evidence summary that exceeds its exact source excerpt", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "改革开放后，社会分层具有了流动性。",
      excerpt: "改革开放后，社会分层具有了流动性。",
      evidenceSummary: "改革开放前以身份制为核心，改革开放后经济分层取代身份制。",
      appliesTo: ["改革开放后的中国社会分层"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "EVIDENCE_SUMMARY_EXCERPT_MISMATCH"}),
    ]));
  });

  it("does not disguise a truncated source fragment as a passing Claim", () => {
    const fragment = analysisWith({
      statement: "可能发生的，所以，反映收入分配的是一个大于0而小于1的数值，",
      excerpt: "可能发生的，所以，反映收入分配的是一个大于0而小于1的数值，",
      evidenceSummary: "可能发生的，所以，反映收入分配的是一个大于0而小于1的数值，",
      support: "strong",
      appliesTo: ["作者讨论的收入分配测量"],
    });

    const result = calibrateChapterClaimEvidenceQuality(fragment);

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "FRAGMENTARY_CLAIM"}),
    ]));
    expect(result.analysis.quality.status).toBe("NEEDS_REVIEW");
  });

  it("blocks negation reversal even when almost every character overlaps", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "教育可以缩小贫富差距。",
      excerpt: "教育不可以缩小贫富差距。",
      evidenceSummary: "教育不可以缩小贫富差距。",
      appliesTo: ["教育与贫富差距"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "SEVERE_EXCERPT_MISMATCH"}),
    ]));
  });

  it("blocks reversed causal direction", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "社会冲突导致贫富差距扩大。",
      excerpt: "贫富差距扩大导致社会冲突。",
      evidenceSummary: "贫富差距扩大导致社会冲突。",
      appliesTo: ["社会冲突与贫富差距"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "CAUSAL_OVERCLAIM"}),
    ]));
  });

  it("blocks a universal scope that is absent from a narrow excerpt", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "作者认为，教育可能与中国当前贫富差距有关。",
      excerpt: "作者认为，教育可能与中国当前贫富差距有关。",
      evidenceSummary: "作者认为，教育可能与中国当前贫富差距有关。",
      support: "partial",
      appliesTo: ["所有国家、所有时期和全部群体"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "SCOPE_OVERCLAIM"}),
    ]));
  });

  it("does not let a broad Claim statement self-justify its broad scope", () => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement: "作者认为，教育可能与所有国家当前贫富差距有关。",
      excerpt: "作者认为，教育可能与中国当前贫富差距有关。",
      evidenceSummary: "作者认为，教育可能与中国当前贫富差距有关。",
      support: "partial",
      appliesTo: ["所有国家当前贫富差距"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "SCOPE_OVERCLAIM"}),
    ]));
  });

  it.each(["引发", "促使", "推动", "带来", "致使"])(
    "blocks unsupported causal synonym %s",
    (verb) => {
      const result = calibrateChapterClaimEvidenceQuality(analysisWith({
        statement: `市场转型${verb}贫富差距扩大。`,
        excerpt: "市场转型与贫富差距扩大有关。",
        evidenceSummary: "市场转型与贫富差距扩大有关。",
        appliesTo: ["市场转型与贫富差距"],
      }));

      expect(result.blockingIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({code: "CAUSAL_OVERCLAIM"}),
      ]));
    },
  );

  it.each(["贫富差距扩大源于市场转型。", "贫富差距扩大归因于市场转型。"])(
    "blocks unsupported reverse causal structure: %s",
    (statement) => {
      const result = calibrateChapterClaimEvidenceQuality(analysisWith({
        statement,
        excerpt: "市场转型与贫富差距扩大有关。",
        evidenceSummary: "市场转型与贫富差距扩大有关。",
        appliesTo: ["市场转型与贫富差距"],
      }));

      expect(result.blockingIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({code: "CAUSAL_OVERCLAIM"}),
      ]));
    },
  );

  it.each([
    "由于市场转型，所以贫富差距扩大。",
    "因为市场转型，因而贫富差距扩大。",
    "由于市场转型，从而贫富差距扩大。",
  ])("blocks unsupported causal connectors: %s", (statement) => {
    const result = calibrateChapterClaimEvidenceQuality(analysisWith({
      statement,
      excerpt: "市场转型与贫富差距扩大有关。",
      evidenceSummary: "市场转型与贫富差距扩大有关。",
      appliesTo: ["市场转型与贫富差距"],
    }));

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "CAUSAL_OVERCLAIM"}),
    ]));
  });

  it("does not promote weak model summaries to strong Claims", () => {
    const weak = analysisWith({
      statement: "市场机制导致所有社会的贫富差距扩大。",
      excerpt: "作者认为，中国40年来贫富差距扩大与引入市场机制有关。",
      evidenceSummary: "市场机制导致所有社会的贫富差距扩大。",
      support: "weak",
      appliesTo: ["所有社会和所有时期"],
    });

    const result = enforceChapterClaimEvidenceQuality(weak);

    expect(result.analysis.claims).toEqual([]);
    expect(result.analysis.evidence).toEqual([]);
  });
});
