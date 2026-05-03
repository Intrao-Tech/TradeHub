/**
 * Canvas helper that renders a `react-easy-crop` pixel rectangle into a
 * square Blob ready for `multipart/form-data` upload.
 *
 * Output is normalised to 512×512 (4× the backend's 256-px dimension floor)
 * to keep avatar fidelity reasonable while staying well below the 5 MiB
 * size cap. Caller picks the MIME — defaults to JPEG at 0.9 quality.
 */

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const OUTPUT_SIZE = 512;

export async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  quality = 0.9,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode cropped image.'));
      },
      mime,
      quality,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}
