import { useCallback, useRef, useState } from "react";

export interface PullRefresh {
  refreshing: boolean;
  onRefresh: () => void;
}

export function useManualRefresh(refetchers: (() => Promise<unknown>)[]): PullRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(refetchers);
  latest.current = refetchers;
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled(latest.current.map((refetch) => refetch())).finally(() => setRefreshing(false));
  }, []);
  return { refreshing, onRefresh };
}
