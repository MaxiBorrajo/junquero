export const NAME_MIN = 2;
export const NAME_MAX = 40;

export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, " ");

export const isValidName = (value: string): boolean => {
  const name = normalizeName(value);
  return name.length >= NAME_MIN && name.length <= NAME_MAX;
};
