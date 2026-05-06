/**
 * Fullscreen WebGL: raymarched field + animated point layer — WebGL2 / WebGL1.
 * WebGL ではシーンを FBO に描画し、ACES / ブルーム / 色差 / スキャンをポストで合成する。
 */
import sceneFragCore from "./shaders/scene.frag.glsl?raw";
import postFragCore from "./shaders/post.frag.glsl?raw";

type GL = WebGLRenderingContext | WebGL2RenderingContext;

const FRAG_CORE = sceneFragCore;
const POST_FRAG_CORE = postFragCore;

export function mountGlField(): void {
  const el = document.getElementById("field");
  if (!(el instanceof HTMLCanvasElement)) return;
  const canvas = el;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const POINT_COUNT = 320;

  const VERT100 = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const VERT300 = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const POST_TEX_REPLACE = /TEX_SAMPLE\(([^,]+),\s*([^)]+)\)/g;

  const POST_FRAG100 =
    "precision highp float;\n" +
    POST_FRAG_CORE.replace(POST_TEX_REPLACE, "texture2D($1, $2)").replace(
      "FRAG_POST_OUT(x)",
      "gl_FragColor = vec4(x, 1.0)"
    );

  const POST_FRAG300 =
    "#version 300 es\nprecision highp float;\nout vec4 o_postColor;\n" +
    POST_FRAG_CORE.replace(POST_TEX_REPLACE, "texture($1, $2)").replace(
      "FRAG_POST_OUT(x)",
      "o_postColor = vec4(x, 1.0)"
    );

  const FRAG100 =
    "precision highp float;\n" + FRAG_CORE.replace("FRAG_OUT(col)", "gl_FragColor = vec4(col, 1.0)");

  const FRAG300 =
    "#version 300 es\nprecision highp float;\nout vec4 o_fragColor;\n" +
    FRAG_CORE.replace("FRAG_OUT(col)", "o_fragColor = vec4(col, 1.0)");

  const PVERT100 = `
attribute vec2 a_seed;
uniform vec3 u_resolution;
uniform float u_time;
uniform float u_animate;
uniform float u_scroll;

varying vec3 v_rgb;

void main() {
  vec2 s = a_seed * 2.0 - 1.0;
  float id = fract(dot(a_seed, vec2(127.1, 311.7)));
  float amp = mix(0.18, 1.0, u_animate);
  float depth = 0.35 + id * 0.92;
  float ph = u_scroll * 5.5;
  float flow = u_time * (0.27 + 0.58 * amp);
  float tt = ph + id * 1.1 + flow;
  float ang = tt * (1.35 + id * 2.6) + length(s) * 5.0 + id * 6.28318;
  vec2 orbit = vec2(cos(ang), sin(ang * 1.11)) * (0.14 + id * 0.82);
  vec2 drift = vec2(
    sin(tt * 0.62 + s.y * 4.1 + id * 10.0),
    cos(tt * 0.48 + s.x * 4.1 + id * 7.0)
  ) * (0.09 + 0.06 * amp);
  vec2 p = s * (0.84 + id * 0.14) + orbit + drift * amp;
  float scrollLift = u_scroll * (0.28 + depth * 0.22);
  float scrollSide = -u_scroll * (0.11 + depth * 0.08);
  p += vec2(scrollSide, scrollLift);
  gl_Position = vec4(p, 0.0, 1.0);
  float px = u_resolution.z;
  gl_PointSize = (1.25 + id * 3.2) * px;
  float hue = fract(id * 0.37 + u_scroll * 0.65 + flow * 0.1);
  v_rgb = mix(vec3(0.0, 0.92, 0.74), vec3(1.0, 0.2, 0.48), hue * 0.88);
}`;

  const PVERT300 = `#version 300 es
in vec2 a_seed;
uniform vec3 u_resolution;
uniform float u_time;
uniform float u_animate;
uniform float u_scroll;

out vec3 v_rgb;

void main() {
  vec2 s = a_seed * 2.0 - 1.0;
  float id = fract(dot(a_seed, vec2(127.1, 311.7)));
  float amp = mix(0.18, 1.0, u_animate);
  float depth = 0.35 + id * 0.92;
  float ph = u_scroll * 5.5;
  float flow = u_time * (0.27 + 0.58 * amp);
  float tt = ph + id * 1.1 + flow;
  float ang = tt * (1.35 + id * 2.6) + length(s) * 5.0 + id * 6.28318;
  vec2 orbit = vec2(cos(ang), sin(ang * 1.11)) * (0.14 + id * 0.82);
  vec2 drift = vec2(
    sin(tt * 0.62 + s.y * 4.1 + id * 10.0),
    cos(tt * 0.48 + s.x * 4.1 + id * 7.0)
  ) * (0.09 + 0.06 * amp);
  vec2 p = s * (0.84 + id * 0.14) + orbit + drift * amp;
  float scrollLift = u_scroll * (0.28 + depth * 0.22);
  float scrollSide = -u_scroll * (0.11 + depth * 0.08);
  p += vec2(scrollSide, scrollLift);
  gl_Position = vec4(p, 0.0, 1.0);
  float px = u_resolution.z;
  gl_PointSize = (1.25 + id * 3.2) * px;
  float hue = fract(id * 0.37 + u_scroll * 0.65 + flow * 0.1);
  v_rgb = mix(vec3(0.0, 0.92, 0.74), vec3(1.0, 0.2, 0.48), hue * 0.88);
}`;

  const PFRAG100 = `
precision mediump float;
varying vec3 v_rgb;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float a = exp(-r * 4.5) * 0.52;
  gl_FragColor = vec4(v_rgb, a);
}`;

  const PFRAG300 = `#version 300 es
precision mediump float;
in vec3 v_rgb;
out vec4 o_fragColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float a = exp(-r * 4.5) * 0.52;
  o_fragColor = vec4(v_rgb, a);
}`;

  function applyGlStaticState(g: GL): void {
    g.disable(g.DEPTH_TEST);
    g.disable(g.STENCIL_TEST);
    g.disable(g.DITHER);
    g.disable(g.CULL_FACE);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
  }

  function compile(gl: GL, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[gl-field]", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(gl: GL, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[gl-field]", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  const glOpt = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  };

  let gl: GL | null = null;
  let program: WebGLProgram | null = null;
  let programPts: WebGLProgram | null = null;
  let programPost: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let bufPts: WebGLBuffer | null = null;
  let fboScene: WebGLFramebuffer | null = null;
  let texScene: WebGLTexture | null = null;
  let postReady = false;
  let locPos = -1;
  let locRes: WebGLUniformLocation | null = null;
  let locTime: WebGLUniformLocation | null = null;
  let locScroll: WebGLUniformLocation | null = null;
  let locAnimate: WebGLUniformLocation | null = null;
  let locInline: WebGLUniformLocation | null = null;
  let locSeed = -1;
  let locPTime: WebGLUniformLocation | null = null;
  let locPRes: WebGLUniformLocation | null = null;
  let locPAnimate: WebGLUniformLocation | null = null;
  let locPScroll: WebGLUniformLocation | null = null;
  let locPostPos = -1;
  let locPostScene: WebGLUniformLocation | null = null;
  let locPostRes: WebGLUniformLocation | null = null;
  let locPostTime: WebGLUniformLocation | null = null;
  let locPostScroll: WebGLUniformLocation | null = null;
  let locPostAnimate: WebGLUniformLocation | null = null;

  function destroySceneFbo() {
    postReady = false;
    if (!gl) return;
    if (texScene) {
      gl.deleteTexture(texScene);
      texScene = null;
    }
    if (fboScene) {
      gl.deleteFramebuffer(fboScene);
      fboScene = null;
    }
  }

  function createSceneFbo() {
    destroySceneFbo();
    if (!gl || width < 2 || height < 2) return false;
    texScene = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texScene);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    fboScene = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texScene, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok) {
      destroySceneFbo();
      return false;
    }
    postReady = true;
    return true;
  }

  function destroyPipeline() {
    destroySceneFbo();
    if (gl && program) gl.deleteProgram(program);
    if (gl && programPts) gl.deleteProgram(programPts);
    if (gl && programPost) gl.deleteProgram(programPost);
    if (gl && buf) gl.deleteBuffer(buf);
    if (gl && bufPts) gl.deleteBuffer(bufPts);
    program = null;
    programPts = null;
    programPost = null;
    buf = null;
    bufPts = null;
  }

  function initPipeline() {
    destroyPipeline();

    gl = canvas.getContext("webgl2", glOpt) as GL | null;
    let useGl2 = !!gl;
    if (!gl) {
      gl = canvas.getContext("webgl", glOpt) as GL | null;
      useGl2 = false;
    }
    if (!gl) return false;
    const vsSrc = useGl2 ? VERT300 : VERT100;
    const fsSrc = useGl2 ? FRAG300 : FRAG100;
    const pvSrc = useGl2 ? PVERT300 : PVERT100;
    const pfSrc = useGl2 ? PFRAG300 : PFRAG100;

    let vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    let fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return false;
    }

    program = link(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!program) return false;

    applyGlStaticState(gl);

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    locPos = gl.getAttribLocation(program, "a_position");
    locRes = gl.getUniformLocation(program, "u_resolution");
    locTime = gl.getUniformLocation(program, "u_time");
    locScroll = gl.getUniformLocation(program, "u_scroll");
    locAnimate = gl.getUniformLocation(program, "u_animate");
    locInline = gl.getUniformLocation(program, "u_inline_finish");

    const pfs = useGl2 ? POST_FRAG300 : POST_FRAG100;
    vs = compile(gl, gl.VERTEX_SHADER, useGl2 ? VERT300 : VERT100);
    fs = compile(gl, gl.FRAGMENT_SHADER, pfs);
    if (vs && fs) {
      programPost = link(gl, vs, fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } else {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      programPost = null;
      console.warn("[gl-field] post-process compile failed");
    }

    if (programPost) {
      locPostPos = gl.getAttribLocation(programPost, "a_position");
      locPostScene = gl.getUniformLocation(programPost, "u_scene");
      locPostRes = gl.getUniformLocation(programPost, "u_resolution");
      locPostTime = gl.getUniformLocation(programPost, "u_time");
      locPostScroll = gl.getUniformLocation(programPost, "u_scroll");
      locPostAnimate = gl.getUniformLocation(programPost, "u_animate");
    } else {
      locPostPos = -1;
      locPostScene = null;
      locPostRes = null;
      locPostTime = null;
      locPostScroll = null;
      locPostAnimate = null;
    }

    vs = compile(gl, gl.VERTEX_SHADER, pvSrc);
    fs = compile(gl, gl.FRAGMENT_SHADER, pfSrc);
    if (vs && fs) {
      programPts = link(gl, vs, fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } else {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      programPts = null;
      console.warn("[gl-field] point layer compile failed");
    }

    if (programPts) {
      bufPts = gl.createBuffer();
      const seeds = new Float32Array(POINT_COUNT * 2);
      for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPts);
      gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

      locSeed = gl.getAttribLocation(programPts, "a_seed");
      locPTime = gl.getUniformLocation(programPts, "u_time");
      locPRes = gl.getUniformLocation(programPts, "u_resolution");
      locPAnimate = gl.getUniformLocation(programPts, "u_animate");
      locPScroll = gl.getUniformLocation(programPts, "u_scroll");
    }

    return true;
  }

  if (!initPipeline()) {
    document.body.classList.add("gl-fallback");
    return;
  }

  let width = 0;
  let height = 0;
  let renderScale = 0.68;
  const SCALE_MIN = 0.44;
  const SCALE_MAX = 1;

  function animAmp() {
    return prefersReducedMotion.matches ? 0.26 : 1;
  }

  function resize() {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.22);
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const nextW = Math.floor(iw * dpr * renderScale);
    const nextH = Math.floor(ih * dpr * renderScale);
    const cssW = `${iw}px`;
    const cssH = `${ih}px`;
    /* 同一寸法なら再設定しない（canvas.width 代入や FBO 再作成が点滅の原因になりやすい） */
    if (width === nextW && height === nextH && canvas.style.width === cssW && canvas.style.height === cssH) {
      return;
    }
    width = nextW;
    height = nextH;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = cssW;
    canvas.style.height = cssH;
    gl.viewport(0, 0, width, height);
    if (programPost) {
      createSceneFbo();
    } else {
      destroySceneFbo();
    }
  }

  function pixelScale() {
    const iw = Math.max(1, window.innerWidth);
    return width / iw;
  }

  /** scrollTop をピクセル平滑（レイアウト変化で比率が跳ばない）→ シェーダー用に整形 */
  let scrollTopTarget = 0;
  let scrollTopSmooth = 0;
  const SCROLL_TAU_SEC = 0.11;

  function syncScrollTarget() {
    const root = document.scrollingElement || document.documentElement;
    scrollTopTarget = root.scrollTop;
  }

  /** ビューポート高で正規化したスクロール量（線形・見た目の連動が取りやすい） */
  function scrollUniformLinear() {
    const vh = Math.max(1, window.innerHeight);
    const rv = scrollTopSmooth / vh;
    return Math.min(2.35, rv * 0.42);
  }

  function onScroll() {
    syncScrollTarget();
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  let timeOrigin = performance.now();
  let animationId: number | null = null;
  let lastNow = performance.now();
  let perfSmooth = 14;
  let perfTicks = 0;
  let layoutPoll = 0;
  let perfUiAcc = 0;

  function drawFrame(): void {
    if (!gl || !program || !buf || locPos < 0 || !locRes || !locScroll || !locAnimate) return;

    const amp = animAmp();
    const t = (performance.now() - timeOrigin) * 0.001;
    const sc = scrollUniformLinear();

    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform3f(locRes, width, height, 1);
    if (locTime) gl.uniform1f(locTime, t);
    gl.uniform1f(locScroll, sc);
    gl.uniform1f(locAnimate, amp);
    if (locInline) gl.uniform1f(locInline, postReady ? 0 : 1);

    if (postReady && fboScene) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboScene);
      gl.viewport(0, 0, width, height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (postReady && programPost && locPostPos >= 0 && locPostScene && texScene) {
      gl.useProgram(programPost);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(locPostPos);
      gl.vertexAttribPointer(locPostPos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texScene);
      gl.uniform1i(locPostScene, 0);
      gl.uniform3f(locPostRes, width, height, 1);
      if (locPostTime) gl.uniform1f(locPostTime, t);
      gl.uniform1f(locPostScroll, sc);
      gl.uniform1f(locPostAnimate, amp);
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    if (programPts && locSeed >= 0 && bufPts) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(programPts);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPts);
      gl.vertexAttribPointer(locSeed, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(locSeed);

      if (locPTime) gl.uniform1f(locPTime, t);
      gl.uniform3f(locPRes, width, height, pixelScale());
      gl.uniform1f(locPAnimate, amp);
      if (locPScroll) gl.uniform1f(locPScroll, sc);

      gl.drawArrays(gl.POINTS, 0, POINT_COUNT);
      gl.disable(gl.BLEND);
    }
  }

  function frame(now: number): void {
    if (!gl || !program) return;

    const dtSec = Math.min(0.092, Math.max(0.001, (now - lastNow) / 1000));
    lastNow = now;

    const tFrame0 = performance.now();

    if (!document.hidden && (++layoutPoll & 15) === 0) {
      syncScrollTarget();
    }

    const alphaScroll = 1 - Math.exp(-dtSec / SCROLL_TAU_SEC);
    scrollTopSmooth += (scrollTopTarget - scrollTopSmooth) * alphaScroll;

    drawFrame();

    const frameMs = performance.now() - tFrame0;
    perfSmooth += (frameMs - perfSmooth) * 0.048;
    perfTicks++;
    /* 解像度スケールの切替は FBO 再作成を伴い一瞬明滅しやすい → 判定を遅く・段差を小さく */
    if (perfTicks >= 200) {
      perfTicks = 0;
      let changed = false;
      if (perfSmooth > 30 && renderScale > SCALE_MIN + 0.02) {
        renderScale = Math.max(SCALE_MIN, renderScale - 0.022);
        changed = true;
      } else if (perfSmooth < 8.2 && renderScale < SCALE_MAX - 0.02) {
        renderScale = Math.min(SCALE_MAX, renderScale + 0.018);
        changed = true;
      }
      if (changed) resize();
    }

    if (!document.hidden) {
      perfUiAcc += dtSec;
      if (perfUiAcc >= 0.22) {
        perfUiAcc = 0;
        window.dispatchEvent(
          new CustomEvent("voidsignal:perf", {
            detail: { frameMs: perfSmooth, renderScale },
          })
        );
      }
    }

    animationId = requestAnimationFrame(frame);
  }

  /** 連続 resize を次フレーム以降に1回へまとめ、canvas/FBO の無駄なリセットを防ぐ */
  let resizeRafOuter: number | null = null;
  let resizeRafInner: number | null = null;
  function scheduleResizeFromWindow(): void {
    if (resizeRafOuter !== null) cancelAnimationFrame(resizeRafOuter);
    resizeRafOuter = requestAnimationFrame(() => {
      resizeRafOuter = null;
      if (resizeRafInner !== null) cancelAnimationFrame(resizeRafInner);
      resizeRafInner = requestAnimationFrame(() => {
        resizeRafInner = null;
        onScroll();
        resize();
        syncScrollTarget();
        scrollTopSmooth = scrollTopTarget;
        drawFrame();
      });
    });
  }

  window.addEventListener("resize", scheduleResizeFromWindow, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleResizeFromWindow, { passive: true });

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
        return;
      }
      if (!gl || !program) return;
      lastNow = performance.now();
      syncScrollTarget();
      scrollTopSmooth = scrollTopTarget;
      if (!animationId) animationId = requestAnimationFrame(frame);
    },
    { passive: true }
  );

  prefersReducedMotion.addEventListener("change", () => {
    startRender();
  });

  canvas.addEventListener(
    "webglcontextlost",
    function (e) {
      e.preventDefault();
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      document.body.classList.add("gl-fallback");
    },
    false
  );

  canvas.addEventListener(
    "webglcontextrestored",
    function () {
      if (!initPipeline()) {
        document.body.classList.add("gl-fallback");
        return;
      }
      timeOrigin = performance.now();
      document.body.classList.remove("gl-fallback");
      startRender();
    },
    false
  );

  function startRender() {
    resize();
    syncScrollTarget();
    document.body.classList.remove("gl-fallback");
    canvas.style.display = "block";

    lastNow = performance.now();
    perfSmooth = 14;
    perfTicks = 0;
    scrollTopSmooth = scrollTopTarget;

    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(frame);
  }

  startRender();
}
