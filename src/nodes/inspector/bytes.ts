export function utf8ByteLengthRange(value: string, start = 0, end = value.length): number {
  let bytes = 0;
  for (let index = start; index < end; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < end && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function fastFingerprintRange(value: string, start: number, end: number): string {
  let first = 2166136261;
  let second = 5381;
  for (let index = start; index < end; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${end - start}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function equalRanges(value: string, leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  if (leftEnd - leftStart !== rightEnd - rightStart) return false;
  for (let offset = 0; offset < leftEnd - leftStart; offset += 1) {
    if (value.charCodeAt(leftStart + offset) !== value.charCodeAt(rightStart + offset)) return false;
  }
  return true;
}
