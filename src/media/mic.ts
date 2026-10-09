import { computeFeatures, type AudioFeatures } from "../input/blowDetector";

/** Wraps an AnalyserNode on the mic stream. Create the AudioContext inside a user gesture. */
export class Mic {
  private analyser: AnalyserNode;
  private spectrum: Float32Array<ArrayBuffer>;
  private wave: Float32Array<ArrayBuffer>;

  constructor(
    readonly ctx: AudioContext,
    stream: MediaStream,
  ) {
    const src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    src.connect(this.analyser);
    // Some browsers (notably Safari) don't process nodes that aren't pulled by the destination.
    // Route through a muted gain so the analyser always gets data without playing the mic back.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.analyser.connect(mute).connect(ctx.destination);
    this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
    this.wave = new Float32Array(this.analyser.fftSize);
  }

  read(): AudioFeatures {
    this.analyser.getFloatFrequencyData(this.spectrum);
    this.analyser.getFloatTimeDomainData(this.wave);
    return computeFeatures(this.spectrum, this.wave, this.ctx.sampleRate);
  }
}
