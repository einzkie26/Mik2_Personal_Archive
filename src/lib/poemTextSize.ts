export const defaultPoemTextSize = 100;
export const minimumPoemTextSize = 70;
export const maximumPoemTextSize = 150;

export function getPoemTextSize(value?: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimumPoemTextSize && value <= maximumPoemTextSize
    ? value
    : defaultPoemTextSize;
}
