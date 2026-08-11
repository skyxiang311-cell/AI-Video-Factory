# Book Deep Reading V1 设计规范

- 状态：用户已确认设计，待最终 Spec 复核
- 日期：2026-08-11
- 项目：AI Video Factory
- 目标：把中文、日文、英文非虚构书籍 PDF 转化为可追溯、可核验、可复用的深度阅读资产，并生成约 5 分钟的抖音 / 小红书知识型深度解说视频。

## 1. 产品目标

Book Deep Reading V1 不是“把一本书总结短一点”，而是让系统表现得像一个真正完整读过、思考过、核验过这本书的人。

系统必须长期区分四层：

1. Author Claim：作者说了什么；
2. Book Evidence：书里用什么证据支持；
3. External Verification：现实世界的新资料如何看；
4. Our Judgment：AI Video Factory 最终如何判断。

四层不得混写，也不得用外部资料偷偷覆盖作者原意。

## 2. V1 范围

### 2.1 书籍类型

第一版聚焦：商业、管理、投资、心理、自我成长、社会科学等非虚构书籍。小说和文学作品暂不纳入 V1 正式验收范围。

### 2.2 语言

正式支持：简体中文、日文、英文。

原书证据必须保留原语言原文；分析、判断、视频选题和最终脚本统一输出简体中文。翻译只能作为解释层，不能覆盖原文。

### 2.3 PDF 类型

正式支持：

- 可复制文字的电子 PDF；
- 扫描版 PDF；
- 包含复杂版式、表格、图表、模型图、脚注的 PDF。

复杂页面允许低置信度，但任何依赖低置信度页面的核心观点、数字、案例或图表结论不得直接进入最终视频。

### 2.4 默认视频目标

- 默认时长：约 5 分钟；
- 目标区间：270～330 秒，必要时允许约 4 分 30 秒～6 分钟轻微浮动；
- 默认观众：有一定知识基础的普通观众；
- 叙事风格：故事 / 反常识 / 现实问题切入 + 理性拆解 + 外部核验 + 最终判断 + 可实践结论；
- 视频只在关键数字、重要研究、争议观点等位置显示来源；后台保持全面严格追溯。

### 2.5 运行模式

预留 `quick`、`balanced`、`deep`，V1 默认且只要求完整实现 `balanced`：整本覆盖、重点深挖、选择性外部核验、独立审计，同时控制成本与耗时。

## 3. 非目标

V1 不负责：

- 小说 / 文学完整分析；
- 把受版权保护书籍改写成可替代原书的内容；
- 大段复制原文；
- 登录、付费、SaaS 后台；
- 抖音 / 小红书自动发布；
- 为了流量曲解作者；
- 把外部观点冒充作者观点；
- 让渲染层临时调用模型补内容。

## 4. 核心原则

### Evidence First

进入最终视频的重要观点、数字、案例和判断必须有来源。

### Progressive Compression

越往后越读取 Claim / Evidence / Concept / Argument 等知识结构，而不是反复把整本 PDF 塞给模型。

### Evidence Recall

综合、核验或审计阶段对某个结论有疑问时，必须能回到原书具体页码和邻近上下文重新检查。

### Claim-first Reading

逐章阅读以可验证 Claim 为核心，而不是段落摘要。多个实验、故事和案例可能只是同一个 Claim 的支撑材料。

### Strict Traceability

重要内容必须带页码 / 区块或外部来源；无法定位时不得静默进入脚本。

## 5. 深读质量标准

系统必须能做到：

1. Structure Coverage：覆盖全书主要结构；
2. Core Thesis：准确回答作者整本书真正要证明什么；
3. Argument Chain：恢复核心结论的论证链；
4. Evidence Map：重要 Claim 对应可靠 Evidence；
5. Cross-Chapter Synthesis：识别跨章节的支持、重复、限定、冲突；
6. Author vs Reality：作者与现实核验严格分层；
7. Limitations & Counterpoints：识别适用条件、反例、偏差、时代局限；
8. Actionable Understanding：能给观众可迁移的理解与应用。

### Deep Reading Score / 100

- 结构覆盖：10
- 核心命题：15
- 论证链：15
- 证据追溯：15
- 跨章节综合：15
- 外部核验：10
- 局限 / 反方：10
- 实际应用：10

规则：

