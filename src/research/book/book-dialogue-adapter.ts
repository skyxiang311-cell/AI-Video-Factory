import {DialogueDraftSchema,type DialogueDraft} from "./book-dialogue-schema";
import type {BookDeepScript} from "./book-script-schema";

type Segment=BookDeepScript["segments"][number];
type Purpose=DialogueDraft["turns"][number]["purpose"];
type Prompt={before:number;text:string;purpose:Purpose;emotion:"curious"|"skeptical"|"confused"|"realizing";pose:"ask"|"skeptical"|"confused"|"realize";visual:"douzai_closeup"|"douzai_reaction"|"character_comparison"|"two_shot"};
type PlannedTurn={segment:Segment;voiceText:string;speaker:"xiaoyuan"|"douzai"|"narrator";purpose:Purpose;traceIndex:number;emotion:DialogueDraft["turns"][number]["emotion"];pose:DialogueDraft["turns"][number]["characterPose"];visual:DialogueDraft["turns"][number]["visualIntent"]};

const splitCompleteSentences=(text:string):string[]=>(text.match(/[^。！？!?；;]+[。！？!?；;]?/gu)??[text]).map((sentence)=>sentence.trim()).filter((sentence)=>[...sentence.replace(/\s/gu,"")].length>=4);
const asQuestion=(text:string)=>/[？?]$/u.test(text)?text:`${text.replace(/[。！!；;]+$/u,"")}？`;
const selectedSentenceIndexes:Partial<Record<Segment["purpose"],number[]>>={
  audience_relevance:[0,3],
  author_core_judgment:[0,1,2,4],
  strongest_evidence:[0,1,4,5],
  second_layer_mechanism:[0,1,2,5],
  critical_turn:[0,1,2,3,4],
  system_judgment:[0,2,4,5,6,7,8],
};
const sectionTransitions:Partial<Record<Segment["purpose"],string>>={
  strongest_evidence:"镜头转向书中的直接材料。",
  second_layer_mechanism:"数字看完，再往结构深处走。",
  critical_turn:"接下来，把结论放回它的适用边界。",
  system_judgment:"最后，把作者观点、证据和限制放在一起。",
};
const prompts:Partial<Record<Segment["purpose"],Prompt[]>>={
  audience_relevance:[
    {before:0,text:"先等等，书里的“中产”和日常收入标签，是一回事吗？",purpose:"question",emotion:"curious",pose:"ask",visual:"douzai_closeup"},
    {before:3,text:"那怎么避免把自己的直觉，偷偷塞进作者的概念里？",purpose:"follow_up",emotion:"confused",pose:"confused",visual:"two_shot"},
  ],
  author_core_judgment:[
    {before:0,text:"好，那作者真正的核心判断是什么？",purpose:"question",emotion:"curious",pose:"ask",visual:"douzai_closeup"},
    {before:1,text:"这个判断听起来很强，作者给出的解释链是什么？",purpose:"follow_up",emotion:"skeptical",pose:"skeptical",visual:"character_comparison"},
    {before:2,text:"等等，这个住房数字是结论，还是理解生活方式的一条材料？",purpose:"challenge",emotion:"skeptical",pose:"skeptical",visual:"character_comparison"},
    {before:4,text:"要判断这条主张站不站得住，具体要核对什么？",purpose:"follow_up",emotion:"curious",pose:"ask",visual:"two_shot"},
  ],
  strongest_evidence:[
    {before:0,text:"书里拿出的直接材料是什么，比如先从收入口径说起？",purpose:"question",emotion:"curious",pose:"ask",visual:"douzai_closeup"},
    {before:4,text:"看到这么具体的数字，就能当成所有时期的统一标准吗？",purpose:"challenge",emotion:"skeptical",pose:"skeptical",visual:"douzai_reaction"},
    {before:5,text:"那怎样才算证据真的撑住结论，而不是只看起来醒目？",purpose:"follow_up",emotion:"curious",pose:"ask",visual:"two_shot"},
  ],
  second_layer_mechanism:[
    {before:0,text:"如果不只盯着收入，解释里还有哪些层次？",purpose:"question",emotion:"curious",pose:"ask",visual:"douzai_closeup"},
    {before:1,text:"那作者把这些因素和社会中间层怎么联系起来？",purpose:"follow_up",emotion:"curious",pose:"ask",visual:"two_shot"},
    {before:2,text:"这里说的是相关，还是已经证明了谁导致谁？",purpose:"challenge",emotion:"skeptical",pose:"skeptical",visual:"character_comparison"},
    {before:3,text:"跨章节摆在一起，怎么避免把相似词当成同一条论证？",purpose:"follow_up",emotion:"confused",pose:"confused",visual:"two_shot"},
    {before:5,text:"所以最后还得回到每个词自己的上下文，对吗？",purpose:"understanding",emotion:"realizing",pose:"realize",visual:"douzai_reaction"},
  ],
  critical_turn:[
    {before:0,text:"等等，这个判断能直接外推到所有国家和时期吗？",purpose:"phase3c_challenge",emotion:"skeptical",pose:"skeptical",visual:"douzai_reaction"},
    {before:1,text:"原来关键不是结论响亮，而是先看样本边界？",purpose:"understanding",emotion:"realizing",pose:"realize",visual:"douzai_reaction"},
    {before:2,text:"范围有限可以理解，可作者把具体原因也证明了吗？",purpose:"challenge",emotion:"skeptical",pose:"skeptical",visual:"character_comparison"},
    {before:3,text:"所以提出这些质疑，是推翻原书，还是画清证据边界？",purpose:"follow_up",emotion:"confused",pose:"confused",visual:"two_shot"},
  ],
  system_judgment:[
    {before:0,text:"把作者观点、证据和限制放回来，我们能下多强的判断？",purpose:"question",emotion:"curious",pose:"ask",visual:"douzai_closeup"},
    {before:2,text:"普通人自己读这类书，有没有一套不容易跑偏的框架？",purpose:"follow_up",emotion:"curious",pose:"ask",visual:"two_shot"},
    {before:5,text:"除了结构变化，中产的发展趋势也要放进来，对吗？",purpose:"understanding",emotion:"realizing",pose:"realize",visual:"douzai_reaction"},
    {before:7,text:"做完这些，怎样避免被一个醒目的材料带着走？",purpose:"challenge",emotion:"skeptical",pose:"skeptical",visual:"character_comparison"},
    {before:8,text:"所以重点不是全盘接受，而是把证据边界也一起记住？",purpose:"understanding",emotion:"realizing",pose:"realize",visual:"douzai_reaction"},
  ],
  memorable_ending:[
    {before:0,text:"最后，如果只留下一句不夸大的结论，会是什么？",purpose:"question",emotion:"curious",pose:"ask",visual:"two_shot"},
  ],
};

