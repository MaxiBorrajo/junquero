import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

type Shape = { kind: "path"; d: string } | { kind: "circle"; cx: number; cy: number; r: number } | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number };

const path = (d: string): Shape => ({ kind: "path", d });

export const icons = {
  map: [
    path("M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"),
    path("M15 5.764v15"),
    path("M9 3.236v15"),
  ],
  briefcase: [path("M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"), { kind: "rect", x: 2, y: 6, width: 20, height: 14, rx: 2 }],
  message: [path("M7.9 20A9 9 0 1 0 4 16.1L2 22Z")],
  user: [path("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"), { kind: "circle", cx: 12, cy: 7, r: 4 }],
  back: [path("m12 19-7-7 7-7"), path("M19 12H5")],
  camera: [path("M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"), { kind: "circle", cx: 12, cy: 13, r: 3 }],
  image: [{ kind: "rect", x: 3, y: 3, width: 18, height: 18, rx: 2 }, { kind: "circle", cx: 9, cy: 9, r: 2 }, path("m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21")],
  file: [path("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"), path("M14 2v4a2 2 0 0 0 2 2h4")],
  close: [path("M18 6 6 18"), path("m6 6 12 12")],
  calendar: [path("M8 2v4"), path("M16 2v4"), { kind: "rect", x: 3, y: 4, width: 18, height: 18, rx: 2 }, path("M3 10h18")],
  pin: [path("M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"), { kind: "circle", cx: 12, cy: 10, r: 3 }],
  minus: [path("M5 12h14")],
  plus: [path("M5 12h14"), path("M12 5v14")],
  expand: [path("M8 3H5a2 2 0 0 0-2 2v3"), path("M21 8V5a2 2 0 0 0-2-2h-3"), path("M3 16v3a2 2 0 0 0 2 2h3"), path("M16 21h3a2 2 0 0 0 2-2v-3")],
  search: [{ kind: "circle", cx: 11, cy: 11, r: 8 }, path("m21 21-4.3-4.3")],
  locate: [{ kind: "circle", cx: 12, cy: 12, r: 7 }, { kind: "circle", cx: 12, cy: 12, r: 2 }, path("M2 12h3"), path("M19 12h3"), path("M12 2v3"), path("M12 19v3")],
  bell: [path("M10.268 21a2 2 0 0 0 3.464 0"), path("M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326")],
  chevron: [path("m9 18 6-6-6-6")],
  refresh: [path("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"), path("M21 3v5h-5"), path("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"), path("M8 16H3v5")],
  list: [path("M3 6h.01"), path("M3 12h.01"), path("M3 18h.01"), path("M8 6h13"), path("M8 12h13"), path("M8 18h13")],
  filter: [path("M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z")],
  globe: [{ kind: "circle", cx: 12, cy: 12, r: 10 }, path("M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"), path("M2 12h20")],
  logout: [path("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"), path("m16 17 5-5-5-5"), path("M21 12H9")],
  bird: [path("M16 7h.01"), path("M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"), path("m20 7 2 .5-2 .5"), path("M10 18v3"), path("M14 17.75V21"), path("M7 18a6 6 0 0 0 3.84-10.61")],
  scale: [path("m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"), path("m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"), path("M7 21h10"), path("M12 3v18"), path("M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2")],
  edit: [path("M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"), path("m15 5 4 4")],
  copy: [{ kind: "rect", x: 8, y: 8, width: 14, height: 14, rx: 2 }, path("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2")],
  send: [path("M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"), path("m21.854 2.147-10.94 10.939")],
  users: [path("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"), { kind: "circle", cx: 9, cy: 7, r: 4 }, path("M22 21v-2a4 4 0 0 0-3-3.87"), path("M16 3.13a4 4 0 0 1 0 7.75")],
  wallet: [path("M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"), path("M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4")],
  clock: [{ kind: "circle", cx: 12, cy: 12, r: 10 }, path("M12 6v6l4 2")],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: ColorValue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name].map((shape, index) => {
        if (shape.kind === "path") return <Path key={index} d={shape.d} />;
        if (shape.kind === "circle") return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        return <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
      })}
    </Svg>
  );
}
