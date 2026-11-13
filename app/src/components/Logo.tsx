import Svg, { Path } from "react-native-svg";

const RATIO = 52.62 / 38.38;

// Solo la marca (el pájaro), en un único color.
export function Logo({ size = 96, opacity = 1, color = "#8f2f22", outline = false }: { size?: number; opacity?: number; color?: string; outline?: boolean }) {
  // `size` es el ancho; el alto sale de la proporción de la marca.
  return (
    <Svg width={size} height={size / RATIO} viewBox="0 0 52.62 38.38" opacity={opacity}>
      <Path fill={color} d="M30.74,15.35a3,3,0,1,1-.54-4.18A3,3,0,0,1,30.74,15.35Z" />
      <Path fill={outline ? "none" : color} stroke={outline ? color : "none"} strokeWidth={3} strokeLinejoin="round" d="M32.14,0A19.19,19.19,0,0,0,14.75,11.09l0-.07C6.49,10.81,0,16.25,0,16.25H13.17s5,2,7.41,5.68c.13-1.48.29-2.93.49-4.4a38.12,38.12,0,0,1,1-5,9.53,9.53,0,0,1,.81-2.14A5.38,5.38,0,0,1,24.6,8.55l.28-.18h0c.71-.31,1.39-.58,2.06-.82,11.44-4.2,20-.29,20.33-.13A19.1,19.1,0,0,0,32.14,0Z" />
      <Path fill={outline ? "none" : color} stroke={outline ? color : "none"} strokeWidth={3} strokeLinejoin="round" d="M35.51,11.81a6.46,6.46,0,0,1,.3,1.73A6.2,6.2,0,0,1,35,16.8a5.6,5.6,0,0,1-2,2.09,23.69,23.69,0,0,1-3.35,1.84c-2.08,1-4.22,1.79-6.38,2.55l-.57.21a6.68,6.68,0,0,1,.47,1.78A17.12,17.12,0,0,1,22,34.57,19.19,19.19,0,0,0,52.62,19.19v-4S49.38,9.39,35.51,11.81Z" />
    </Svg>
  );
}
