#version 300 es
precision highp float;

// Advances the fog one step.
//   R = visible fog density 0..1 (what you see; wipes clear it).
//   G = "untouched" density: the same physics with no wiping at all — what the fog here would be
//       if nobody had written on it. Eraser/undo restore R toward G, so restored fog always matches
//       the fog around it.

in vec2 v_tex;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_prev;
uniform float u_dt;
uniform float u_aspect;
uniform float u_time;
uniform float u_blow;        // blowStrength * blowRate
uniform vec2 u_blowCenter;   // where the breath lands (mouth position), screen space
uniform float u_humidity;    // 0..1, global "steaminess"
uniform float u_regrowCap;
uniform float u_regrowRate;
uniform float u_evapRate;
uniform float u_dither;      // 1.0 on 8-bit targets

#define MAX_STAMPS 64
uniform int u_stampCount;
uniform vec4 u_stamps[MAX_STAMPS]; // x, y, radius, amount (<0 wipe strength, >0 restore strength)

#include "common"

void main() {
  vec2 uv = v_uv;
  vec2 ap = uv * vec2(u_aspect, 1.0);
  vec2 prev = texture(u_prev, v_tex).rg;

  // Low-frequency variation so fog grows and fades unevenly, like real condensation.
  float n = valueNoise(ap * 3.0 + 1.7) * 0.6 + valueNoise(ap * 9.0 + 4.2) * 0.4;

  // Edges of a mirror clear first.
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.2, min(e.x * u_aspect, e.y));

  float target = u_humidity * u_regrowCap * mix(0.75, 1.15, n) * mix(0.5, 1.0, edge);

  // Breath lands strongest in front of the mouth and spreads out from there.
  vec2 c = (uv - u_blowCenter) * vec2(u_aspect, 1.0);
  float fall = 0.45 + 0.55 * exp(-dot(c, c) / 0.15);
  float add = u_blow * fall * mix(0.6, 1.25, n) * mix(0.7, 1.0, edge) * u_dt;
  float evap = u_evapRate * u_dt * mix(0.6, 1.5, 1.0 - n);
  float regrow = 1.0 - exp(-u_regrowRate * u_dt);

  // Same physics for both channels.
  vec2 d = prev + add;
  d = mix(max(vec2(target), d - evap), d + (target - d) * regrow, step(d, vec2(target)));

  for (int i = 0; i < MAX_STAMPS; i++) {
    if (i >= u_stampCount) break;
    vec4 s = u_stamps[i];
    float dist = length((uv - s.xy) * vec2(u_aspect, 1.0));
    float m = 1.0 - smoothstep(s.z * 0.55, s.z, dist);
    if (s.w < 0.0) {
      d.x *= 1.0 + s.w * m;
    } else {
      d.x = mix(d.x, max(d.x, d.y), m * s.w);
    }
  }

  d += (hash12(uv * 1000.0 + u_time) - 0.5) / 255.0 * u_dither;
  outColor = vec4(clamp(d, 0.0, 1.0), 0.0, 1.0);
}
