import { toMicro } from "./money";

export interface Filters {
  category: number | null;
  minAmount: string;
  maxAmount: string;
}

export const noFilters = (): Filters => ({ category: null, minAmount: "", maxAmount: "" });

const AMOUNT = /^\d{1,9}([.,]\d{1,6})?$/;

export function validateFilters(filters: Filters): boolean {
  const min = filters.minAmount.trim();
  const max = filters.maxAmount.trim();
  if (min && !AMOUNT.test(min)) return false;
  if (max && !AMOUNT.test(max)) return false;
  if (min && max && toMicro(min) > toMicro(max)) return false;
  return true;
}

export function filtersQuery(filters: Filters): string {
  const parts: string[] = [];
  if (filters.category !== null) parts.push(`category=${filters.category}`);
  if (filters.minAmount.trim()) parts.push(`minAmount=${toMicro(filters.minAmount.trim())}`);
  if (filters.maxAmount.trim()) parts.push(`maxAmount=${toMicro(filters.maxAmount.trim())}`);
  return parts.join("&");
}

export const activeFilterCount = (filters: Filters): number =>
  Number(filters.category !== null) + Number(filters.minAmount.trim() !== "") + Number(filters.maxAmount.trim() !== "");
