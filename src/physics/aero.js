// Finite-wing aerodynamics: lift curve, drag polar, lift-to-drag ratio.
import { isa, G0 } from "./atmosphere.js";

/**
 * 3D lift-curve slope from 2D slope, corrected for finite aspect ratio (Helmbold/Prandtl).
 * @param {number} a0 2D lift-curve slope [per rad] (~2*pi)
 * @param {number} AR aspect ratio
 * @param {number} e Oswald / span efficiency
 */
export function liftSlope3D(a0, AR, e) {
  return a0 / (1 + a0 / (Math.PI * e * AR));
}

/**
 * Lift coefficient at a given geometric angle of attack (linear range).
 * @param {number} alphaDeg geometric AoA [deg]
 * @param {object} ac aircraft data (uses alpha0Deg, a0_2d, AR, e, clMax)
 */
export function liftCoefficient(alphaDeg, ac) {
  const a0 = ac.a0_2d ?? 2 * Math.PI;
  const aSlope = liftSlope3D(a0, ac.AR, ac.e); // per rad
  const alpha = ((alphaDeg - (ac.alpha0Deg ?? 0)) * Math.PI) / 180;
  const cl = aSlope * alpha;
  return Math.max(-ac.clMax, Math.min(ac.clMax, cl));
}

/**
 * Drag polar: CD = CD0 + k*CL^2, with k = 1/(pi*e*AR).
 */
export function dragCoefficient(cl, ac) {
  const k = 1 / (Math.PI * ac.e * ac.AR);
  return ac.cd0 + k * cl * cl;
}

export function inducedDragFactor(ac) {
  return 1 / (Math.PI * ac.e * ac.AR);
}

/**
 * Build CL, CD, L/D vs angle of attack curves over a range.
 */
export function aeroCurves(ac, alphaMin = -6, alphaMax = 18, step = 0.5) {
  const data = [];
  const aSlope = liftSlope3D(ac.a0_2d ?? 2 * Math.PI, ac.AR, ac.e);
  const alphaStallDeg =
    (ac.alpha0Deg ?? 0) + (ac.clMax / aSlope) * (180 / Math.PI);
  for (let a = alphaMin; a <= alphaMax + 1e-9; a += step) {
    const cl = liftCoefficient(a, ac);
    const cd = dragCoefficient(cl, ac);
    data.push({
      alpha: +a.toFixed(2),
      cl: +cl.toFixed(4),
      cd: +cd.toFixed(5),
      ld: +(cl / cd).toFixed(3),
      stalled: a > alphaStallDeg,
    });
  }
  return { data, alphaStallDeg };
}

/**
 * Maximum lift-to-drag ratio and the CL at which it occurs.
 * (L/D)max = 0.5*sqrt(1/(k*CD0)),  CL_opt = sqrt(CD0/k)
 */
export function maxLD(ac) {
  const k = inducedDragFactor(ac);
  const clOpt = Math.sqrt(ac.cd0 / k);
  const ldMax = clOpt / (ac.cd0 + k * clOpt * clOpt);
  return { ldMax, clOpt };
}

/**
 * Lift and drag forces [N] at a flight condition.
 */
export function forces(ac, { velocity, altitude, alphaDeg }) {
  const rho = isa(altitude).density;
  const q = 0.5 * rho * velocity * velocity;
  const cl = liftCoefficient(alphaDeg, ac);
  const cd = dragCoefficient(cl, ac);
  return {
    lift: q * ac.S * cl,
    drag: q * ac.S * cd,
    cl,
    cd,
    q,
    weight: ac.mass * G0,
  };
}
