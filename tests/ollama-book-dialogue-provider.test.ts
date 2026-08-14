import {describe, expect, it} from "vitest";
import {OllamaBookDialogueProvider} from "../src/research/book/ollama-book-dialogue-provider";
import {DialogueDraftSchema} from "../src/research/book/book-dialogue-schema";
import {makeDialogueDraft} from "./fixtures/book-dialogue";

describe("Ollama book dialogue provider", () => {
  it("requests strict structured true dialogue from local qwen", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = new OllamaBookDialogueProvider({model:"qwen3:14b",fetch:async (input,init) => {
      expect(String(input)).toBe("http://127.0.0.1:11434/api/chat");
      requestBody=JSON.parse(String(init?.body));
      return new Response(`${JSON.stringify({message:{content:JSON.stringify(makeDialogueDraft())}})}\n`,{status:200});
    }});
    const result=await provider.generate({lockedScript:{title:"锁定脚本"},selectedAngle:{title:"锁定角度"},synthesis:{coreThesis:[]},chapters:[],deepReads:[]});
    expect(result.turns).toHaveLength(50);
    expect(requestBody?.model).toBe("qwen3:14b");
    expect(JSON.stringify(requestBody)).toContain("narrator");
    expect(JSON.stringify(requestBody)).toContain("Phase3C");
  });

  it("feeds one failed candidate and exact gate issues back for a bounded repair",async()=>{
    let body="";const previous=DialogueDraftSchema.parse(makeDialogueDraft());const provider=new OllamaBookDialogueProvider({model:"qwen3:14b",fetch:async(_input,init)=>{body=String(init?.body);return new Response(`${JSON.stringify({message:{content:JSON.stringify(previous)}})}\n`,{status:200});}});
    await provider.generate({lockedScript:{},selectedAngle:{},synthesis:{},chapters:[],deepReads:[]},{previous,qualityIssues:["存在 dangling sourceRefs","Phase3C critique 未进入真实对话"],allowedClaimIds:["claim-012-middle-class-social-function"],allowedSourceRefs:["chapter-012:264:p264-b20"]});
    expect(body).toContain("仅允许使用");expect(body).toContain("dangling sourceRefs");expect(body).toContain("Phase3C");
  });
});
