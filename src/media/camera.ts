export interface MediaGrant {
  video: MediaStream | null;
  audio: MediaStream | null;
}

const VIDEO: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

// Browser voice processing treats blowing as noise and removes it — turn it all off.
const AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * Asks for camera + mic in one prompt. If that fails (one was denied or is missing),
 * retries each separately so the app still works with whatever the user allowed.
 */
export async function requestMedia(): Promise<MediaGrant> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { video: null, audio: null };
  try {
    const both = await md.getUserMedia({ video: VIDEO, audio: AUDIO });
    return {
      video: new MediaStream(both.getVideoTracks()),
      audio: new MediaStream(both.getAudioTracks()),
    };
  } catch {
    const video = await md.getUserMedia({ video: VIDEO }).catch(() => null);
    const audio = await md.getUserMedia({ audio: AUDIO }).catch(() => null);
    return { video, audio };
  }
}

export async function attachVideo(el: HTMLVideoElement, stream: MediaStream): Promise<void> {
  el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  await el.play();
  if (el.videoWidth === 0) {
    await new Promise<void>((resolve) => el.addEventListener("loadedmetadata", () => resolve(), { once: true }));
  }
}

export function setTracksEnabled(streams: (MediaStream | null)[], enabled: boolean): void {
  for (const s of streams) s?.getTracks().forEach((t) => (t.enabled = enabled));
}
