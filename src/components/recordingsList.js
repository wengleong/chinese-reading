import { listRecordings, deleteRecording } from "../lib/storage.js";

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export async function renderRecordingsList({ root }) {
  root.innerHTML = "";
  const card = document.createElement("div");
  card.className = "recordings";
  const heading = document.createElement("h3");
  heading.textContent = "我的录像 My recordings";
  card.appendChild(heading);

  const items = await listRecordings();
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "privacy-note";
    empty.textContent = "还没有录像 (No recordings yet).";
    card.appendChild(empty);
    root.appendChild(card);
    return;
  }

  for (const r of items) {
    const row = document.createElement("div");
    row.className = "recording-row";

    const label = document.createElement("div");
    label.className = "label";
    label.innerHTML = `<strong>${r.storyTitle}</strong><small>${fmtDate(
      r.createdAt
    )} · ${fmtDuration(r.durationMs || 0)}</small>`;

    const url = URL.createObjectURL(r.blob);

    const playBtn = document.createElement("button");
    playBtn.className = "secondary";
    playBtn.textContent = "▶ Play";
    playBtn.addEventListener("click", () => {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.title = r.storyTitle;
      w.document.body.style.margin = "0";
      w.document.body.style.background = "#000";
      const v = w.document.createElement("video");
      v.src = url;
      v.controls = true;
      v.autoplay = true;
      v.style.width = "100%";
      v.style.height = "100%";
      w.document.body.appendChild(v);
    });

    const dlBtn = document.createElement("a");
    dlBtn.className = "secondary";
    dlBtn.textContent = "⬇ Download";
    dlBtn.href = url;
    const blobType = (r.blob && r.blob.type) || r.mimeType || "";
    const ext = blobType.includes("mp4")
      ? "mp4"
      : blobType.includes("ogg")
      ? "ogv"
      : "webm";
    dlBtn.download = `${r.storyId}-${r.createdAt}.${ext}`;
    dlBtn.role = "button";

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "🗑 Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this recording? This cannot be undone.")) return;
      await deleteRecording(r.id);
      URL.revokeObjectURL(url);
      await renderRecordingsList({ root });
    });

    row.appendChild(label);
    row.appendChild(playBtn);
    row.appendChild(dlBtn);
    row.appendChild(delBtn);
    card.appendChild(row);
  }

  root.appendChild(card);
}
