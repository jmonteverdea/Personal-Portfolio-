/**
 * The voice as terrain. A slow field of contour lines, like an elevation map.
 * The voice raises a hill at the centre: loudness is its height, low
 * frequencies widen it, mid frequencies make it tremble, high frequencies
 * (consonants) send fine ripples outward. Silence lets it settle back to flat ground.
 */

export const VERTEX = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uRes;
uniform float uLevel;
uniform vec3 uBands;
uniform vec3 uBg;
uniform vec3 uLine;
uniform vec3 uHot;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

// 2D simplex noise.
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * snoise(p);
    p = p * 2.03 + 17.0;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = vUv - 0.5;
  p.x *= uRes.x / uRes.y;
  float t = uTime;

  // Ground: drifts so slowly it reads as still.
  float ground = fbm(p * 1.1 + vec2(t * 0.03, -t * 0.018));

  // The voice: a hill at the centre, wider than it is tall.
  vec2 q = p * vec2(0.4, 1.2);
  float r2 = dot(q, q);
  float r = sqrt(r2);
  float hill = exp(-r2 * 5.5) * (0.06 + uLevel * 1.4);
  hill += exp(-r2 * 2.0) * uBands.x * 0.34;
  float tremor = snoise(p * 5.0 + vec2(t * 0.7, t * 0.4)) * uBands.y * 0.11 * exp(-r2 * 3.0);
  float ripple = sin(r * 48.0 - t * 3.4) * exp(-r2 * 7.0) * uBands.z * 0.1;

  float height = ground * 0.4 + hill + tremor + ripple;

  // Contour lines of that height, one pixel wide whatever the slope.
  float f = height * 11.0;
  float d = abs(fract(f - 0.5) - 0.5);
  float w = fwidth(f);
  float line = 1.0 - smoothstep(w * 0.55, w * 1.55, d);
  // Every fourth line is an index contour, drawn heavier, as on a survey map.
  float index = step(mod(floor(f + 0.5), 4.0), 0.5);

  float heat = smoothstep(0.1, 0.8, hill);
  vec3 ink = mix(uLine, uHot, heat);
  float strength = line * mix(0.15, 0.4, index) * (1.0 + heat * 1.7);

  vec3 color = mix(uBg, ink, clamp(strength, 0.0, 1.0));
  color += uHot * heat * heat * (0.05 + uLevel * 0.1);

  // Fade into the page at the top and bottom edges.
  float fade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  color = mix(uBg, color, 0.12 + 0.88 * fade);

  fragColor = vec4(color, 1.0);
}`;
