import { useMemo, useRef } from "react";
import type { GestureResponderEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { PullRefresh } from "./useManualRefresh";

const THRESHOLD = 90;

export interface PullProps {
  scrollEventThrottle: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchMove: (event: GestureResponderEvent) => void;
  onTouchEnd: () => void;
}

export function shouldRefresh(startY: number | null, lastY: number, offsetY: number, refreshing: boolean, threshold = THRESHOLD): boolean {
  return startY !== null && !refreshing && offsetY <= 0 && lastY - startY >= threshold;
}

export function usePullGesture(refresh: PullRefresh): PullProps {
  const refreshState = useRef(refresh);
  refreshState.current = refresh;
  const offset = useRef(0);
  const start = useRef<number | null>(null);
  const last = useRef(0);

  return useMemo(
    () => ({
      scrollEventThrottle: 16,
      onScroll: (event) => {
        offset.current = event.nativeEvent.contentOffset.y;
      },
      onTouchStart: (event) => {
        start.current = offset.current <= 0 ? event.nativeEvent.pageY : null;
        last.current = event.nativeEvent.pageY;
      },
      onTouchMove: (event) => {
        last.current = event.nativeEvent.pageY;
      },
      onTouchEnd: () => {
        if (shouldRefresh(start.current, last.current, offset.current, refreshState.current.refreshing)) refreshState.current.onRefresh();
        start.current = null;
      },
    }),
    [],
  );
}
