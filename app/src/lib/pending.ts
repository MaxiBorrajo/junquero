export const PENDING_WINDOW_SECONDS = 15 * 60;

export interface WithStatus {
  status: string;
  createdAt: number;
}

export const isVisibleMine = (item: WithStatus, nowSeconds: number): boolean => item.status !== "draft" || nowSeconds - item.createdAt < PENDING_WINDOW_SECONDS;
