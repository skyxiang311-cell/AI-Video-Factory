import sampleJson from "../../templates/knowledge/sample-storyboard.json";
import {parseVisualStoryboard} from "./visual-schema";

export const sampleStoryboard = parseVisualStoryboard(sampleJson);