- `<75`：禁止进入脚本阶段；
- `75～84`：标记需人工复核；
- `>=85`：推荐进入视频阶段；
- 即使总分很高，只要存在硬性 Block，仍不得进入最终视频。

硬性 Block 包括：核心数字无来源、核心 Claim 无法追溯、关键低可信 OCR 无法确认、重要翻译失真、最终角度依赖未验证核心证据。

## 6. 产物结构

```text
output/<job-id>/book/
├── book-source.json
├── chapters/
│   ├── chapter-001.json
│   ├── chapter-002.json
│   └── ...
├── book-synthesis.json
├── verification.json
├── video-angles.json
├── selected-angle.json
└── book-analysis.json
```

内部采用分层产物，下游通过 `book-analysis.json` 统一进入。

## 7. book-source.json

职责：记录系统到底读了什么，不负责总结。

至少包含：

- metadata：title、authors、language、publisher、publicationYear、pageCount；
- document：pdfKind、sourcePath、sha256、detectedLanguages；
- structure：frontMatter、chapters、conclusion、appendices；
- pages：逐页 contentBlocks 与 visualElements；
- extractionQuality：overallConfidence、lowConfidencePages、warnings。

每个文本区块至少保存：

- blockId；
- page；
- chapterId；
- type；
- originalText；
- language；
- 可选 zh-CN translation；
- bbox；
- confidence。

`originalText` 永远是追溯基准。

## 8. chapter-analysis/*.json

每章必须回答：这一章为什么存在、作者想证明什么、有哪些 Claim、如何论证、证据和案例是什么、有哪些限定、和其他章节如何关联、有哪些疑问或局限。

章节角色固定支持：

- foundation
- core_argument
- evidence
- case_study
- method
- counterargument
- application
- summary
- supplementary

主要字段：

```text
chapterId
title
importance { score, level, reason }
chapterRole
summary { oneSentence, detailed }
claims[]
arguments[]
evidence[]
examples[]
concepts[]
questions[]
limitations[]
relationsToOtherChapters[]
quality
```

## 9. Claim

Claim 是核心知识单位，至少包含：

```text
claimId
type
statement
importance
authorPosition
scope { appliesTo, doesNotNecessarilyApplyTo }
bookEvidenceRefs[]
sourceRefs[] { chapterId, page, blockId }
confidence
verificationStatus
```

必须保存适用范围，避免把“某些情况下可能成立”变成“所有情况下都成立”。

## 10. Evidence

Evidence 至少包含：

```text
evidenceId
type
summary
supportsClaimIds[]
strength
sourceRef
originalExcerpt
interpretation
confidence
```

V1 类型：study、statistic、case、anecdote、historical_event、logical_argument、expert_opinion、chart、table、author_observation。

不同 Evidence 不得默认拥有相同强度。

## 11. book-synthesis.json

负责从“每章读过”升级到“整本书读懂”。

至少包含：

```text
coreThesis
secondaryTheses[]
argumentMap[]
keyConcepts[]
crossChapterPatterns[]
tensions[]
limitations[]
practicalFrameworks[]
readerTakeaways[]
relations[]
```

关系类型只需要：supports、contradicts、extends、explains、example_of、depends_on、qualifies、repeats。

V1 不引入图数据库。

## 12. verification.json

外部核验必须与书内分析分离。

每条核验包含：

```text
claimId
verificationPriority
reason
externalFindings[]
verdict
analysis
confidence
```

verdict 固定为：supported、partially_supported、uncertain、outdated、contradicted、not_verifiable。

### 选择性核验

优先核验：关键数字、重大事实、核心论据、重要实验、明显争议结论、可能过时信息、最终视频准备采用的核心内容。

### 外部来源质量

- Level A：原始研究、官方机构、原始数据、公司公告；
- Level B：高质量专业机构、大型媒体、行业研究；
- Level C：二手解读；
- Level D：论坛 / 社媒 / 无法确认来源。

关键 Claim 优先使用 A / B。

## 13. 低置信度策略

采用分级处理：

- 普通低价值内容：Warn 后继续；
- 核心观点、数字、案例、图表：不得直接使用；
- 必须重新识别、回看原页、上下文交叉确认或找其他证据；
- 仍无法确认：标记 `unverified`，自动排除出最终脚本。

## 14. 分层深读算法：5 轮阅读 + 1 轮审计

