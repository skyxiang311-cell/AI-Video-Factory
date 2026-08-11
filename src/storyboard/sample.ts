import sampleJson from "../../templates/knowledge/sample-storyboard.json";
import {parseStoryboard} from "./schema";

export const sampleStoryboard = parseStoryboard(sampleJson);
