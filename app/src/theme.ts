export const colors = {
  brick: "#8F2F22",
  sand: "#E7C98B",
  background: "#F4EEE6",
  map: "#E8DFD3",
  ink: "#231815",
  error: "#A3174E",
  success: "#1F7A45",
  warning: "#8A5A00",
  white: "#FFFFFF",
  muted: "#6B5C57",
  line: "#D9CDBE",
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const fonts = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
  extrabold: "Outfit_800ExtraBold",
} as const;

export const text = {
  title: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  subtitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  amount: { fontFamily: fonts.extrabold, fontSize: 32, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  secondary: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  button: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
} as const;
