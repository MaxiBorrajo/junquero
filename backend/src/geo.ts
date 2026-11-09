const CELL_DIVISOR = 100;

export const roundCoordinate = (value: number): number => Math.round(value * 1000) / 1000;

export const toMilli = (degrees: number): number => Math.round(degrees * 1000);

export const cellOf = (milliDegrees: number): number => Math.floor(milliDegrees / CELL_DIVISOR);