const xiaoyuanPurpose=(purpose:Segment["purpose"]):Purpose=>purpose==="strongest_evidence"?"evidence":purpose==="memorable_ending"?"summary":purpose==="hook_extension"?"answer":purpose==="system_judgment"?"summary":"explanation";
const stableWindow=<T>(items:T[],maximum:number,index:number):T[]=>{if(items.length<=maximum)return items;const windows=Math.ceil(items.length/maximum);const start=(index%windows)*maximum;return items.slice(start,start+maximum);};
const xVisual=(purpose:Segment["purpose"]):DialogueDraft["turns"][number]["visualIntent"]=>purpose==="strongest_evidence"?"character_data":purpose==="second_layer_mechanism"?"character_diagram":purpose==="system_judgment"||purpose==="memorable_ending"?"both_summary":"xiaoyuan_explains";

const planSegment=(segment:Segment):PlannedTurn[]=>{
  const sentences=splitCompleteSentences(segment.voiceText);
  if(segment.purpose==="primary_hook")return [{segment,voiceText:asQuestion(sentences[0]!),speaker:"douzai",purpose:"hook",traceIndex:0,emotion:"curious",pose:"question",visual:"douzai_closeup"}];
  const requested=selectedSentenceIndexes[segment.purpose]??sentences.map((_,index)=>index);
  const indexes=requested.filter((index)=>index<sentences.length);
  const sectionPrompts=prompts[segment.purpose]??[];
  const planned=indexes.flatMap((sentenceIndex)=>{
    const question=sectionPrompts.find((candidate)=>candidate.before===sentenceIndex);
    const planned:PlannedTurn[]=[];
    if(question)planned.push({segment,voiceText:question.text,speaker:"douzai",purpose:question.purpose,traceIndex:sentenceIndex,emotion:question.emotion,pose:question.pose,visual:question.visual});
    planned.push({segment,voiceText:sentences[sentenceIndex]!,speaker:"xiaoyuan",purpose:segment.purpose==="critical_turn"&&sentenceIndex===0?"correction":xiaoyuanPurpose(segment.purpose),traceIndex:sentenceIndex,emotion:segment.purpose==="critical_turn"?"serious":"warm",pose:segment.purpose==="critical_turn"?"stop":"explain",visual:xVisual(segment.purpose)});
    return planned;
  });
  const transition=sectionTransitions[segment.purpose];
  return transition?[{segment,voiceText:transition,speaker:"narrator",purpose:"transition",traceIndex:0,emotion:"neutral",pose:"neutral",visual:"two_shot"},...planned]:planned;
};

export const buildDeterministicDialogueDraft=(script:BookDeepScript):DialogueDraft=>{
  const planned=script.segments.flatMap(planSegment);
  if(planned.length<45||planned.length>65)throw new Error(`锁定扩展稿必须可稳定拆分为45–65个对话回合，当前为${planned.length}`);
  const turns=planned.map((turn,index)=>({
    id:`dialogue-turn-${String(index+1).padStart(3,"0")}`,
    speaker:turn.speaker,
    text:turn.voiceText,
    voiceText:turn.voiceText,
    purpose:turn.purpose,
    claimIds:turn.speaker==="narrator"?[]:stableWindow(turn.segment.claimIds,6,turn.traceIndex),
    sourceRefs:turn.speaker==="narrator"?[]:stableWindow(turn.segment.sourceRefs,8,turn.traceIndex),
    emotion:turn.emotion,
    characterPose:turn.pose,
    visualIntent:turn.visual,
  }));
  return DialogueDraftSchema.parse({schemaVersion:"1.0",title:script.title,selectedAngleId:script.selectedAngleId,centralQuestion:script.centralQuestion,targetDurationSec:300,turns});
};
