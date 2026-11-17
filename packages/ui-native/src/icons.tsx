import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "./theme";

type Shape =
  | { d: string }
  | { cx: number; cy: number; r: number; fill?: boolean };

/** 24×24 stroke icons drawn for Be Fast. Paths use round caps and joins. */
const shapes = {
  home: [{ d: "M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z" }],
  bag: [
    { d: "M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" },
    { d: "M5.5 8.5h13l-.9 11a1.5 1.5 0 0 1-1.5 1.4H7.9a1.5 1.5 0 0 1-1.5-1.4z" },
  ],
  receipt: [
    { d: "M6 3.5h12v17l-2.5-1.6-2.3 1.6-2.4-1.6-2.3 1.6L6 18.9z" },
    { d: "M9 8.5h6M9 12h6M9 15.5h3.5" },
  ],
  user: [
    { cx: 12, cy: 8, r: 4 },
    { d: "M4.5 20.5a7.5 7.5 0 0 1 15 0" },
  ],
  search: [{ cx: 11, cy: 11, r: 6.5 }, { d: "m20 20-4.2-4.2" }],
  pin: [
    { d: "M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" },
    { cx: 12, cy: 10, r: 2.4 },
  ],
  clock: [{ cx: 12, cy: 12, r: 8.5 }, { d: "M12 7.5V12l3 2" }],
  scooter: [
    { cx: 6, cy: 17, r: 2.5 },
    { cx: 18, cy: 17, r: 2.5 },
    { d: "M8.5 17h5.5l2.5-7.5H19" },
    { d: "M14.5 9.5 13 6h-2.5M3.5 12.5h6l1.5 4.5" },
  ],
  plus: [{ d: "M12 5v14M5 12h14" }],
  minus: [{ d: "M5 12h14" }],
  back: [{ d: "m9.5 5.5 6.5 6.5-6.5 6.5" }],
  forward: [{ d: "m14.5 5.5-6.5 6.5 6.5 6.5" }],
  down: [{ d: "m6 9.5 6 6 6-6" }],
  check: [{ d: "m5 12.5 4.5 4.5L19 7.5" }],
  close: [{ d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }],
  store: [
    { d: "M4 9.5 5.6 4h12.8L20 9.5" },
    { d: "M4 9.5h16v1a3 3 0 0 1-5.3 1.9 3 3 0 0 1-5.4 0A3 3 0 0 1 4 10.5z" },
    { d: "M5.5 13.5V20h13v-6.5M10 20v-4.5h4V20" },
  ],
  phone: [
    {
      d: "M5.5 4h3.3l1.7 4.3-2.2 1.4a10.5 10.5 0 0 0 5.9 5.9l1.4-2.2 4.3 1.7v3.3a1.8 1.8 0 0 1-1.9 1.8A15.5 15.5 0 0 1 3.7 5.9 1.8 1.8 0 0 1 5.5 4z",
    },
  ],
  trash: [{ d: "M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 12.5a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M9.5 7V4.5h5V7" }],
  edit: [{ d: "M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z" }, { d: "m13.5 6.5 4 4" }],
  flame: [{ d: "M12 3c.8 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2 .9-3.4 2-4.6.1 1.8 1 2.9 2.1 2.9.2-3-1.6-5.2.9-8.3z" }],
  star: [{ d: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" }],
  list: [{ d: "M8.5 6.5h11M8.5 12h11M8.5 17.5h11" }, { cx: 4.8, cy: 6.5, r: 1, fill: true }, { cx: 4.8, cy: 12, r: 1, fill: true }, { cx: 4.8, cy: 17.5, r: 1, fill: true }],
  chart: [{ d: "M4 20.5h16M6.5 17v-5M11 17V7M15.5 17v-7.5M20 17V4" }],
  sliders: [
    { d: "M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" },
    { cx: 15, cy: 7, r: 2 },
    { cx: 9, cy: 12, r: 2 },
    { cx: 17, cy: 17, r: 2 },
  ],
  bell: [{ d: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" }, { d: "M10 20.5a2 2 0 0 0 4 0" }],
  wifiOff: [
    { d: "M3 3l18 18" },
    { d: "M8.5 16a5 5 0 0 1 6.2-.6M5 12.5a10 10 0 0 1 4.4-2.3M19 12.5a10 10 0 0 0-3-1.8M2 9a15 15 0 0 1 4.2-2.6M22 9a15 15 0 0 0-9.4-3.9" },
    { cx: 12, cy: 19.5, r: 1, fill: true },
  ],
  logout: [{ d: "M14.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M9.5 8 5.5 12l4 4M5.5 12H15" }],
  alert: [{ d: "M12 4 2.8 19.5h18.4z" }, { d: "M12 10v4" }, { cx: 12, cy: 16.8, r: 1, fill: true }],
  info: [{ cx: 12, cy: 12, r: 8.5 }, { d: "M12 11v5" }, { cx: 12, cy: 8, r: 1, fill: true }],
  note: [{ d: "M6 3.5h9l3.5 3.5v13.5H6z" }, { d: "M9 11h6.5M9 14.5h6.5M9 18h3.5" }],
  box: [{ d: "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" }, { d: "M3.5 7.5 12 11.5l8.5-4M12 11.5v9" }],
  pause: [{ d: "M9 5.5v13M15 5.5v13" }],
  play: [{ d: "M7.5 5.5v13l11-6.5z" }],
  refresh: [{ d: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15" }],
  chef: [
    { d: "M7 13.5A3.8 3.8 0 0 1 7.6 6a4.6 4.6 0 0 1 8.8 0 3.8 3.8 0 0 1 .6 7.5V19H7z" },
    { d: "M7 16h10" },
  ],
  users: [
    { cx: 9, cy: 8.5, r: 3.5 },
    { d: "M3 20a6 6 0 0 1 12 0M16 5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-3.5-5.4" },
  ],
  bolt: [{ d: "M13 3 5 13.5h6L10 21l8-10.5h-6z" }],
  cash: [{ d: "M3 6.5h18v11H3z" }, { cx: 12, cy: 12, r: 2.6 }, { d: "M6.5 9.5v5M17.5 9.5v5" }],
  sparkle: [{ d: "M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5zM18.5 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z" }],
  gift: [{ d: "M4 9.5h16v4H4zM5.5 13.5v7h13v-7M12 9.5v11" }, { d: "M12 9.5S10.5 4.5 8 5.2c-2 .6-1 4.3 4 4.3zm0 0s1.5-5 4-4.3c2 .6 1 4.3-4 4.3z" }],
} satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof shapes;

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const { palette } = useTheme();
  const stroke = color ?? palette.ink;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={palette.transparent}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {(shapes[name] as readonly Shape[]).map((shape, index) =>
        "d" in shape ? (
          <Path
            key={index}
            d={shape.d}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            stroke={shape.fill ? palette.transparent : stroke}
            strokeWidth={strokeWidth}
            fill={shape.fill ? stroke : palette.transparent}
          />
        ),
      )}
    </Svg>
  );
}
