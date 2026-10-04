import { monogramIcon } from "@/lib/app-icon";

// Served at /icon/192 and /icon/512; app/manifest.ts points at both.
export function generateImageMetadata() {
  return [
    { id: "192", contentType: "image/png", size: { width: 192, height: 192 } },
    { id: "512", contentType: "image/png", size: { width: 512, height: 512 } }
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return monogramIcon(Number(await id));
}
