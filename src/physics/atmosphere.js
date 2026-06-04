// International Standard Atmosphere (ISA) model
// Valid for the troposphere and lower stratosphere (0 - 32 km).
// Returns SI units: temperature [K], pressure [Pa], density [kg/m^3], speed of sound [m/s].

const G0 = 9.80665; // gravitational acceleration [m/s^2]
const R = 287.05287; // specific gas constant for air [J/(kg.K)]
const GAMMA = 1.4; // ratio of specific heats

// Layer base data: [base geopotential altitude (m), base temp (K), base pressure (Pa), lapse rate (K/m)]
const LAYERS = [
  { h: 0, T: 288.15, p: 101325.0, a: -0.0065 },
  { h: 11000, T: 216.65, p: 22632.06, a: 0.0 },
  { h: 20000, T: 216.65, p: 5474.889, a: 0.001 },
  { h: 32000, T: 228.65, p: 868.0187, a: 0.0028 },
];

/**
 * Compute ISA properties at a given geometric altitude.
 * @param {number} altitude altitude in meters
 * @returns {{temperature:number, pressure:number, density:number, soundSpeed:number}}
 */
export function isa(altitude) {
  const h = Math.max(0, Math.min(altitude, 47000));

  // find layer
  let layer = LAYERS[0];
  for (let i = 0; i < LAYERS.length; i++) {
    if (h >= LAYERS[i].h) layer = LAYERS[i];
  }

  const dh = h - layer.h;
  let T, p;
  if (Math.abs(layer.a) > 1e-12) {
    T = layer.T + layer.a * dh;
    p = layer.p * Math.pow(T / layer.T, -G0 / (layer.a * R));
  } else {
    T = layer.T;
    p = layer.p * Math.exp((-G0 * dh) / (R * layer.T));
  }

  const density = p / (R * T);
  const soundSpeed = Math.sqrt(GAMMA * R * T);

  return { temperature: T, pressure: p, density, soundSpeed };
}

export function airDensity(altitude) {
  return isa(altitude).density;
}

export { G0, R, GAMMA };
