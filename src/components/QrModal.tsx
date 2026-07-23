"use client";

import { useEffect, useState } from "react";
import { fetchBlobUrl } from "@/lib/api";
import Modal from "@/components/Modal";
import type { Participant } from "@/lib/types";

interface Props {
  eventId: string;
  participant: Participant;
  onClose: () => void;
}

/** Shows a participant's QR (the SHA-256 of their identity), fetched with auth. */
export default function QrModal({ eventId, participant, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    fetchBlobUrl(`/api/events/${eventId}/participants/${participant.hash}/qr.png`)
      .then((u) => { revoke = u; setUrl(u); })
      .catch(() => setErr(true));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [eventId, participant.hash]);

  return (
    <Modal title={participant.name} onClose={onClose}>
      <div className="center">
        {err ? (
          <p className="muted">Couldn&apos;t load the QR.</p>
        ) : url ? (
          <img src={url} alt="Check-in QR" width={240} height={240} style={{ borderRadius: 12, border: "1px solid var(--slate-200)" }} />
        ) : (
          <div style={{ padding: 40 }}><span className="spinner spinner--dark" /></div>
        )}
        <p className="muted small mt-16" style={{ wordBreak: "break-all" }}>{participant.hash}</p>
        {url && (
          <a className="btn btn--ghost btn--sm mt-8" href={url} download={`qr-${participant.name}.png`}>
            Download PNG
          </a>
        )}
      </div>
    </Modal>
  );
}
