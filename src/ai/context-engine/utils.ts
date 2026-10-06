import { normalizeLexicalText } from "../../lexicon";

export const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
export const timed = <T>(operation: () => T) => { const start = now(); const value = operation(); return { value, timeMs: now() - start }; };
export const normalize = (value: string) => normalizeLexicalText(value);
export const whole = (text: string, term: string) => (` ${text} `).includes(` ${term} `);
export const unique = <T>(values: readonly T[]) => [...new Set(values)];
export const clip = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
