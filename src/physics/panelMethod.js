// Hess-Smith panel method for incompressible, inviscid 2D flow over an airfoil.
// Constant-strength source panels + a single constant-strength vortex (Kutta condition).
// Induced-velocity formulas follow Katz & Plotkin, "Low-Speed Aerodynamics".
//
// Input geometry must be a closed loop of nodes ordered clockwise, starting and
// ending at the trailing edge. generateNaca4() in airfoil.js produces a compatible loop.

// Solve A x = b by Gaussian elimination with partial pivoting.
function solveLinear(A, b) {
  const n = b.length;
  // augmented matrix (copy)
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (piv !== col) {
      const tmp = M[piv];
      M[piv] = M[col];
      M[col] = tmp;
    }
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-14) continue;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / diag;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = Math.abs(M[r][r]) < 1e-14 ? 0 : s / M[r][r];
  }
  return x;
}

/**
 * Run the panel method.
 * @param {{x:number[], y:number[]}} geom closed airfoil loop (clockwise, TE -> ... -> TE)
 * @param {number} alphaDeg angle of attack in degrees
 * @returns {{cp:number[], xc:number[], cl:number, gamma:number, panels:object}}
 */
export function solveAirfoil(geom, alphaDeg) {
  const alpha = (alphaDeg * Math.PI) / 180;
  const Vinf = 1.0;
  const uinf = Vinf * Math.cos(alpha);
  const winf = Vinf * Math.sin(alpha);

  const X = geom.x;
  const Y = geom.y;
  const N = X.length - 1; // number of panels

  // Panel geometry
  const xc = new Array(N);
  const yc = new Array(N);
  const S = new Array(N);
  const sinT = new Array(N);
  const cosT = new Array(N);
  const nx = new Array(N); // outward normal
  const ny = new Array(N);

  for (let i = 0; i < N; i++) {
    const dx = X[i + 1] - X[i];
    const dy = Y[i + 1] - Y[i];
    S[i] = Math.hypot(dx, dy);
    const th = Math.atan2(dy, dx);
    sinT[i] = Math.sin(th);
    cosT[i] = Math.cos(th);
    xc[i] = 0.5 * (X[i] + X[i + 1]);
    yc[i] = 0.5 * (Y[i] + Y[i + 1]);
    // For a clockwise loop the outward normal is (dy, -dx)/S = (sinT, -cosT)
    nx[i] = sinT[i];
    ny[i] = -cosT[i];
  }

  // Influence: returns {us, ws, uv, wv} global-frame velocities at control point i
  // due to a UNIT source and UNIT vortex on panel j.
  function influence(i, j) {
    // transform control point i into panel j local frame
    const dxg = xc[i] - X[j];
    const dyg = yc[i] - Y[j];
    const xl = dxg * cosT[j] + dyg * sinT[j];
    const zl = -dxg * sinT[j] + dyg * cosT[j];
    const x1 = 0;
    const x2 = S[j];

    const r1sq = (xl - x1) * (xl - x1) + zl * zl;
    const r2sq = (xl - x2) * (xl - x2) + zl * zl;
    const th1 = Math.atan2(zl, xl - x1);
    const th2 = Math.atan2(zl, xl - x2);

    const lnr = 0.5 * Math.log(r1sq / r2sq); // ln(r1/r2)
    const dth = th2 - th1;

    // local-frame velocities for unit source
    let usl = (1 / (2 * Math.PI)) * lnr;
    let wsl = (1 / (2 * Math.PI)) * dth;
    // local-frame velocities for unit vortex
    let uvl = (1 / (2 * Math.PI)) * dth;
    let wvl = -(1 / (2 * Math.PI)) * lnr;

    if (i === j) {
      // self-induced (z -> 0 at own control point)
      usl = 0;
      wsl = 0.5;
      uvl = 0.5;
      wvl = 0;
    }

    // rotate back to global frame
    const c = cosT[j];
    const s = sinT[j];
    return {
      us: usl * c - wsl * s,
      ws: usl * s + wsl * c,
      uv: uvl * c - wvl * s,
      wv: uvl * s + wvl * c,
    };
  }

  // Build linear system: unknowns [sigma_1..sigma_N, gamma]
  const A = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(0));
  const b = new Array(N + 1).fill(0);

  for (let i = 0; i < N; i++) {
    let vortNormalSum = 0;
    for (let j = 0; j < N; j++) {
      const inf = influence(i, j);
      // normal velocity due to unit source on panel j
      A[i][j] = inf.us * nx[i] + inf.ws * ny[i];
      // accumulate normal velocity due to unit vortex (common gamma)
      vortNormalSum += inf.uv * nx[i] + inf.wv * ny[i];
    }
    A[i][N] = vortNormalSum;
    b[i] = -(uinf * nx[i] + winf * ny[i]);
  }

  // Kutta condition at the two trailing-edge panels (first and last).
  const kFirst = 0;
  const kLast = N - 1;
  let vortTangSum = 0;
  for (let j = 0; j < N; j++) {
    const infA = influence(kFirst, j);
    const infB = influence(kLast, j);
    // tangential = velocity . panel tangent (cosT, sinT)
    const tsA = infA.us * cosT[kFirst] + infA.ws * sinT[kFirst];
    const tsB = infB.us * cosT[kLast] + infB.ws * sinT[kLast];
    A[N][j] = tsA + tsB;
    const tvA = infA.uv * cosT[kFirst] + infA.wv * sinT[kFirst];
    const tvB = infB.uv * cosT[kLast] + infB.wv * sinT[kLast];
    vortTangSum += tvA + tvB;
  }
  A[N][N] = vortTangSum;
  b[N] = -(
    (uinf * cosT[kFirst] + winf * sinT[kFirst]) +
    (uinf * cosT[kLast] + winf * sinT[kLast])
  );

  const sol = solveLinear(A, b);
  const sigma = sol.slice(0, N);
  const gamma = sol[N];

  // Surface tangential velocity and Cp at each control point
  const cp = new Array(N);
  const Vt = new Array(N);
  for (let i = 0; i < N; i++) {
    let vt = uinf * cosT[i] + winf * sinT[i];
    for (let j = 0; j < N; j++) {
      const inf = influence(i, j);
      vt += sigma[j] * (inf.us * cosT[i] + inf.ws * sinT[i]);
      vt += gamma * (inf.uv * cosT[i] + inf.wv * sinT[i]);
    }
    Vt[i] = vt;
    cp[i] = 1 - (vt / Vinf) * (vt / Vinf);
  }

  // Lift coefficient from total circulation (Kutta-Joukowski). chord = 1.
  let perim = 0;
  for (let i = 0; i < N; i++) perim += S[i];
  const circulation = gamma * perim;
  // sign convention: clockwise nodes give cl = -2*Gamma/(Vinf*c)
  const chord = Math.max(...X) - Math.min(...X);
  // geometry loop is counter-clockwise, so positive circulation -> positive lift
  const cl = (2 * circulation) / (Vinf * chord);

  return { cp, xc, yc, cl, gamma, sigma, Vt, panels: { S, nx, ny } };
}
