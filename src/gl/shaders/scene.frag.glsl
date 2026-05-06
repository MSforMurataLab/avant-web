uniform vec3 u_resolution;
uniform float u_time;
uniform float u_scroll;
uniform float u_animate;
uniform float u_inline_finish;

#define STEPS 36
#define MAX_Z 28.0

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec3(17.1);
    a *= 0.5;
  }
  return v;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float scene(vec3 p) {
  float amp = mix(0.07, 1.0, u_animate);
  float ph = u_scroll * 6.28318;
  float flow = u_time * 0.082 * mix(0.22, 1.0, amp);

  vec3 q = p;
  q.xy *= rot(ph * 0.22 + u_scroll * 0.55 + flow);
  q.yz *= rot(ph * 0.15 + u_scroll * 0.38 + flow * 0.78);

  float disp = (fbm(q * 0.11 + ph * 0.05 + flow * 0.15) - 0.5) * 1.1;
  float core = sdSphere(q, 1.55 + disp * 0.35);

  vec3 rq = q;
  rq.xz *= rot(rq.y * 0.35 + ph * 0.2 + flow * 0.55);
  float shell = sdTorus(rq * vec3(1.0, 0.85, 1.0), vec2(2.35, 0.09));
  shell += (fbm(rq * 0.4 + ph * 0.03 + flow * 0.1) - 0.5) * 0.06;

  vec3 fq = abs(fract(q * 0.18 + vec3(ph * 0.04 + flow * 0.06)) - 0.5) / 0.18;
  float shards = sdSphere(fq - vec3(1.8, 0.6 * sin(ph + q.z + flow), 1.2), 0.22);
  shards = min(shards, sdSphere(fq - vec3(-1.6, -0.4 * cos(ph * 0.8 + flow * 0.9), -1.4), 0.18));

  float d = smin(core, shell, 0.65);
  d = smin(d, shards, 0.35);

  return d;
}

vec3 normal(vec3 p) {
  vec2 e = vec2(0.00085, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc * 2.0 - u_resolution.xy) / u_resolution.y;

  float amp = mix(0.12, 1.0, u_animate);
  float flow = u_time * 0.078 * mix(0.22, 1.0, amp);
  vec3 ro = vec3(
    u_scroll * 0.14 + sin(flow * 1.05) * 0.028,
    (u_scroll - 0.48) * 0.55 + sin(flow * 0.88) * 0.02,
    -7.1 + u_scroll * 0.26
  );
  vec3 rd = normalize(vec3(uv, 1.15));

  rd.xy *= rot(u_scroll * 0.22 + sin(flow * 0.65) * 0.045);
  rd.yz *= rot(u_scroll * 0.1 + cos(flow * 0.52) * 0.032);

  float z = 0.0;
  float glow = 0.0;
  vec3 col = vec3(0.008, 0.008, 0.028);

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * z;
    float d = scene(p);
    glow += exp(-abs(d) * 3.4) * 0.022 * mix(0.45, 1.0, amp);

    if (d < 0.0012) {
      vec3 n = normal(p);
      vec3 lp = normalize(vec3(1.3, 1.8, -2.5));
      vec3 vd = -rd;
      float diff = max(dot(n, lp), 0.0);
      float rim = pow(max(0.0, 1.0 - dot(n, vd)), 2.8);
      vec3 h = normalize(lp + vd);
      float spec = pow(max(dot(n, h), 0.0), 52.0);
      float sheen = pow(max(0.0, 1.0 - dot(n, h)), 3.2);

      vec3 base = mix(vec3(0.05, 0.06, 0.12), vec3(0.0, 0.92, 0.72), diff * 0.85);
      base += vec3(1.0, 0.12, 0.38) * rim * 0.95;
      base += vec3(0.25, 0.65, 1.0) * pow(diff, 3.0) * 0.35;
      base += vec3(1.0, 0.96, 0.88) * spec * 0.48;
      base += vec3(0.4, 0.1, 0.28) * sheen * 0.32;
      base += vec3(0.85, 0.12, 0.32) * (1.0 - diff) * 0.14;

      float fog = 1.0 - exp(-z * 0.055);
      col = mix(base, col, fog * 0.25);
      col += vec3(0.0, 0.85, 0.65) * glow * 0.6;
      break;
    }

    if (z > MAX_Z) {
      col += vec3(0.65, 0.05, 0.35) * glow * 0.45;
      col += vec3(0.0, 0.55, 0.9) * glow * 0.35;
      break;
    }

    z += d * 0.85;
  }

  if (u_inline_finish > 0.5) {
    float vign = smoothstep(1.35, 0.25, length(uv * vec2(0.9, 1.0)));
    col *= vign;
    float scan = sin(fc.y * 0.45 + u_scroll * 18.0 + u_time * 1.1 * mix(0.2, 0.55, amp)) * 0.006 + 1.0;
    col *= scan;
  }

  FRAG_OUT(col);
}
