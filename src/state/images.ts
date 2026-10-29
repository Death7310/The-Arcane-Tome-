/**
 * Shrinks a picked image to a small portrait (at most 320 px on its longer side, WebP or
 * JPEG). Saves live in the browser's limited storage, so a full-size photo would crowd out
 * characters; a portrait this size is typically 15–40 KB.
 */
export async function fileToPortrait(file: File, max = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That image couldn't be opened. Try a JPEG or PNG."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
