import { useColorScheme } from "react-native";

const light = {
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F1EE",
  border: "#E7E6E1",
  text: "#111111",
  textMuted: "#6B6B66",
  textFaint: "#9C9B95",
  accent: "#111111",
  accentText: "#FFFFFF",
  positive: "#1E8E5A",
  positiveBg: "#E7F5EE",
  warning: "#B26A00",
  warningBg: "#FFF3DF",
  danger: "#C2362B",
  dangerBg: "#FCEAE8",
  info: "#3B5BDB",
  infoBg: "#EBEFFE",
  bubbleCustomer: "#FFFFFF",
  bubbleAgent: "#111111",
  bubbleAgentText: "#FFFFFF",
  bubbleOwner: "#3B5BDB",
  bubbleOwnerText: "#FFFFFF",
};

const dark: typeof light = {
  bg: "#0B0B0C",
  surface: "#151517",
  surfaceAlt: "#1D1D20",
  border: "#2A2A2E",
  text: "#F4F4F2",
  textMuted: "#A3A3A0",
  textFaint: "#6E6E6B",
  accent: "#F4F4F2",
  accentText: "#0B0B0C",
  positive: "#4ACB8B",
  positiveBg: "#12261C",
  warning: "#F0A63A",
  warningBg: "#2A1F0E",
  danger: "#FF6B5E",
  dangerBg: "#2C1311",
  info: "#8EA4FF",
  infoBg: "#161C33",
  bubbleCustomer: "#1D1D20",
  bubbleAgent: "#F4F4F2",
  bubbleAgentText: "#0B0B0C",
  bubbleOwner: "#5873E8",
  bubbleOwnerText: "#FFFFFF",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
