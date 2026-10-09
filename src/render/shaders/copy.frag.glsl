#version 300 es
precision highp float;

// Resamples the fog field into a new-size target (window resize).

in vec2 v_tex;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;

void main() {
  outColor = vec4(texture(u_src, v_tex).r, 0.0, 0.0, 1.0);
}
