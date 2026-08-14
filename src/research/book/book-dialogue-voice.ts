import {createHash} from "node:crypto";
import type {MacOsSayVoiceSettings} from "../../voice/macos-say-tts-adapter";
import type {DialogueDraft} from "./book-dialogue-schema";

export const DIALOGUE_VOICE_SETTINGS={
  xiaoyuan:{voice:"Flo (中文（中国大陆）)",rate:200},
  douzai:{voice:"Eddy (中文（中国大陆）)",rate:210},
  narrator:{voice:"Reed (中文（中国大陆）)",rate:200},
} as const satisfies Record<"xiaoyuan"|"douzai"|"narrator",MacOsSayVoiceSettings>;

export const buildDialogueVoiceFingerprint=(draft:DialogueDraft):string=>createHash("sha256").update(JSON.stringify({version:"dialogue-voice-v2-local",voices:DIALOGUE_VOICE_SETTINGS,turns:draft.turns.map((turn)=>[turn.id,turn.speaker,turn.voiceText])})).digest("hex");
