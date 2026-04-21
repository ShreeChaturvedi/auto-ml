import React from "react";

/** Miami University block-M, rendered inline so the `fill` colors are
 *  guaranteed to print and the shape stays vector at any scale. Viewbox
 *  and points lifted verbatim from `video/public/branding/miami-m.svg`. */
export const MiamiMark: React.FC<{ size: number }> = ({ size }) => {
  const aspect = 75.6 / 57;
  return (
    <svg
      viewBox="0 0 75.6 57"
      width={size * aspect}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
    >
      <polygon
        fill="#231F20"
        points="38.9,55 46.5,42.5 48.3,42.5 48.3,33.7 37.8,51.1 27.3,33.7 27.3,42.5 29.1,42.5 36.7,55 2.9,55 10.5,42.5 12.3,42.5 12.3,15 10.5,15 2.9,2.4 25.8,2.4 37.8,22.2 49.8,2.4 72.7,2.4 65.1,15 63.2,15 63.2,42.5 65.1,42.5 72.7,55"
      />
      <polygon
        fill="#C8102E"
        points="15.6,11.7 12.4,11.7 8.8,5.7 24,5.7 24,5.7 37.8,28.6 51.6,5.7 66.8,5.7 63.2,11.7 60,11.7 60,45.7 63.2,45.7 66.8,51.7 44.7,51.7 48.4,45.7 51.6,45.7 51.6,21.9 42.7,36.7 37.8,44.8 37.8,44.8 37.8,44.8 32.9,36.7 24,21.9 24,45.7 27.2,45.7 30.9,51.7 8.8,51.7 12.4,45.7 15.6,45.7"
      />
    </svg>
  );
};
