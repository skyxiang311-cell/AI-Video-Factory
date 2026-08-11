import type {VisualStoryboard} from "../../../storyboard/visual-schema";

type BrandingMarkProps = {
  branding: VisualStoryboard["branding"];
  color: string;
};

export const BrandingMark = ({branding, color}: BrandingMarkProps) => {
  if (!branding.enabled) {
    return null;
  }

  return (
    <div
      style={{
        color,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: 3,
        marginLeft: branding.position === "top-right" ? "auto" : 0,
      }}
    >
      {branding.label}
    </div>
  );
};
