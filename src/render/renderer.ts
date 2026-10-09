import { config } from "../config";
import type { CoverFit } from "../coords";
import type { Stamp } from "../strokes";
import {
  createFullscreenTriangle,
  createProgram,
  createTarget,
  deleteTarget,
  pickTargetFormat,
  type Program,
  type Target,
  type TargetFormat,
} from "./gl";
import commonSrc from "./shaders/common.glsl?raw";
import compositeSrc from "./shaders/composite.frag.glsl?raw";
import copySrc from "./shaders/copy.frag.glsl?raw";
import simSrc from "./shaders/fogSim.frag.glsl?raw";

const MAX_STAMPS = 64;

const withCommon = (src: string) => src.replace('#include "common"', commonSrc);

export interface FrameInput {
  dt: number;
  time: number;
  /** blowStrength * blowRate */
  blow: number;
  /** Screen-space point the breath is centered on. */
  blowCenter: { x: number; y: number };
  humidity: number;
  stamps: Stamp[];
  fit: CoverFit;
}

/** Owns the WebGL context: fog simulation (ping-pong) + final composite. */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private sim: Program;
  private copy: Program;
  private composite: Program;
  private fmt: TargetFormat;
  private targets: [Target, Target] | null = null;
  private videoTex: WebGLTexture;
  private hasVideo = false;
  private stampBuf = new Float32Array(MAX_STAMPS * 4);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;
    this.fmt = pickTargetFormat(gl);
    this.sim = createProgram(gl, withCommon(simSrc));
    this.copy = createProgram(gl, copySrc);
    this.composite = createProgram(gl, withCommon(compositeSrc));
    createFullscreenTriangle(gl);

    this.videoTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  get aspect(): number {
    return this.canvas.width / this.canvas.height;
  }

  /** Matches the canvas to its CSS size; resamples the fog so nothing is lost. */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const sw = Math.max(1, Math.round(w / config.fog.simDownscale));
    const sh = Math.max(1, Math.round(h / config.fog.simDownscale));
    if (this.canvas.width === w && this.canvas.height === h && this.targets) return;
    this.canvas.width = w;
    this.canvas.height = h;

    const gl = this.gl;
    const next: [Target, Target] = [createTarget(gl, sw, sh, this.fmt), createTarget(gl, sw, sh, this.fmt)];
    for (const t of next) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (this.targets) {
      gl.useProgram(this.copy.program);
      this.bindTex(0, this.targets[0].tex);
      gl.uniform1i(this.copy.uniform("u_src"), 0);
      this.drawTo(next[0]);
      this.targets.forEach((t) => deleteTarget(gl, t));
    }
    this.targets = next;
  }

  /** Sets the whole fog field (visible and untouched) to a density (0 = clear, 1 = fully fogged). */
  fill(density: number): void {
    const gl = this.gl;
    for (const t of this.targets ?? []) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(density, density, density, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  uploadVideo(video: HTMLVideoElement): void {
    if (video.readyState < 2) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.hasVideo = true;
  }

  frame(input: FrameInput): void {
    if (!this.targets) return;
    this.stepSim(input);
    this.drawComposite(input);
  }

  private stepSim(input: FrameInput): void {
    const gl = this.gl;
    const p = this.sim;
    const f = config.fog;
    gl.useProgram(p.program);
    gl.uniform1f(p.uniform("u_aspect"), this.aspect);
    gl.uniform1f(p.uniform("u_time"), input.time);
    gl.uniform1f(p.uniform("u_humidity"), input.humidity);
    gl.uniform1f(p.uniform("u_regrowCap"), f.regrowCap);
    gl.uniform1f(p.uniform("u_regrowRate"), f.regrowRate);
    gl.uniform1f(p.uniform("u_evapRate"), f.evapRate);
    gl.uniform1f(p.uniform("u_dither"), this.fmt.lowPrecision ? 1 : 0);
    gl.uniform1i(p.uniform("u_prev"), 0);
    gl.uniform2f(p.uniform("u_blowCenter"), input.blowCenter.x, input.blowCenter.y);

    // First pass advances time; extra passes (only when there are many stamps) just apply stamps.
    let i = 0;
    let first = true;
    do {
      const batch = input.stamps.slice(i, i + MAX_STAMPS);
      i += MAX_STAMPS;
      this.stampBuf.fill(0);
      batch.forEach((s, k) => this.stampBuf.set([s.x, s.y, s.r, s.amount], k * 4));
      gl.uniform1f(p.uniform("u_dt"), first ? input.dt : 0);
      gl.uniform1f(p.uniform("u_blow"), first ? input.blow : 0);
      gl.uniform1i(p.uniform("u_stampCount"), batch.length);
      gl.uniform4fv(p.uniform("u_stamps"), this.stampBuf);

      const [src, dst] = this.targets!;
      this.bindTex(0, src.tex);
      this.drawTo(dst);
      this.targets = [dst, src];
      first = false;
    } while (i < input.stamps.length);
  }

  private drawComposite(input: FrameInput): void {
    const gl = this.gl;
    const p = this.composite;
    const fog = this.targets![0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(p.program);
    this.bindTex(0, this.videoTex);
    this.bindTex(1, fog.tex);
    gl.uniform1i(p.uniform("u_video"), 0);
    gl.uniform1i(p.uniform("u_fog"), 1);
    gl.uniform4f(p.uniform("u_fit"), input.fit.scaleX, input.fit.scaleY, input.fit.offsetX, input.fit.offsetY);
    gl.uniform2f(p.uniform("u_fogTexel"), 1 / fog.width, 1 / fog.height);
    gl.uniform2f(p.uniform("u_res"), this.canvas.width, this.canvas.height);
    gl.uniform1f(p.uniform("u_aspect"), this.aspect);
    gl.uniform1f(p.uniform("u_hasVideo"), this.hasVideo ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTex(unit: number, tex: WebGLTexture): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
  }

  private drawTo(t: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.width, t.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
