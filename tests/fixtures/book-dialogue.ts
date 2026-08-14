const ref = {type: "book" as const, chapterId: "chapter-012", page: 264, blockId: "p264-b20"};

export const makeDialogueDraft = () => ({
  schemaVersion: "1.0" as const,
  title: "中产阶层与社会稳定",
  selectedAngleId: "angle-001",
  centralQuestion: "中产阶层为什么被作者视为社会稳定的重要力量？",
  targetDurationSec: 300 as const,
  turns: Array.from({length: 50}, (_, index) => {
    const speaker = index === 20 || index === 40 ? "narrator" : [0,1,3].includes(index % 5) ? "xiaoyuan" : "douzai";
    const phase3c = index === 34;
    const voiceText = phase3c ? "等等，这个观察能直接证明因果吗，还是只能说明书中看到的相关现象？" : speaker === "douzai" ? `那第${index + 1}个问题到底能由这条原文证据直接说明什么，范围又到哪里？` : `这里根据作者原文解释第${index + 1}个知识点，并明确它适用的范围，不把观察外推。`;
    return {id:`dialogue-turn-${String(index+1).padStart(3,"0")}`,speaker,text:voiceText,voiceText,purpose:phase3c?"phase3c_challenge":speaker==="douzai"?"follow_up":speaker==="narrator"?"transition":"explanation",claimIds:index>1?["claim-012-middle-class-social-function"]:[],sourceRefs:index>1?[ref]:[],emotion:speaker==="douzai"?"curious":"serious",characterPose:speaker==="douzai"?"ask":speaker==="xiaoyuan"?"explain":"neutral",visualIntent:index%10===0?"info_card":speaker==="douzai"?"douzai_closeup":"xiaoyuan_closeup"};
  }),
});
