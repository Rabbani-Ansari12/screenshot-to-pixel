import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** QR code drawn in the browser (the link never leaves the device). */
export function useQrDataUrl(text: string, size = 320): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return url;
}

export function QrCode({
  text,
  label,
  fileName,
  size = 220,
  className,
}: {
  text: string;
  label: string;
  /** Shows a Download PNG button when set. */
  fileName?: string;
  size?: number;
  className?: string;
}) {
  const url = useQrDataUrl(text, size * 2);
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {url ? (
        <img
          src={url}
          alt={label}
          width={size}
          height={size}
          className="rounded-lg border bg-white p-1"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="animate-pulse rounded-lg bg-muted"
          aria-hidden
        />
      )}
      {fileName && url && (
        <Button asChild variant="outline" size="sm">
          <a href={url} download={`${fileName}.png`}>
            <Download className="size-4" /> Download PNG
          </a>
        </Button>
      )}
    </div>
  );
}
