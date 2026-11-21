import { MAX_PHOTO } from './store';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/** 画像を縮小して JPEG の data URL にする（Firestore の1ドキュメント1MB制限に収める） */
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not image');
  const img = await loadImage(file);
  const sizes = [960, 720, 540];
  const qualities = [0.75, 0.6, 0.5];
  for (const max of sizes) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of qualities) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= MAX_PHOTO) return url;
    }
  }
  throw new Error('too large');
}
