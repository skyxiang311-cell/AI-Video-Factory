import {createHash} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {BookDeepScriptSchema} from "../src/research/book/book-script-schema";
import {buildDeterministicDialogueDraft} from "../src/research/book/book-dialogue-adapter";
import {assertDialogueDraftQuality} from "../src/research/book/book-dialogue-quality";
import {atomicWriteJson} from "../src/shared/atomic-write";

const parseJobId=(argv:string[])=>{if(argv.length!==1||!argv[0]||!/^[a-z0-9][a-z0-9-]{2,63}$/u.test(argv[0]))throw new Error("Usage: npm run book:dialogue -- <job-id>");return argv[0];};
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const refKey=(ref:{chapterId:string;page:number;blockId:string})=>`${ref.chapterId}:${ref.page}:${ref.blockId}`;

const collectTraceability=(value:unknown,claims:Set<string>,refs:Set<string>):void=>{
  if(Array.isArray(value)){value.forEach((item)=>collectTraceability(item,claims,refs));return;}
  if(!value||typeof value!=="object")return;
  const record=value as Record<string,unknown>;
  for(const candidate of Object.values(record)){
    if(typeof candidate==="string"&&/^claim-[a-z0-9-]+$/u.test(candidate))claims.add(candidate);
    else collectTraceability(candidate,claims,refs);
  }
  if(record.type==="book"&&typeof record.chapterId==="string"&&typeof record.page==="number"&&typeof record.blockId==="string")refs.add(refKey(record as {chapterId:string;page:number;blockId:string}));
};

const compactChapter=(chapter:Record<string,unknown>)=>({chapterId:chapter.chapterId,title:chapter.title,chapterRole:chapter.chapterRole,summary:chapter.summary,importance:chapter.importance,claims:chapter.claims,evidence:chapter.evidence,limitations:chapter.limitations,quality:chapter.quality});
const compactDeepRead=(deep:Record<string,unknown>)=>({chapterId:deep.chapterId,evidenceLimits:deep.evidenceLimits,causalAssessment:deep.causalAssessment,scopeCorrections:deep.scopeCorrections,contradictions:deep.contradictions,finalJudgment:deep.finalJudgment,sourceRefs:deep.sourceRefs});

export const runBookDialogueCli=async(argv=process.argv.slice(2)):Promise<void>=>{
  const jobId=parseJobId(argv);const directory=resolve("output",jobId);const bookDirectory=resolve(directory,"book");
  const [scriptText,expandedScriptText,angleText,synthesisText,chapterNames,deepNames]=await Promise.all([readFile(resolve(directory,"script.json"),"utf8"),readFile(resolve(directory,"video-script.json"),"utf8"),readFile(resolve(bookDirectory,"selected-angle.json"),"utf8"),readFile(resolve(bookDirectory,"book-synthesis.json"),"utf8"),readdir(resolve(bookDirectory,"chapters")),readdir(resolve(bookDirectory,"deep-read"))]);
  const script=BookDeepScriptSchema.parse(JSON.parse(scriptText));if(script.quality.status!=="PASS"||script.quality.blockingIssues.length)throw new Error("锁定 script.json 未通过质量门");
  const expandedScript=BookDeepScriptSchema.parse(JSON.parse(expandedScriptText));if(expandedScript.quality.status!=="PASS"||expandedScript.quality.blockingIssues.length)throw new Error("锁定 video-script.json 未通过质量门");
  const angle=JSON.parse(angleText);const synthesis=JSON.parse(synthesisText);
  const chapters=(await Promise.all(chapterNames.filter((name)=>/^chapter-.+\.json$/u.test(name)).sort().map(async(name)=>compactChapter(JSON.parse(await readFile(resolve(bookDirectory,"chapters",name),"utf8"))))));
  const deepReads=(await Promise.all(deepNames.filter((name)=>/^chapter-.+\.json$/u.test(name)).sort().map(async(name)=>compactDeepRead(JSON.parse(await readFile(resolve(bookDirectory,"deep-read",name),"utf8"))))));
  const artifacts=[script,expandedScript,angle,synthesis,...chapters,...deepReads];const allowedClaimIds=new Set<string>();const allowedSourceRefs=new Set<string>();artifacts.forEach((artifact)=>collectTraceability(artifact,allowedClaimIds,allowedSourceRefs));
  const requiredClaimIds=new Set<string>([...expandedScript.segments.flatMap((segment)=>segment.claimIds),...(Array.isArray(angle.coreClaimIds)?angle.coreClaimIds:[])]);const requiredSourceRefs=new Set<string>(expandedScript.segments.flatMap((segment)=>segment.sourceRefs).map(refKey));
  const draft=buildDeterministicDialogueDraft(expandedScript);await atomicWriteJson(resolve(directory,"dialogue-candidate.json"),draft);
  const report=assertDialogueDraftQuality({draft,allowedClaimIds,allowedSourceRefs,requiredClaimIds,requiredSourceRefs});
  const sourceLock={schemaVersion:"1.0",jobId,provider:"deterministic",model:"locked-phase6.1-script",inputHashes:{script:sha(scriptText),expandedScript:sha(expandedScriptText),selectedAngle:sha(angleText),bookSynthesis:sha(synthesisText)},allowedClaimIds:[...allowedClaimIds].sort(),allowedSourceRefs:[...allowedSourceRefs].sort(),requiredClaimIds:[...requiredClaimIds].sort(),requiredSourceRefs:[...requiredSourceRefs].sort(),stats:{turnCount:report.turnCount,totalCharacters:report.totalCharacters,xiaoyuanTurns:report.xiaoyuanTurns,douzaiTurns:report.douzaiTurns,narratorTurns:report.narratorTurns}};
  await Promise.all([atomicWriteJson(resolve(directory,"dialogue-draft.json"),report.draft),atomicWriteJson(resolve(directory,"dialogue-source-lock.json"),sourceLock)]);
  console.log(JSON.stringify({jobId,adapter:sourceLock.model,...sourceLock.stats}));
};
if(process.argv[1]&&resolve(process.argv[1])===resolve("scripts/book-dialogue.ts"))await runBookDialogueCli();
