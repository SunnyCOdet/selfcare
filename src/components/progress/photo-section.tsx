"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Camera, Upload, Loader2, Trash2 } from "lucide-react";

type Photo = {
  id: string;
  storage_path: string;
  photo_type: string;
  taken_on: string;
  url: string | null;
};

const TYPES = ["face", "front", "side", "back"];

export function PhotoSection({ userId, photos }: { userId: string; photos: Photo[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState("front");
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}-${photoType}.${ext}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const { error: dbErr } = await supabase.from("progress_photos").insert({
        user_id: userId,
        storage_path: path,
        photo_type: photoType,
      });
      if (dbErr) throw new Error(dbErr.message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(photo: Photo) {
    await supabase.storage.from("photos").remove([photo.storage_path]);
    await supabase.from("progress_photos").delete().eq("id", photo.id);
    router.refresh();
  }

  return (
    <div className="glass p-6 fade-up" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5 text-accent" /> Progress photos
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setPhotoType(t)}
                className={`chip !py-1.5 !px-3 text-xs capitalize ${photoType === t ? "chip-active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="btn-primary !py-2 !px-4 text-sm cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-muted py-10 text-center">
          No photos yet. Day 1 photos are the ones you&apos;ll treasure most — take them today.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p) =>
            p.url ? (
              <div key={p.id} className="group relative rounded-xl overflow-hidden border border-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.photo_type} className="w-full aspect-3/4 object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-medium capitalize">{p.photo_type}</p>
                    <p className="text-[10px] text-white/60">{p.taken_on}</p>
                  </div>
                  <button
                    onClick={() => remove(p)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-white/70 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
