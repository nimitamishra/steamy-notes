"use client";

// Drop-in embed for a Next.js (App Router) site.
//
//   import SteamyNotes from "@/components/SteamyNotes";
//   <SteamyNotes src="https://<user>.github.io/steamy-notes/" />
//
// The iframe only loads after the visitor clicks, so your page never triggers a
// camera/mic prompt on its own. `allow` is required — without it the browser
// blocks camera and mic inside the iframe.

import { useState } from "react";

interface Props {
  /** Deployed URL of steamy notes (GitHub Pages). */
  src: string;
  /** CSS aspect ratio of the frame. */
  aspectRatio?: string;
  className?: string;
}

export default function SteamyNotes({ src, aspectRatio = "4 / 3", className }: Props) {
  const [active, setActive] = useState(false);
  const url = new URL(src);
  url.searchParams.set("embed", "1");

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio,
        borderRadius: 8,
        overflow: "hidden",
        background: "#e7e8e6",
      }}
    >
      {active ? (
        <iframe
          src={url.toString()}
          title="steamy notes — interactive demo"
          allow="camera; microphone; web-share"
          style={{ border: 0, width: "100%", height: "100%", display: "block" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          style={{
            position: "absolute",
            inset: 0,
            border: 0,
            cursor: "pointer",
            background: "transparent",
            font: "inherit",
            fontSize: 14,
            color: "#1c1d1f",
          }}
        >
          try steamy notes →
        </button>
      )}
    </div>
  );
}
