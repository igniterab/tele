export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function withUniqueSuffix(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
