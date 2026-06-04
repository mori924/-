// Flight performance: stall speed, thrust/power required & available, climb,
// max speed, range and endurance, turn performance.
import { isa, G0 } from "./atmosphere.js";
import { dragCoefficient } from "./aero.js";

/**
 * Stall speed at a given altitude and load factor.
 * Vs = sqrt(2 n W / (rho S CLmax))
 */
export function stallSpeed(ac, altitude = 0, loadFactor = 1) {
  const rho = isa(altitude).density;
  const W = ac.mass * G0;
  return Math.sqrt((2 * loadFactor * W) / (rho * ac.S * ac.clMax));
}

/**
 * For level flight at speed V: required CL, drag, thrust required and power required.
 */
export function levelFlight(ac, velocity, altitude = 0) {
  const rho = isa(altitude).density;
  const W = ac.mass * G0;
  const q = 0.5 * rho * velocity * velocity;
  const cl = W / (q * ac.S);
  const cd = dragCoefficient(cl, ac);
  const drag = q * ac.S * cd; // = thrust required
  const powerReq = drag * velocity;
  return { cl, cd, drag, thrustReq: drag, powerReq, q };
}

/**
 * Thrust available at altitude. Jets: T ~ T0 * (rho/rho0)^m.
 * Props: power-based, thrust = eta * P / V (P lapses with density).
 */
export function thrustAvailable(ac, velocity, altitude = 0) {
  if (ac.propulsion === "glider") return 0;
  const rho = isa(altitude).density;
  const rho0 = isa(0).density;
  const sigma = rho / rho0;
  if (ac.propulsion === "prop") {
    const P = ac.maxPower * Math.pow(sigma, 1.0); // shaft power lapse
    const v = Math.max(velocity, 1e-3);
    // simple model: usable thrust capped to avoid singularity at very low V
    return Math.min((ac.propEff ?? 0.8) * P / v, ac.staticThrust ?? Infinity);
  }
  // jet / turbofan
  const m = ac.thrustLapse ?? 0.7;
  return ac.maxThrust * Math.pow(sigma, m);
}

/**
 * Rate of climb [m/s] at a speed and altitude: RC = (Pavail - Preq)/W.
 */
export function rateOfClimb(ac, velocity, altitude = 0) {
  const W = ac.mass * G0;
  const { powerReq } = levelFlight(ac, velocity, altitude);
  const Pavail = thrustAvailable(ac, velocity, altitude) * velocity;
  return (Pavail - powerReq) / W;
}

/**
 * Build performance curves vs velocity at an altitude.
 */
export function performanceCurves(ac, altitude = 0, vMaxGuess) {
  const vs = stallSpeed(ac, altitude);
  const vmax = vMaxGuess ?? Math.max(ac.cruiseSpeed * 1.4, vs * 4);
  const data = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const v = vs * 0.9 + ((vmax - vs * 0.9) * i) / steps;
    const lvl = levelFlight(ac, v, altitude);
    const Ta = thrustAvailable(ac, v, altitude);
    const Pa = Ta * v;
    data.push({
      v: +v.toFixed(1),
      thrustReq: +(lvl.thrustReq / 1000).toFixed(3), // kN
      thrustAvail: +(Ta / 1000).toFixed(3),
      powerReq: +(lvl.powerReq / 1000).toFixed(2), // kW
      powerAvail: +(Pa / 1000).toFixed(2),
      roc: +rateOfClimb(ac, v, altitude).toFixed(3),
    });
  }
  return { data, vs, vmax };
}

/**
 * Maximum level-flight speed at altitude (where thrust available = thrust required).
 */
export function maxSpeed(ac, altitude = 0) {
  const vs = stallSpeed(ac, altitude);
  let best = vs;
  let foundFlight = false;
  for (let v = vs; v < vs * 6; v += 0.5) {
    const lvl = levelFlight(ac, v, altitude);
    const Ta = thrustAvailable(ac, v, altitude);
    if (Ta >= lvl.thrustReq) {
      best = v;
      foundFlight = true;
    } else if (foundFlight) {
      break;
    }
  }
  return best;
}

/**
 * Best rate of climb and the speed at which it occurs.
 */
export function bestClimb(ac, altitude = 0) {
  const vs = stallSpeed(ac, altitude);
  let bestRoc = -Infinity;
  let bestV = vs;
  for (let v = vs; v < vs * 6; v += 0.5) {
    const roc = rateOfClimb(ac, v, altitude);
    if (roc > bestRoc) {
      bestRoc = roc;
      bestV = v;
    }
  }
  return { roc: bestRoc, v: bestV };
}

/**
 * Breguet range [m] and endurance [s].
 * Jet:  R = (V/(g*c_t)) * (CL/CD) * ln(Wi/Wf)
 * Prop: R = (eta/(g*c_p)) * (CL/CD) * ln(Wi/Wf)
 * Here c_t [1/s] is TSFC, c_p [kg/(W.s)] is BSFC equivalent. Uses (L/D)max region.
 */
export function breguetRange(ac) {
  const Wi = ac.mass * G0;
  const Wf = (ac.mass - (ac.fuelMass ?? ac.mass * 0.2)) * G0;
  const ld = ac.cruiseLD ?? 12;
  const v = ac.cruiseSpeed;
  if (ac.propulsion === "prop") {
    const cp = ac.bsfc ?? 8e-7; // kg/(W*s) approx
    const eta = ac.propEff ?? 0.8;
    const range = (eta / (G0 * cp)) * ld * Math.log(Wi / Wf);
    const endurance =
      (eta / (G0 * cp)) * ld * Math.sqrt(1) * (Math.log(Wi / Wf) / v);
    return { range, endurance };
  }
  const ct = ac.tsfc ?? 1.8e-5; // 1/s (~ 0.6 lb/lbf/hr)
  const range = (v / (G0 * ct)) * ld * Math.log(Wi / Wf);
  const endurance = (1 / (G0 * ct)) * ld * Math.log(Wi / Wf);
  return { range, endurance };
}

/**
 * Turn performance at a load factor n.
 * radius = V^2 / (g*sqrt(n^2-1)), turn rate = g*sqrt(n^2-1)/V.
 */
export function turnPerformance(ac, velocity, loadFactor) {
  const n = Math.max(loadFactor, 1.0001);
  const radius = (velocity * velocity) / (G0 * Math.sqrt(n * n - 1));
  const rate = (G0 * Math.sqrt(n * n - 1)) / velocity; // rad/s
  return { radius, rateDeg: (rate * 180) / Math.PI, rate };
}
