import type {z} from "zod";
import type {IconNameSchema} from "../../../storyboard/visual-schema";

type IconName = z.infer<typeof IconNameSchema>;

const paths: Record<IconName, string> = {
  book: "M5 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5V4Zm14 0h-5v16a3 3 0 0 1 3-3h2V4Z",
  brain: "M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5 3 3 0 0 0 3 4v1a3 3 0 0 0 4 2V5a3 3 0 0 0-3-1Zm6 0a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5 3 3 0 0 1-3 4v1a3 3 0 0 1-4 2V5a3 3 0 0 1 3-1Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",
  check: "m5 13 4 4L19 7",
  close: "M6 6l12 12M18 6 6 18",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v6l4 2",
  shuffle: "M4 7h3l10 10h3M17 7h3M4 17h3l3-3",
  repeat: "M5 8h12l-3-3m5 11H7l3 3",
  bookmark: "M7 4h10v17l-5-3-5 3V4Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
};

type IconProps = {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export const Icon = ({name, color, size = 48, strokeWidth = 1.8}: IconProps) => (
  <svg
    aria-hidden="true"
    height={size}
    viewBox="0 0 24 24"
    width={size}
    style={{display: "block"}}
  >
    <path
      d={paths[name]}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    />
  </svg>
);
