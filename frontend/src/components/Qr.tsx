import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** QR code drawn as SVG rects (no innerHTML). Payload convention: 'HSP:' + token. */
export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    const out: [number, number][] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) out.push([c, r]);
    return { n, out };
  }, [value]);
  const m = 2;
  const dim = cells.n + m * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} role="img" aria-label="QR code" shapeRendering="crispEdges" data-testid="qr">
      <rect width={dim} height={dim} fill="#fff" />
      {cells.out.map(([x, y]) => <rect key={`${x}-${y}`} x={x + m} y={y + m} width="1" height="1" fill="#0a303e" />)}
    </svg>
  );
}
