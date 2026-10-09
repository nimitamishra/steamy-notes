#version 300 es
precision highp float;

// Draws the mirrored camera through the fog, plus condensation beads and drips.

in vec2 v_tex;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_video;   // mipmapped camera frame
uniform sampler2D u_fog;     // density field
uniform vec4 u_fit;          // cover fit: scale.xy, offset.zw
uniform vec2 u_fogTexel;     // 1 / fog texture size
uniform vec2 u_res;          // canvas pixels
uniform float u_aspect;
uniform float u_droplets;    // 1 = droplets style, 0 = plain
uniform float u_hasVideo;

#define MAX_DRIPS 16
uniform int u_dripCount;
uniform vec4 u_drips[MAX_DRIPS]; // x, y, radius, unused

#include "common"

vec2 videoUV(vec2 uv) {
  vec2 m = uv * u_fit.xy + u_fit.zw;
  return vec2(1.0 - m.x, m.y);
}

vec3 sharp(vec2 uv) {
  if (u_hasVideo < 0.5) return vec3(0.16, 0.18, 0.22) + 0.06 * uv.y;
  return texture(u_video, clamp(videoUV(uv), 0.0, 1.0)).rgb;
}

// Soft blur: a few taps from a coarse mip level.
vec3 blurred(vec2 uv) {
  if (u_hasVideo < 0.5) return sharp(uv);
  const vec2 taps[8] = vec2[](
    vec2(0.0, 0.0), vec2(0.7, 0.2), vec2(-0.6, 0.5), vec2(-0.3, -0.7),
    vec2(0.4, -0.6), vec2(0.9, -0.1), vec2(-0.9, -0.2), vec2(0.1, 0.9));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec2 o = taps[i] * vec2(0.022 / u_aspect, 0.022);
    acc += textureLod(u_video, clamp(videoUV(uv + o), 0.0, 1.0), 4.0).rgb;
  }
  return acc / 8.0;
}

// A water bead seen up close: lensed (slightly inverted) view, dark rim, bright highlight.
vec3 bead(vec2 uv, vec2 q, float lensStrength) {
  float l = length(q);
  vec3 refr = sharp(uv - q * lensStrength) * 0.92 + 0.06;
  refr -= smoothstep(0.55, 1.0, l) * 0.22;
  float spec = pow(max(0.0, 1.0 - length(q - vec2(-0.35, -0.4)) * 2.4), 3.0);
  return refr + spec * 0.7;
}

// Field of small static beads in a jittered grid. Returns coverage in .a.
vec4 beadField(vec2 uv, float scale, float density, float seed) {
  vec2 p = uv * vec2(u_aspect, 1.0) * scale;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y);
      vec2 id = cell + o + seed;
      if (hash12(id * 1.37) > density) continue;
      vec2 c = o + 0.25 + 0.5 * hash22(id);
      float r = mix(0.14, 0.42, hash12(id + 7.7));
      vec2 q = (f - c) / r;
      float l = length(q);
      if (l < 1.0) {
        // Lens offset ~1.5x the bead radius gives the flipped look of a real droplet.
        return vec4(bead(uv, q, 1.5 * r / scale), smoothstep(1.0, 0.75, l));
      }
    }
  }
  return vec4(0.0);
}

void main() {
  vec2 uv = v_uv;
  float d = texture(u_fog, v_tex).r;

  vec3 sh = sharp(uv);
  vec3 bl = blurred(uv);

  // Milky haze: blurred image lifted toward a cool white, with fine static grain (micro-droplets).
  float grain = hash12(floor(uv * u_res * 0.5)) - 0.5;
  vec3 haze = mix(bl, vec3(0.88, 0.92, 0.96), 0.5) + 0.05 + grain * 0.035;

  float f = smoothstep(0.03, 0.85, d);
  vec3 col = mix(sh, bl, smoothstep(0.0, 0.45, d));
  col = mix(col, haze, f * 0.88);

  // Wet rim along wiped edges: a faint bright line where density changes quickly.
  float dx = texture(u_fog, v_tex + vec2(u_fogTexel.x, 0.0)).r - texture(u_fog, v_tex - vec2(u_fogTexel.x, 0.0)).r;
  float dy = texture(u_fog, v_tex + vec2(0.0, u_fogTexel.y)).r - texture(u_fog, v_tex - vec2(0.0, u_fogTexel.y)).r;
  col += smoothstep(0.08, 0.35, length(vec2(dx, dy))) * 0.06;

  if (u_droplets > 0.5) {
    float amt = smoothstep(0.45, 0.85, d);
    if (amt > 0.0) {
      vec4 small = beadField(uv, 70.0, 0.3, 0.0);
      vec4 large = beadField(uv, 26.0, 0.12, 31.0);
      vec4 b = large.a > 0.0 ? large : small;
      col = mix(col, b.rgb, b.a * amt * 0.8);
    }

    for (int i = 0; i < MAX_DRIPS; i++) {
      if (i >= u_dripCount) break;
      vec4 dr = u_drips[i];
      vec2 q = (uv - dr.xy) * vec2(u_aspect, 1.0) / dr.z;
      // Teardrop: stretched upward (y is down, so negative q.y is above the head).
      if (q.y < 0.0) q.y *= 0.55;
      float l = length(q);
      if (l < 1.0) col = mix(col, bead(uv, q, 1.5 * dr.z), smoothstep(1.0, 0.8, l));
    }
  }

  outColor = vec4(col, 1.0);
}
