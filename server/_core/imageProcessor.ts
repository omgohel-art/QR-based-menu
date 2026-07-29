import sharp from "sharp";

export interface ImageSizes {
  original: Buffer;
  large: Buffer;
  medium: Buffer;
  thumbnail: Buffer;
  originalMeta: { width: number; height: number; format: string };
}

const SIZES = {
  large: 800,
  medium: 480,
  thumbnail: 200,
} as const;

const WEBP_QUALITY = 82;
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

export async function processImage(input: Buffer): Promise<ImageSizes> {
  if (input.length > MAX_INPUT_SIZE) {
    throw new Error("Image too large (max 10MB)");
  }

  const meta = await sharp(input).metadata();
  const width = meta.width || 800;
  const height = meta.height || 600;
  const format = meta.format || "jpeg";

  const [original, large, medium, thumbnail] = await Promise.all([
    sharp(input)
      .resize(width > 1200 ? 1200 : width, undefined, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer(),
    sharp(input)
      .resize(SIZES.large, undefined, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer(),
    sharp(input)
      .resize(SIZES.medium, undefined, { withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer(),
    sharp(input)
      .resize(SIZES.thumbnail, SIZES.thumbnail, { fit: "cover" })
      .webp({ quality: 75, effort: 4 })
      .toBuffer(),
  ]);

  const resizedMeta = await sharp(original).metadata();

  return {
    original,
    large,
    medium,
    thumbnail,
    originalMeta: {
      width: resizedMeta.width || width,
      height: resizedMeta.height || height,
      format: "webp",
    },
  };
}

export function getResponsiveSrcset(baseUrl: string): string {
  const widths = [200, 480, 800];
  const suffixes = ["_thumb", "_medium", "_large"];
  return suffixes
    .map((s, i) => `${baseUrl.replace(/\.\w+$/, "")}${s}.webp ${widths[i]}w`)
    .join(", ");
}
