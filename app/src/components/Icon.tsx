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
