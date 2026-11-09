export type FirstScreen = "publish" | "map";

let first: FirstScreen = "map";

export const setFirstScreen = (value: FirstScreen): void => {
  first = value;
};

export const getFirstScreen = (): FirstScreen => first;
