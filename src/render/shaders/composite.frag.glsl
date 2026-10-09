#version 300 es
precision highp float;

// Draws the mirrored camera through the fog.

in vec2 v_tex;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_video;   // mipmapped camera frame
uniform sampler2D u_fog;     // density field
uniform vec4 u_fit;          // cover fit: scale.xy, offset.zw
uniform vec2 u_fogTexel;     // 1 / fog texture size
uniform vec2 u_res;          // canvas pixels
uniform float u_aspect;
uniform float u_hasVideo;

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

void main() {
  vec2 uv = v_uv;
  float d = texture(u_fog, v_tex).r;

  vec3 sh = sharp(uv);
  vec3 bl = blurred(uv);

  // Milky haze: blurred image lifted toward a cool white, with fine static grain.
  float grain = hash12(floor(uv * u_res * 0.5)) - 0.5;
  vec3 haze = mix(bl, vec3(0.88, 0.92, 0.96), 0.5) + 0.05 + grain * 0.035;

  float f = smoothstep(0.03, 0.85, d);
  vec3 col = mix(sh, bl, smoothstep(0.0, 0.45, d));
  col = mix(col, haze, f * 0.88);

  // Wet rim along wiped edges: a faint bright line where density changes quickly.
  float dx = texture(u_fog, v_tex + vec2(u_fogTexel.x, 0.0)).r - texture(u_fog, v_tex - vec2(u_fogTexel.x, 0.0)).r;
  float dy = texture(u_fog, v_tex + vec2(0.0, u_fogTexel.y)).r - texture(u_fog, v_tex - vec2(0.0, u_fogTexel.y)).r;
  col += smoothstep(0.08, 0.35, length(vec2(dx, dy))) * 0.06;

  outColor = vec4(col, 1.0);
}
