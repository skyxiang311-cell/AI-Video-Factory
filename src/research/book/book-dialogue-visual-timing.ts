type DialogueVisualBeat={atMs:number;kind:"cut"|"pose-change"|"reaction"|"diagram-change"|"caption-emphasis"};
export const resolveDialogueVisualState=(input:{localMs:number;speaker:string;characterPose:string;visualBeats:DialogueVisualBeat[]})=>{
  const revealed=input.visualBeats.filter((beat)=>beat.atMs<=Math.max(0,input.localMs));const activeBeatIndex=Math.max(0,revealed.length-1);const activeKind=revealed.at(-1)?.kind??"cut";
  const characterPose=activeKind==="reaction"?(input.speaker==="douzai"?"shock":"surprised"):activeKind==="pose-change"?(input.speaker==="xiaoyuan"?"point":"realize"):activeKind==="caption-emphasis"?"serious":activeKind==="diagram-change"?"summary":input.characterPose;
  return {activeBeatIndex,activeKind,characterPose,bubbleScale:[1,1.08,.96,1.05][activeBeatIndex%4]!,diagramReveal:activeKind==="diagram-change"||activeBeatIndex>=2,emphasis:activeKind==="caption-emphasis"};
};
