// NACA 4-digit airfoil geometry generation.
// Reference: Abbott & von Doenhoff, "Theory of Wing Sections".

/**
 * Parse a NACA 4-digit designation (e.g. "2412").
 * @returns {{m:number, p:number, t:number}} max camber (fraction), camber position (fraction), thickness (fraction)
 */
export function parseNaca4(code) {
  const s = String(code).padStart(4, "0").slice(0, 4);
  const m = parseInt(s[0], 10) / 100;
  const p = parseInt(s[1], 10) / 10;
  const t = parseInt(s.slice(2), 10) / 100;
  return { m, p, t };
}

// Thickness distribution (half-thickness) for unit chord.
function thicknessY(x, t, closedTE = true) {
  const a4 = closedTE ? -0.1036 : -0.1015;
  return (
    (t / 0.2) *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x * x * x +
      a4 * x * x * x * x)
  );
}

// Camber line and its slope.
function camber(x, m, p) {
  if (m === 0 || p === 0) return { yc: 0, dyc: 0 };
  let yc, dyc;
  if (x < p) {
    yc = (m / (p * p)) * (2 * p * x - x * x);
    dyc = ((2 * m) / (p * p)) * (p - x);
  } else {
    yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
    dyc = ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
  }
  return { yc, dyc };
}

/**
 * Generate airfoil coordinates as a closed loop (TE -> upper -> LE -> lower -> TE),
 * suitable for panel methods. Uses cosine spacing for clustering near the edges.
 * @param {string} code NACA 4-digit code
 * @param {number} n number of points per surface
 * @returns {{x:number[], y:number[], upper:{x:number[],y:number[]}, lower:{x:number[],y:number[]}, camberLine:{x:number[],y:number[]}}}
 */
export function generateNaca4(code, n = 100) {
  const { m, p, t } = parseNaca4(code);

  // cosine-spaced x stations from 0..1
  const xs = [];
  for (let i = 0; i <= n; i++) {
    const beta = (Math.PI * i) / n;
    xs.push(0.5 * (1 - Math.cos(beta)));
  }

  const upper = { x: [], y: [] };
  const lower = { x: [], y: [] };
  const camberLine = { x: [], y: [] };

  for (const x of xs) {
    const yt = thicknessY(x, t);
    const { yc, dyc } = camber(x, m, p);
    const theta = Math.atan(dyc);
    upper.x.push(x - yt * Math.sin(theta));
    upper.y.push(yc + yt * Math.cos(theta));
    lower.x.push(x + yt * Math.sin(theta));
    lower.y.push(yc - yt * Math.cos(theta));
    camberLine.x.push(x);
    camberLine.y.push(yc);
  }

  // Closed loop for panel method: start at TE, go along lower to LE, then upper back to TE.
  const x = [];
  const y = [];
  for (let i = upper.x.length - 1; i >= 0; i--) {
    x.push(lower.x[i]);
    y.push(lower.y[i]);
  }
  for (let i = 1; i < upper.x.length; i++) {
    x.push(upper.x[i]);
    y.push(upper.y[i]);
  }

  return { x, y, upper, lower, camberLine, params: { m, p, t } };
}
