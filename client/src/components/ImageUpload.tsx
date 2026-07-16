import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ImagePlus, Upload, X, Loader2 } from "lucide-react";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

interface ImageUploadProps {
  currentImageUrl: string | null;
  onImageChange: (url: string | null) => void;
}

export default function ImageUpload({ currentImageUrl, onImageChange }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(currentImageUrl);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setError("");

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Invalid format. Use JPG, PNG, or WEBP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File too large. Max 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from("food-images")
        .upload(fileName, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("food-images")
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;
      setPreview(publicUrl);
      onImageChange(publicUrl);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onImageChange]);

  const handleFile = useCallback((file: File) => {
    uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [handleFile]);

  const handleDelete = useCallback(async () => {
    if (preview) {
      const path = preview.split("/").pop();
      if (path) {
        await supabase.storage.from("food-images").remove([path]);
      }
    }
    setPreview(null);
    onImageChange(null);
  }, [preview, onImageChange]);

  if (preview) {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Food Image</label>
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="h-8 px-3 rounded-lg bg-white/90 backdrop-blur text-xs font-medium text-slate-700 hover:bg-white shadow-sm border border-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Change
            </button>
            <button
              onClick={handleDelete}
              className="h-8 px-3 rounded-lg bg-red-500/90 backdrop-blur text-xs font-medium text-white hover:bg-red-600 shadow-sm transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Food Image</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          isDragOver
            ? "border-[#C08A4D] bg-[#C08A4D]/5"
            : "border-slate-300 hover:border-[#C08A4D]/50 hover:bg-slate-50"
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-[#C08A4D] animate-spin" />
            <p className="text-sm text-slate-500">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-[#C08A4D]/10 flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-[#C08A4D]" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Upload Food Image</p>
              <p className="text-xs text-slate-400 mt-1">Drag & drop or click to choose</p>
            </div>
            <p className="text-[10px] text-slate-400">JPG, PNG, WEBP — Max 5 MB</p>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
