// Longitudinal static stability and a simple point-mass takeoff/acceleration model.
import { isa, G0 } from "./atmosphere.js";
import { liftSlope3D } from "./aero.js";

/**
 * Neutral point and static margin for a conventional wing+tail layout.
 * x_np/c = x_ac_w/c + (a_t/a_w) * Vh * (1 - de/da)
 * Static margin (SM) = x_np - x_cg  (fraction of MAC). SM > 0 -> statically stable.
 *
 * @param {object} ac aircraft data with stability sub-object
 */
export function longitudinalStability(ac) {
  const s = ac.stability;
  if (!s) return null;
  const aw = liftSlope3D(ac.a0_2d ?? 2 * Math.PI, ac.AR, ac.e); // wing slope /rad
  const at = s.tailSlope ?? 0.9 * aw;
  const Vh = s.tailVolume; // horizontal tail volume coefficient
  const downwash = s.downwash ?? 0.35; // de/da
  const eta = s.tailEff ?? 0.95;

  const xacW = s.xacWing ?? 0.25;
  const xnp = xacW + eta * (at / aw) * Vh * (1 - downwash);
  const xcg = s.xcg ?? 0.3;
  const staticMargin = xnp - xcg;

  // Pitching-moment curve slope dCm/dCL = -(SM)
  const cmSlope = -staticMargin;
  return { xnp, xcg, xacWing: xacW, staticMargin, cmSlope, aw, at, Vh };
}

/**
 * Cm vs CL line for plotting (Cm = Cm0 + dCm/dCL * CL).
 */
export function cmCurve(ac) {
  const st = longitudinalStability(ac);
  if (!st) return null;
  const cm0 = ac.stability.cm0 ?? 0.05;
  const data = [];
  for (let cl = -0.4; cl <= ac.clMax; cl += 0.05) {
    data.push({ cl: +cl.toFixed(3), cm: +(cm0 + st.cmSlope * cl).toFixed(4) });
  }
  return { data, ...st, cm0 };
}

/**
 * Point-mass takeoff ground roll simulation.
 * Integrates m dV/dt = T - D - mu(W - L) until liftoff speed (1.2*Vstall).
 * Returns time series and the takeoff distance.
 */
export function takeoffRoll(ac, altitude = 0) {
  const rho = isa(altitude).density;
  const W = ac.mass * G0;
  const mu = ac.muGround ?? 0.03;
  const clRoll = ac.clGroundRoll ?? 0.4; // CL during ground roll (small AoA)
  const cd0 = ac.cd0 + (clRoll * clRoll) / (Math.PI * ac.e * ac.AR);
  const vLof = 1.2 * Math.sqrt((2 * W) / (rho * ac.S * ac.clMax));

  const dt = 0.05;
  let v = 0;
  let x = 0;
  let t = 0;
  const series = [];
  const thrust0 = ac.propulsion === "prop" ? (ac.staticThrust ?? ac.maxPower / 50) : ac.maxThrust;
  let guard = 0;
  while (v < vLof && guard < 20000) {
    const q = 0.5 * rho * v * v;
    const L = q * ac.S * clRoll;
    const D = q * ac.S * cd0;
    let T;
    if (ac.propulsion === "prop") {
      T = v < 1 ? thrust0 : Math.min((ac.propEff ?? 0.8) * ac.maxPower / v, thrust0);
    } else {
      T = ac.maxThrust;
    }
    const Fnet = T - D - mu * Math.max(W - L, 0);
    const a = Fnet / ac.mass;
    if (a <= 0 && v < 1) break; // cannot accelerate
    v += a * dt;
    x += v * dt;
    t += dt;
    if (series.length === 0 || t - series[series.length - 1].t >= 0.25) {
      series.push({ t: +t.toFixed(2), v: +v.toFixed(2), x: +x.toFixed(1), a: +a.toFixed(3) });
    }
    guard++;
  }
  series.push({ t: +t.toFixed(2), v: +v.toFixed(2), x: +x.toFixed(1), a: 0 });
  return { distance: x, time: t, vLof, series };
}
