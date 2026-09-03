import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import { ApiError, apiJson } from "@/lib/api";
import Navbar from "@/layouts/Layout";
import { saveVerifiedSession } from "@/lib/voterSessions";

interface QRVerifyResponse {
  success: boolean;
  valid: boolean;
  reason?: string;
  detail?: string;
  voter_id?: string | number;
  festival_target_id?: number;
  festival?: string;
}

function parseQrValue(value: string) {
  const raw = value.trim().replace(/^#/, "");
  const [publicId = "", secret = ""] = raw.split("/").map(decodeURIComponent);
  return { publicId: publicId.trim(), secret: secret.trim() };
}

export default function QREntry() {
  const [, setLocation] = useLocation();
  const initialQr = parseQrValue(window.location.hash);
  const hasScannedQr = Boolean(initialQr.publicId && initialQr.secret);
  const [message, setMessage] = useState(hasScannedQr ? "Verifying voter QR…" : "QR required");
  const [state, setState] = useState<"idle" | "verifying" | "success" | "error">(hasScannedQr ? "verifying" : "idle");

  useEffect(() => {
    let active = true;
    const { publicId, secret } = parseQrValue(window.location.hash);
    if (!publicId || !secret) return () => { active = false; };

    (async () => {
      setState("verifying");
      setMessage("Verifying voter QR…");
      try {
        const data = await apiJson<QRVerifyResponse>("/api/voter/qr/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: publicId, secret }),
        });
        if (!active) return;
        if (!data.valid || !data.voter_id) {
          setState("error");
          setMessage(data.detail || "A voting session is unavailable for this QR code.");
          return;
        }
        setState("success");
        const verifiedVoterId = String(data.voter_id);
        saveVerifiedSession({
          voterId: verifiedVoterId,
          festival: data.festival,
          festivalTargetId: data.festival_target_id,
          verifiedAt: Date.now(),
        });
        setMessage("QR verified.");
        setLocation(`/?voter_id=${encodeURIComponent(verifiedVoterId)}`);
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof ApiError ? error.message : "Unable to verify the QR code.");
      }
    })();
    return () => { active = false; };
  }, [setLocation]);

  return <>
    <Navbar />
    <main className="min-h-screen pt-24 px-6 pb-10 flex items-center justify-center">
      <section className="glass-panel w-full max-w-lg rounded-3xl p-8 text-center border border-border/70">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          {state === "verifying" ? 
          <Loader2 className="h-7 w-7 animate-spin" /> : state === "success" ? 
          <CheckCircle2 className="h-7 w-7" /> : state === "error" ? 
          <ShieldAlert className="h-7 w-7 text-destructive" /> : <QrCode className="h-7 w-7" />}
        </div>
        <h1 className="text-3xl font-bold mb-3">
          {hasScannedQr ? (state === "success" ? "QR Verified" : "Verifying QR") : "QR Required"}</h1>
        <p className={state === "error" ? "text-destructive" : "text-muted-foreground"}>{message}</p>
        {state === "idle" && 
        <p className="mt-4 text-sm text-muted-foreground">Please scan your official voter QR code with your phone camera. The voting page will open from the QR link.</p>}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Only a valid event QR can open the voting.</div>
      </section>
    </main>
  </>;
}
