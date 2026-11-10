import type { WhatsAppMessage } from "@/types";
import { clone, db, delay } from "./core";

export interface WhatsAppStatus {
  connected: boolean;
  provider: string;
  number: string;
  lastMessageAt: string;
  today: number;
  week: number;
  documentsToday: number;
  daily: { date: string; messages: number; documents: number }[];
}

// TODO(backend): messages arrive via a Twilio webhook → Supabase edge function → whatsapp_messages table.
export async function listMessages(): Promise<WhatsAppMessage[]> {
  await delay();
  return clone(db.whatsappMessages);
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  await delay(150);
  const today = db.settings.whatsapp.lastMessageAt.slice(0, 10);
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (9 - i));
    return d.toISOString().slice(0, 10);
  });
  const msgs = db.whatsappMessages;
  return clone({
    ...db.settings.whatsapp,
    today: msgs.filter((m) => m.at.startsWith(today)).length,
    week: msgs.filter((m) => m.at.slice(0, 10) > (days[2] ?? "")).length,
    documentsToday: msgs
      .filter((m) => m.at.startsWith(today))
      .reduce((s, m) => s + m.documentIds.length, 0),
    daily: days.map((date) => {
      const day = msgs.filter((m) => m.at.startsWith(date));
      return {
        date,
        messages: day.length,
        documents: day.reduce((s, m) => s + m.documentIds.length, 0),
      };
    }),
  });
}

/** Demo-only toggle so the disconnected banner can be previewed. */
export async function setWhatsAppConnected(connected: boolean) {
  await delay(300);
  db.settings.whatsapp.connected = connected;
  return connected;
}
