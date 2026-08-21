const MAX_EDGE = 1568;
const MAX_BYTES = 4 * 1024 * 1024;

export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class ImageError extends Error {}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new ImageError('read failed'));
    reader.readAsDataURL(file);
  });
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageError('decode failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Claude downsizes anything past 1568px on the long edge anyway, and its API
 * rejects images over 5MB -- doing the resize here keeps us clear of both and
 * cuts the upload on a phone connection. Re-encoding is lossless PNG on
 * purpose: JPEG artefacts smear thin candles and price labels.
 */
export async function prepareImage(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageError('unsupported type');
  }

  const source = await decode(file);
  const longEdge = Math.max(source.width, source.height);

  if (longEdge <= MAX_EDGE && file.size <= MAX_BYTES) {
    return { imageBase64: await fileToBase64(file), mediaType: file.type };
  }

  const scale = Math.min(1, MAX_EDGE / longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);

  return { imageBase64: canvas.toDataURL('image/png').split(',')[1], mediaType: 'image/png' };
}
