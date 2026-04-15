import { useVideoConfig } from "remotion";
import { REGULAR_FONT } from "../../../config/fonts";

const formatTimestamp = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
};

export const TableOfContentItem: React.FC<{
  title: string;
  startTime: number;
}> = ({ title, startTime }) => {
  const { fps } = useVideoConfig();
  const formatted = formatTimestamp(startTime / fps);

  return (
    <div
      style={{
        ...REGULAR_FONT,
        fontSize: 40,
        display: "flex",
        flexDirection: "row",
        width: "100%",
        lineHeight: 1.6,
      }}
    >
      <div style={{ flex: 1 }}>{title}</div>
      <div
        style={{
          width: 160,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          opacity: 0.6,
        }}
      >
        {formatted}
      </div>
    </div>
  );
};
