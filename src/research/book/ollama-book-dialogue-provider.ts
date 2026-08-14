import {DialogueDraftSchema, type DialogueDraft} from "./book-dialogue-schema";
import {readOllamaResponse,toOllamaSchema,type OllamaFetch} from "./ollama-structured-json";

const OLLAMA_URL="http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL="qwen3:14b";
const FORMAT=toOllamaSchema(DialogueDraftSchema);
const INSTRUCTIONS=[
  "你是 Book Deep Reading Phase 6.3 真双人对话适配器。只能重构叙事层，严禁改变输入的核心结论、数字、证据链、Claim IDs 或 source refs，严禁补充书外事实。",
  "输出简体中文真实对话，speaker 只允许 xiaoyuan、douzai、narrator；全片50-58 turns，总可读字数1350-1500，目标真实口播约300秒。",
  "小圆约55-65%，至少20 turns；豆仔约30-40%，至少15 turns；narrator仅必要转场且字符占比不超过10%。小圆最多连续2-3 turns。",
  "豆仔必须提出有实质内容的问题、误解、追问或证据质疑，禁止只说‘嗯/真的吗/原来如此’。每4-5 turns内至少出现一次豆仔推动解释。",
  "每个主要知识点按 Question→Answer→Follow-up/Challenge→Explanation→Understanding/Twist 推进；单个turn约20-38个汉字，避免小圆连续独白超过15秒。",
  "Phase3C 的 evidenceLimits、causalAssessment、scopeCorrections、tensions/contradictions 必须通过豆仔质疑→小圆纠正形成至少一组真实对话，purpose 使用 phase3c_challenge 与 correction。",
  "豆仔涉及未经证实内容时必须用疑问句或假设表达，不得把推测写成事实；禁止无证据的导致/造成/决定/必然。",
  "所有涉及作者观点、数字、证据或批评的turn必须复制输入中真实claimIds/sourceRefs；不得创建新ID或引用。开场与纯转场可为空。",
  "视觉以人物/情景为主，info_card不得超过总turn的20%；reaction、closeup、two_shot、character_data/diagram/comparison、mini_theater交替使用。",
  "漫画气泡只会显示短反应，完整语言由字幕承载；text与voiceText保持一致、自然口语。turn id严格从dialogue-turn-001连续递增。",
  "严格输出Schema JSON，不要Markdown，不要额外字段。",
].join("\n");

export interface BookDialogueInput {lockedScript:unknown;selectedAngle:unknown;synthesis:unknown;chapters:unknown[];deepReads:unknown[]}
export interface DialogueRepairInput {previous:DialogueDraft;qualityIssues:string[];allowedClaimIds:string[];allowedSourceRefs:string[]}
interface Options {model:string;fetch?:OllamaFetch}

export class OllamaBookDialogueProvider{
  readonly provider="ollama"; readonly model:string; private readonly request:OllamaFetch;
  constructor({model,fetch:request=fetch}:Options){this.model=model;this.request=request;}
  async generate(input:BookDialogueInput,repair?:DialogueRepairInput):Promise<DialogueDraft>{
    const repairInstructions=repair?[
      "这是唯一一次定向修复。必须修复下面的质量门问题，不得扩大内容范围：",
      ...repair.qualityIssues.map((issue)=>`- ${issue}`),
      `claimIds 仅允许使用：${repair.allowedClaimIds.join(", ")}`,
      `sourceRefs 仅允许使用：${repair.allowedSourceRefs.join(", ")}`,
      "不得新增上述列表之外的 Claim ID 或 sourceRef。无法可靠绑定时留空，不要猜测。",
      "必须包含至少一组豆仔的实质质疑（purpose=phase3c_challenge），紧接小圆的范围或因果纠正（purpose=correction）。",
      "任意连续5个 turns 内必须至少有一个豆仔的实质提问、追问、反驳或误解澄清。",
    ].join("\n"):"";
    const userContent=repair?{input,previousCandidate:repair.previous,qualityIssues:repair.qualityIssues}:input;
    const response=await this.request(OLLAMA_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:this.model,stream:true,think:false,format:FORMAT,options:{num_ctx:32768,num_predict:16384,temperature:.15},messages:[{role:"system",content:[INSTRUCTIONS,repairInstructions].filter(Boolean).join("\n\n")},{role:"user",content:JSON.stringify(userContent)}]})});
    const body=await readOllamaResponse(response);
    if(!response.ok) throw new Error(`Ollama dialogue request failed (${response.status}): ${body.error??"unknown error"}`);
    if(!body.content.trim()) throw new Error("Ollama dialogue response contained no content");
    return DialogueDraftSchema.parse(JSON.parse(body.content));
  }
}

export const createOllamaBookDialogueProviderFromEnv=(env:Record<string,string|undefined>=process.env)=>new OllamaBookDialogueProvider({model:env.OLLAMA_BOOK_DIALOGUE_MODEL?.trim()||DEFAULT_MODEL});
