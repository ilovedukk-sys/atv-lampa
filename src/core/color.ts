/** '#rrggbb' → 'rgba(r,g,b,a)'. Старые ТВ не понимают цвета вида #rrggbbaa. */
export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
