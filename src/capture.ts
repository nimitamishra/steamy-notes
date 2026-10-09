/** Saves the canvas as a PNG — share sheet on touch devices that support it, download otherwise. */
export async function capture(canvas: HTMLCanvasElement): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Capture failed");
  const name = `steamy-notes-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
  const file = new File([blob], name, { type: "image/png" });

  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "steamy notes" });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Fall through to download (e.g. share blocked inside an iframe).
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