### Round 0：文档结构化

页面解析、OCR / 视觉识别、目录、章节边界、正文 / 脚注 / 图表 / 表格识别。只负责结构化，不允许总结。输出 `book-source.json`。

### Round 1：全书鸟瞰

建立 Book Map：核心问题、可能核心命题、全书结构、核心章节、重复 / 案例章节、关键概念、深读优先级。

### Round 2：所有章节 Claim-first 深读

提取 Claim、Argument、Evidence、Example、Concept、限定条件、章节作用、关系、局限和疑问。

### Round 3：核心章节二次深挖

检查因果关系、证据实际证明范围、数据来源、相关性 / 因果混淆、适用范围、隐藏前提、跨章节冲突、过度推论。

### Round 4：跨章节综合

不再以章节为单位，而以 Claims / Evidence / Concepts / Arguments 重组全书，形成 Core Thesis、Argument Map、Tensions、Limitations、Practical Frameworks。

### Round 5：现实世界选择性核验

只对高价值 Claim 做外部核验，严格保存 Author says / Book Evidence / External Evidence / Our Judgment 四层。

### Round 6：Deep Reading Auditor

独立检查：Coverage、Citation、Evidence、Overclaim、Translation、Contradiction、Verification、Hallucination。

发现问题时只重跑受影响阶段及依赖链。

## 15. Evidence Packet

重要判断前应组装显式 Evidence Packet：

```text
task
claimId
evidencePacket {
  primary[]
  context[]
  relatedClaims[]
  externalEvidence[]
}
```

模型只保存可公开解释的 `judgment`、`basis`、`explanation`，不依赖不可审计的隐藏推理作为数据契约。

## 16. Video Angle Engine

深读完成后不得直接写脚本。

流程：

```text
book-synthesis + verification + Deep Reading Score
↓
生成 8～12 个候选角度
↓
去重 / 合并相似角度
↓
Eligibility Gate
↓
综合评分
↓
Top 3～5
↓
默认推荐第一名 + 人工可改选
```

### 角度类型

counterintuitive、problem_solving、hidden_mechanism、misunderstanding、framework、critical_review、case_driven。

### Eligibility Gate

候选角度必须：

- 有清晰 Central Question；
- 有至少一个 Central Claim；
- 至少两个支持点；
- 有可靠 Book Evidence；
- 核心事实完成必要核验；
- 不依赖 unverified 核心内容；
- 不夸大作者；
- 约 5 分钟可以讲透。

### 评分 / 100

- Audience Relevance：20
- Practical Value：20
- Counterintuitive：15
- Evidence Strength：15
- Narrative Potential：10
- Save Value：10
- Original Insight：10

额外计算：faithfulnessPenalty、overclaimPenalty、evidencePenalty、titleIntegrityScore。

标题不能承诺超过视频能证明的范围。

## 17. selected-angle.json

选中角度后才进入内容预算，至少包含：

```text
angleId
targetDurationSec = 300
centralQuestion
thesis
mustInclude { claims, evidence, examples, counterpoints }
optional[]
exclude[]
sourceDisplayRequirements[]
desiredViewerTakeaway
endingJudgment
```

一本书可以很丰富，但单条视频只讲一个核心问题。

## 18. 五分钟脚本结构

默认叙事：Question → Tension → Explanation → Evidence → Twist → Judgment → Takeaway。

时间预算：

- 0～3 秒：Primary Hook
  - 必须在前三秒建立注意力；
  - 使用反差、问题、结果、痛点或悬念；
  - 与当前 Hook <= 3 秒的 Schema 兼容。
- 3～8 秒：Hook Extension / Retention
  - 延续悬念；
  - 补充观看收益或现实冲突；
  - 不属于 Primary Hook；
  - 后续实现可由 intro / context / retention 类型场景承载。
- 8～30 秒：与观众建立现实关系；
- 30～75 秒：作者核心判断；
- 75～145 秒：最强证据 / 案例；
- 145～200 秒：底层机制 / 第二层解释；
- 200～245 秒：转折 + 外部核验；
- 245～285 秒：最终判断 + 实际使用；
- 285～300 秒：Memory Ending。

禁止默认“今天给大家分享一本书”；禁止默认“第一点、第二点、第三点”的机械列表式脚本。

