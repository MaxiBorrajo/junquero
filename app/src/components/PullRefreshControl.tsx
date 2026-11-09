import { RefreshControl } from "react-native";
import type { PullRefresh } from "../lib/useManualRefresh";
import { colors } from "../theme";

export function PullRefreshControl({ refresh }: { refresh: PullRefresh }) {
  return <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} colors={[colors.brick]} tintColor={colors.brick} />;
}
