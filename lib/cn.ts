type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Tiny class-name joiner (avoids pulling in clsx for a handful of calls). */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    out.push(String(value));
  };
  values.forEach(walk);
  return out.join(' ');
}