脚本至少体现三次认知变化：A（原有理解）→ B（作者带来的新认识）→ B 的条件 / 局限 → C（更准确的新理解）。

## 19. Script Quality Gate

评分 / 100：

- Hook 10
- Central Question 10
- Narrative Coherence 15
- Evidence 15
- Depth 15
- Critical Thinking 10
- Practical Value 10
- Spoken Chinese 10
- Ending 5

`<80` 自动返工。

硬性 Block：无来源核心数字、标题过度承诺、曲解作者、把外部判断冒充作者、使用未验证核心事实。

## 20. 模型角色

通过 Provider Adapter 解耦供应商，不在 V1 设计里绑定具体模型名称。

### Tier 1 Fast Reader

负责目录、页面分类、章节切分、文本清理、OCR 结构整理、全书鸟瞰、概念初筛、章节重要性初评。

### Tier 2 Deep Analyst

负责 Claim、论证链、Evidence 映射、适用范围、核心章节深挖、跨章节综合、Core Thesis、局限、视频角度、五分钟内容规划。

### Tier 3 Auditor

只负责独立找错：过度推论、证据错配、翻译失真、章节冲突、外部核验误读、幻觉。

## 21. 成本控制

计算预算依据：

`Chapter Importance × Evidence Importance × Video Relevance`

普通章节以 Fast Reader 为主；核心章节进入 Deep Analyst；最终视频高相关 Claim 可触发 Deep Analyst + Auditor + External Verification。

不得所有页面无条件使用最高成本模型。

## 22. 缓存与局部重跑

缓存层级：

```text
book hash
↓
page extraction cache
↓
chapter analysis cache
↓
claim / evidence cache
↓
synthesis cache
↓
verification cache
↓
angle cache
```

主要产物记录：inputHash、promptVersion、modelConfig / modelProfile、schemaVersion、createdAt。

例如只修复第 7 章 OCR，只失效 chapter-07、相关 Claims / Evidence、受影响 synthesis、相关 verification、受影响 angles / script；不得整本默认重跑。

## 23. 错误与自动修复

错误类型：SOURCE_ERROR、EXTRACTION_ERROR、LOW_CONFIDENCE、ANALYSIS_CONFLICT、VERIFICATION_FAILURE、QUALITY_GATE_FAILURE。

错误需包含 severity、affectedArtifact、affectedClaims、retryStrategy、blocking。

分三级：

- BLOCK：禁止继续；
- WARN：允许继续但必须记录；
- INFO：仅记录。

系统应优先自动重试、重新识别、回看 Evidence 或让 Deep Analyst / Auditor 再判断；只有真正影响核心内容时再人工介入。

## 24. book-analysis.json

下游统一入口至少保存：

```text
bookId
deepReadingScore
status
coreThesis
keyConcepts[]
coreClaimIds[]
verifiedClaimIds[]
importantLimitations[]
practicalFrameworks[]
recommendedAngleId
artifacts { source, chapters, synthesis, verification, angles }
qualityGate { ... }
```

status 至少支持：processing、blocked、needs_review、approved_for_video。

## 25. 来源追溯

重要视频结论必须能反查：

```text
final.mp4
↓
script.json
↓
selected-angle.json
↓
claim
↓
book-synthesis.json
↓
chapter-analysis
↓
evidence
↓
PDF page / block
```

外部判断继续反查 `verification.json → external source`。

## 26. 与现有 AI Video Factory 集成

```text
Book PDF
↓
Book Deep Reading
↓
book-analysis.json
↓
video-angles.json
↓
selected-angle.json
↓
script.json
↓
storyboard.json
↓
voice.mp3
↓
subtitles.json
↓
Remotion
↓
final.mp4
```

现有 Storyboard 继续作为内容层和渲染层之间的稳定边界。Remotion 不直接读原 PDF，也不读取临时模型对话。

## Storyboard Schema Migration Requirements

当前 Knowledge Demo 的 Storyboard Schema 最大只支持 180 秒。这是当前实现限制，不是 Book Deep Reading 的产品限制；Book Deep Reading 继续以默认约 300 秒、目标范围 270～330 秒作为产品要求。

Book Deep Reading 实施阶段必须升级 Storyboard Schema，新 Schema 至少支持 360 秒。推荐未来按 profile / template 管理时长：

