import { monogramIcon } from "@/lib/app-icon";

// The iPhone home-screen icon (Add to Home Screen), served at /apple-icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return monogramIcon(size.width);
}
