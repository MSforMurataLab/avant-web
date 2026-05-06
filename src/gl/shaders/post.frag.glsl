uniform sampler2D u_scene;
uniform vec3 u_resolution;
uniform float u_time;
uniform float u_scroll;
uniform float u_animate;

float phash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc * 2.0 - u_resolution.xy) / u_resolution.y;
  vec2 st = fc / u_resolution.xy;
  vec2 px = vec2(1.0) / max(u_resolution.xy, vec2(1.0));
  float amp = mix(0.12, 1.0, u_animate);
  float dist = length(uv);
  vec2 dir = dist > 1e-5 ? uv / dist : vec2(0.0);
  float ab = dist * dist * 0.00135 * mix(0.82, 1.08, amp);

  vec3 c;
  c.r = TEX_SAMPLE(u_scene, st + dir * px * ab * 5.5).r;
  c.g = TEX_SAMPLE(u_scene, st).g;
  c.b = TEX_SAMPLE(u_scene, st - dir * px * ab * 5.5).b;

  vec3 blur =
    TEX_SAMPLE(u_scene, st + px * vec2(1.35, 0.62)).rgb +
    TEX_SAMPLE(u_scene, st - px * vec2(1.18, 0.72)).rgb +
    TEX_SAMPLE(u_scene, st + px * vec2(-0.82, 1.12)).rgb +
    TEX_SAMPLE(u_scene, st - px * vec2(0.92, -1.02)).rgb;
  blur *= 0.25;

  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float bloomAmt = max(lum - 0.5, 0.0) * (2.15 + amp * 0.95);
  vec3 bloomed = c + blur * bloomAmt * vec3(0.96, 0.84, 1.02);

  vec3 x = max(bloomed, vec3(0.0));
  x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  x = clamp(x, 0.0, 1.0);

  float vign = smoothstep(1.4, 0.2, length(uv * vec2(0.9, 1.0)));
  x *= vign;
  /* 走査線は弱めに（u_time 依存を小さくしてフレーム間の明滅感を抑える） */
  float scan = sin(fc.y * 0.45 + u_scroll * 18.0 + u_time * 1.1 * mix(0.2, 0.55, amp)) * 0.006 + 1.0;
  x *= scan;
  /* 画素グレイン: u_time を混ぜると毎フレーム白色ノイズになり点滅に見えるため空間ハッシュのみ */
  x += (phash(fc * 0.31) - 0.5) * 0.008 * mix(0.25, 0.75, amp);

  FRAG_POST_OUT(x);
}