| Profile / Template | 时长范围 |
| --- | --- |
| `knowledge-short` | 60～180 秒 |
| `book-deep-reading` | 270～330 秒 |

Schema 升级必须保持现有 Knowledge Demo 向后兼容，包括现有 Storyboard 数据、校验规则和渲染链路不得因新增 `book-deep-reading` profile / template 而失效。

截至本设计修订时，当前代码尚未支持约 5 分钟 Storyboard；升级时长上限、引入 profile / template 时长规则及其兼容性验证均属于后续实施任务。此处仅记录未来实施要求，本次不修改任何 Schema 或功能代码。

## 27. Engineering Acceptance

自动测试至少验证：

- PDF 页面完整；
- 章节范围不重叠；
- Claim / Evidence ID 唯一；
- 核心 Claim 有 SourceRef；
- SourceRef 能回到实际页面 / Block；
- External Verification 来源存在；
- blocked Claim 不能进入 selected angle；
- 脚本使用的 Claim 全部存在；
- 所有 JSON Schema 通过；
- Fingerprint 能正确失效缓存；
- 局部重跑不修改无关章节；
- 低置信度核心证据无法绕过质量门。

## 28. Editorial Acceptance

准备 3～5 本人工熟悉的 Gold Test Books，每本建立：

- 真正 Core Thesis；
- 3～5 个关键 Claim；
- 关键 Evidence；
- 一个容易误读点；
- 一个重要局限；
- 1～3 个值得拍的角度。

### A/B Test

Baseline A：普通模型直接接 PDF，要求“总结并写 5 分钟解说”。

AI Video Factory B：完整执行分层深读 + 跨章节综合 + 外部核验 + Auditor + Angle Engine + Script Gate。

盲评指标：准确理解、误读程度、论证链、证据、适用范围、独立判断、现实价值、“像不像真正读过”、是否值得花 5 分钟看完。

核心目标：

- Human Deep Reading Rating >= 8.0 / 10；
- 相比普通摘要 Baseline 至少提高 1.5 分。

未达到则不视为 V1 成功。

## 29. 三道最终质量门

```text
Gate 1：Deep Reading Quality
Score >= 75，推荐 >= 85，且无 BLOCK
↓
Gate 2：Video Angle Eligibility
证据完整、标题诚实、适合 5 分钟、不依赖 unverified 核心内容
↓
Gate 3：Script Quality
Score >= 80，且无 BLOCK
↓
Storyboard → Voice → Subtitle → Remotion
```

## 30. V1 成功定义

V1 必须同时满足：

1. 中文 / 日文 / 英文非虚构书进入同一流程；
2. 电子 / 扫描 / 复杂图表 PDF 能结构化并保留来源；
3. 全书主要章节覆盖，核心章节二次深挖；
4. 核心命题和重要 Claim 有 Evidence 链；
5. 作者观点和外部核验严格分离；
6. 能识别 Claim 的适用范围与局限；
7. 外部核验只针对高价值内容；
8. Auditor 能阻止明显误读、翻译失真、过度推论和无来源信息；
9. 一本书读一次可生成 Top 3～5 视频角度并自动推荐第一名；
10. 可生成约 5 分钟问题驱动型深度解说脚本；
11. 可直接接入现有 Storyboard、自然中文配音、字幕和 Remotion；
12. Gold Book A/B Test 达到人工评分目标。

## 31. 总体流程

```text
Book PDF（zh / ja / en）
↓
Round 0 文档结构化
↓
Round 1 全书鸟瞰
↓
Round 2 全章节 Claim-first 深读
↓
Round 3 核心章节二次深挖
↓
Round 4 跨章节综合
↓
Round 5 选择性外部核验
↓
Round 6 独立 Auditor
↓
Deep Reading Score / Gate
↓
8～12 个初始 Video Angles
↓
Eligibility + Scoring
↓
Top 3～5
↓
自动推荐 / 人工可改选
↓
Selected Angle + Content Budget
↓
约 5 分钟 Script
↓
Script Quality Gate
↓
Storyboard
↓
自然中文配音
↓
动态字幕
↓
Remotion
↓
1080×1920 MP4
```

Book Deep Reading V1 的本质不是“摘要更长”，而是建立可验证知识链：

**原书 → Claim → Evidence → 跨章节理解 → 外部核验 → 独立判断 → 视频角度 → 五分钟解说。**
