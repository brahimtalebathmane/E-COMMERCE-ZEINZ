const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateReceiptFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Please upload a JPG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return "File must be 5MB or smaller.";
  }
  return null;
}

export function validateFormFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Please upload a JPG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return "File must be 5MB or smaller.";
  }
  return null;
}
