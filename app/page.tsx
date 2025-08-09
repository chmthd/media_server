"use client";
import { useState, useEffect } from "react";

type MediaFile = { name: string; path: string; poster?: string };

export default function PS3StyleUI() {
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [selected, setSelected] = useState<number>(0);

  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/media");
        const files: MediaFile[] = await res.json();

        const withPosters = await Promise.all(
          files.map(async (file) => {
            const cleanName = file.name
              .replace(/\.[^/.]+$/, "") 
              .replace(/[._-]/g, " ");

            try {
              const posterRes = await fetch(
                `/api/poster?query=${encodeURIComponent(cleanName)}`
              );
              const posterData = await posterRes.json();

              return {
                ...file,
                poster: posterData.poster || "/placeholder.jpg",
              };
            } catch {
              return { ...file, poster: "/placeholder.jpg" };
            }
          })
        );

        setMedia(withPosters);
      } catch (err) {
        console.error("Failed to load media:", err);
      }
    }

    loadMedia();
  }, []);

  return (
    <div style={{ background: "#111", color: "#fff", padding: "20px" }}>
      <h1 style={{ marginBottom: "20px" }}> My Library</h1>

      {}
      <div
        style={{
          display: "flex",
          gap: "20px",
          overflowX: "auto",
          scrollBehavior: "smooth",
          paddingBottom: "10px",
        }}
      >
        {media.map((item, index) => (
          <div
            key={item.path}
            style={{
              flex: "0 0 auto",
              textAlign: "center",
              transform: selected === index ? "scale(1.2)" : "scale(1)",
              transition: "transform 0.2s",
              cursor: "pointer",
            }}
            onClick={() => setSelected(index)}
          >
            <img
              src={item.poster}
              alt={item.name}
              style={{
                width: "150px",
                height: "220px",
                objectFit: "cover",
                borderRadius: "8px",
                border:
                  selected === index
                    ? "3px solid #fff"
                    : "3px solid transparent",
              }}
            />
            <p
              style={{
                marginTop: "8px",
                maxWidth: "150px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {item.name}
            </p>
          </div>
        ))}
      </div>

      {/* Video Player */}
      {media[selected] && (
        <div style={{ marginTop: "30px" }}>
          <h2>Now Playing: {media[selected].name}</h2>
          <video
            key={media[selected].path}
            controls
            style={{ width: "100%", maxHeight: "70vh" }}
            src={`/api/stream?file=${encodeURIComponent(
              media[selected].path
            )}`}
          />
        </div>
      )}
    </div>
  );
}
