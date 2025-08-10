"use client";
import { useState, useEffect } from "react";

type MediaFile = { 
  name: string; 
  path: string; 
  poster?: string; 
  show: string; 
  type: string; 
  rootFolder: string; 
  season?: string;
};

type GroupedMedia = {
  rootFolder: string;
  poster: string;
  seasons: {
    seasonName: string;
    poster: string;
    files: MediaFile[];
  }[];
};

export default function PS3StyleUI() {
  const [media, setMedia] = useState<GroupedMedia[]>([]);
  const [selected, setSelected] = useState<number>(0);

  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch("/api/media");

        if (!res.ok) {
          console.error("API error:", res.status);
          return;
        }

        const data = await res.json();

        if (!Array.isArray(data)) {
          console.error("Unexpected data format:", data);
          return;
        }

        console.log("DATA FROM API:", data);
        const groupedMedia = data.reduce((acc: any, file: MediaFile) => {
          const key = file.rootFolder; 
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(file);
          return acc;
        }, {});

        const withPosters = await Promise.all(
          Object.keys(groupedMedia).map(async (group) => {
            const groupFiles = groupedMedia[group];
            const firstItem = groupFiles[0]; 
            const cleanName = `${firstItem.rootFolder}`
              .replace(/\.[^/.]+$/, "") // remove extension
              .replace(/[._-]/g, " ");  // replace separators with spaces

            try {
              const posterRes = await fetch(
                `/api/poster?query=${encodeURIComponent(cleanName)}`
              );

              if (!posterRes.ok) throw new Error("Poster fetch failed");

              const posterData = await posterRes.json();

              const seasons = groupFiles.reduce((seasonAcc: any, file: MediaFile) => {
                const seasonName = file.season || "Unknown Season"; 
                if (!seasonAcc[seasonName]) {
                  seasonAcc[seasonName] = [];
                }
                seasonAcc[seasonName].push(file);
                return seasonAcc;
              }, {});

              const groupedSeasons = await Promise.all(
                Object.keys(seasons).map(async (seasonName) => {
                  const seasonFiles = seasons[seasonName];
                  const seasonPoster = await fetch(
                    `/api/poster?query=${encodeURIComponent(seasonName)}`
                  ).then(res => res.json()).then(data => data.poster || "/placeholder.jpg");

                  return {
                    seasonName,
                    poster: seasonPoster,
                    files: seasonFiles
                  };
                })
              );

              return {
                rootFolder: firstItem.rootFolder,
                poster: posterData.poster || "/placeholder.jpg",
                seasons: groupedSeasons,
              };
            } catch (err) {
              console.warn(`Poster fetch failed for ${firstItem.rootFolder}`, err);
              return { rootFolder: firstItem.rootFolder, poster: "/placeholder.jpg", seasons: [] };
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
      <h1 style={{ marginBottom: "20px" }}>My Library</h1>

      {/* Media List */}
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
            key={item.rootFolder}
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
              alt={item.rootFolder}
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
              {item.rootFolder}
            </p>
          </div>
        ))}
      </div>

      {/* Video Player */}
      {media[selected] && (
        <div style={{ marginTop: "30px" }}>
          <h2>Now Playing: {media[selected].seasons[0].files[0].name}</h2>
          <video
            key={media[selected].seasons[0].files[0].path}
            controls
            style={{ width: "100%", maxHeight: "70vh" }}
            src={`/api/stream?file=${encodeURIComponent(
              media[selected].seasons[0].files[0].path
            )}`}
          />
        </div>
      )}
    </div>
  );
}
