/**
 * send-drowsiness-sms
 *
 * Fires when a COMBINED drowsiness event is inserted, and texts the driver's
 * registered emergency contacts through a Philippine SMS gateway.
 *
 * Invoked by a Postgres trigger (see the notify_combined_event function) so
 * the SMS goes out as soon as the row lands, satisfying the thesis
 * requirement of notifying contacts within 30 seconds of a COMBINED alert.
 *
 * SMS PROVIDERS (secret SMS_PROVIDER, default "unisms"):
 *   unisms    - UniSMS (unismsapi.com). Secrets: UNISMS_SECRET_KEY,
 *               optional UNISMS_SENDER_ID (default "Unisoft", the shared
 *               sender that student accounts use). The default sender can
 *               only reach Globe and DITO numbers; Smart/TNT/Sun numbers are
 *               refused by UniSMS without using credits.
 *   semaphore - Semaphore (semaphore.co). Secrets: SEMAPHORE_API_KEY,
 *               optional SEMAPHORE_SENDER_NAME.
 *
 * verify_jwt is disabled because the caller is the database itself, not a
 * signed-in user. The function authenticates the caller with a shared secret
 * header (WEBHOOK_SECRET) instead - without that check, anyone who learned
 * the URL could send SMS at the project's expense.
 *
 * STALENESS GUARD: the Pi queues events locally while offline and uploads
 * them when connectivity returns, so an insert does NOT imply the event just
 * happened. Texting a family member "drowsiness detected" hours after the
 * drive ended would be alarming and useless, so events older than
 * MAX_EVENT_AGE_SECONDS are logged as skipped_stale and never sent.
 *
 * COOLDOWN: a driver who stays drowsy produces a COMBINED event every ~10 s
 * (the Pi's logging interval). Texting contacts every 10 s is spam and burns
 * credits, so after one SMS is sent for a driver, further COMBINED events for
 * that driver are logged as skipped_cooldown until SMS_COOLDOWN_SECONDS has
 * passed. The events themselves are always still stored. Set the
 * SMS_COOLDOWN_SECONDS secret to change it (default 180; 0 disables).
 *
 * DRY RUN: if SMS_DRY_RUN is "true", or the selected provider has no API key,
 * the message is logged to sms_logs (provider "dry-run") without being sent.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SEMAPHORE_ENDPOINT = "https://api.semaphore.co/api/v4/priority";
const UNISMS_ENDPOINT = "https://unismsapi.com/api/sms";
const MAX_EVENT_AGE_SECONDS = 120;
const MESSAGE_MAX_CHARS = 160;
const DEFAULT_COOLDOWN_SECONDS = 180;
const DEFAULT_UNISMS_SENDER = "Unisoft";

interface DrowsinessEvent {
  id: string;
  device_id: string | null;
  user_id: string | null;
  alert_level: string;
  event_timestamp: string;
  ear_value: number | null;
  perclos_value: number | null;
}

type Provider = "unisms" | "semaphore";

function provider(): Provider {
  const raw = (Deno.env.get("SMS_PROVIDER") ?? "unisms").trim().toLowerCase();
  return raw === "semaphore" ? "semaphore" : "unisms";
}

function cooldownSeconds(): number {
  const raw = Deno.env.get("SMS_COOLDOWN_SECONDS");
  if (raw === undefined || raw.trim() === "") return DEFAULT_COOLDOWN_SECONDS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COOLDOWN_SECONDS;
}

/** Gateways accept plain text only. Some date formatters insert special
 * spaces (e.g. U+202F before "PM") and names may contain accents, so map
 * everything to plain ASCII. */
function toPlainText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMessage(event: DrowsinessEvent, driverName: string | null): string {
  const when = new Date(event.event_timestamp).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const who = driverName?.trim() || "The driver";
  const unit = event.device_id ? ` (${event.device_id})` : "";
  const msg = toPlainText(
    `GisingLang ALERT: ${who}${unit} showed severe drowsiness while driving on ${when}. ` +
      `Please check on them.`,
  );
  return msg.length > MESSAGE_MAX_CHARS ? msg.slice(0, MESSAGE_MAX_CHARS - 3) + "..." : msg;
}

/** Local PH format 09xxxxxxxxx (Semaphore). */
function phoneLocal(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("639") && digits.length === 12) return "0" + digits.slice(2);
  if (digits.startsWith("09")) return digits;
  if (digits.startsWith("9") && digits.length === 10) return "0" + digits;
  return digits;
}

/** E.164 format +639xxxxxxxxx (UniSMS). */
function phoneE164(raw: string): string {
  const local = phoneLocal(raw);
  return local.startsWith("09") ? "+63" + local.slice(1) : "+" + local;
}

interface SendResult {
  ok: boolean;
  messageId: string | null;
  responseText: string;
}

async function sendUniSms(key: string, sender: string, phone: string, message: string, eventId: string): Promise<SendResult> {
  const response = await fetch(UNISMS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(key + ":"),
    },
    body: JSON.stringify({
      recipient: phone,
      content: message,
      sender_id: sender,
      metadata: { event_id: eventId },
    }),
  });
  const text = await response.text();
  let messageId: string | null = null;
  let failReason: string | null = null;
  try {
    const parsed = JSON.parse(text);
    messageId = parsed?.message?.reference_id ?? null;
    failReason = parsed?.message?.fail_reason ?? null;
  } catch { /* non-JSON error body; keep raw text */ }
  // 201 = accepted and queued for delivery by UniSMS.
  return { ok: response.status === 201 && !failReason, messageId, responseText: text };
}

async function sendSemaphore(key: string, sender: string, phone: string, message: string): Promise<SendResult> {
  const params = new URLSearchParams({ apikey: key, number: phone, message });
  if (sender) params.set("sendername", sender);
  const response = await fetch(SEMAPHORE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(text);
    messageId = Array.isArray(parsed) ? String(parsed[0]?.message_id ?? "") || null : null;
  } catch { /* keep raw text */ }
  return { ok: response.ok, messageId, responseText: text };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
  if (!expectedSecret || req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let event: DrowsinessEvent;
  try {
    const body = await req.json();
    event = body.record ?? body.event ?? body;
    if (!event?.id) throw new Error("missing event id");
  } catch (err) {
    return json({ error: "bad payload: " + String(err) }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const log = async (row: Record<string, unknown>) => {
    await supabase.from("sms_logs").insert({ event_id: event.id, ...row });
  };

  if (event.alert_level !== "COMBINED") return json({ skipped: "not a COMBINED alert" });

  // Staleness guard - see header comment.
  const ageSeconds = (Date.now() - new Date(event.event_timestamp).getTime()) / 1000;
  if (ageSeconds > MAX_EVENT_AGE_SECONDS) {
    await log({
      phone_number: "-",
      message: "-",
      status: "skipped_stale",
      provider_response: `event was ${Math.round(ageSeconds)}s old (limit ${MAX_EVENT_AGE_SECONDS}s)`,
    });
    return json({ skipped: "stale event", age_seconds: Math.round(ageSeconds) });
  }

  // Cooldown - see header comment.
  const cooldown = cooldownSeconds();
  if (cooldown > 0) {
    const cutoff = new Date(Date.now() - cooldown * 1000).toISOString();
    let recent = supabase
      .from("drowsiness_events")
      .select("id", { count: "exact", head: true })
      .eq("sms_sent", true)
      .neq("id", event.id)
      .gte("created_at", cutoff);
    recent = event.user_id
      ? recent.eq("user_id", event.user_id)
      : recent.eq("device_id", event.device_id ?? "");
    const { count, error: cooldownError } = await recent;
    if (!cooldownError && (count ?? 0) > 0) {
      await log({
        phone_number: "-",
        message: "-",
        status: "skipped_cooldown",
        provider_response: `an SMS was already sent within the last ${cooldown}s`,
      });
      return json({ skipped: "cooldown", cooldown_seconds: cooldown });
    }
  }

  // Look up the driver's active emergency contacts.
  let contacts: { contact_id: string; name: string; phone_number: string }[] = [];
  if (event.user_id) {
    const { data, error } = await supabase
      .from("emergency_contacts")
      .select("contact_id, name, phone_number")
      .eq("user_id", event.user_id)
      .eq("is_active", true);
    if (error) {
      await log({ phone_number: "-", message: "-", status: "failed", provider_response: "contact lookup: " + error.message });
      return json({ error: error.message }, 500);
    }
    contacts = data ?? [];
  }

  if (contacts.length === 0) {
    await log({
      phone_number: "-",
      message: "-",
      status: "skipped_no_contacts",
      provider_response: event.user_id
        ? "driver has no active emergency contacts"
        : "event has no user_id, cannot resolve contacts",
    });
    return json({ skipped: "no emergency contacts" });
  }

  let driverName: string | null = null;
  if (event.user_id) {
    const { data } = await supabase
      .from("users")
      .select("display_name, email")
      .eq("user_id", event.user_id)
      .maybeSingle();
    driverName = data?.display_name ?? data?.email?.split("@")[0] ?? null;
  }

  const message = buildMessage(event, driverName);
  const which = provider();
  const apiKey = which === "unisms" ? Deno.env.get("UNISMS_SECRET_KEY") : Deno.env.get("SEMAPHORE_API_KEY");
  const sender = which === "unisms"
    ? (Deno.env.get("UNISMS_SENDER_ID") ?? DEFAULT_UNISMS_SENDER)
    : (Deno.env.get("SEMAPHORE_SENDER_NAME") ?? "");
  const dryRun = !apiKey || Deno.env.get("SMS_DRY_RUN") === "true";

  const results = [];
  for (const contact of contacts) {
    const phone = which === "unisms" ? phoneE164(contact.phone_number) : phoneLocal(contact.phone_number);
    const startedAt = Date.now();

    if (dryRun) {
      await log({
        contact_id: contact.contact_id,
        phone_number: phone,
        message,
        status: "sent",
        provider: "dry-run",
        provider_response: `SMS_DRY_RUN enabled or ${which} API key unset - not actually sent`,
        latency_ms: 0,
      });
      results.push({ contact: contact.name, phone, dry_run: true });
      continue;
    }

    try {
      const result = which === "unisms"
        ? await sendUniSms(apiKey!, sender, phone, message, event.id)
        : await sendSemaphore(apiKey!, sender, phone, message);
      const latency = Date.now() - startedAt;
      await log({
        contact_id: contact.contact_id,
        phone_number: phone,
        message,
        status: result.ok ? "sent" : "failed",
        provider: which,
        provider_message_id: result.messageId,
        provider_response: result.responseText.slice(0, 500),
        latency_ms: latency,
      });
      results.push({ contact: contact.name, phone, ok: result.ok, latency_ms: latency });
    } catch (err) {
      await log({
        contact_id: contact.contact_id,
        phone_number: phone,
        message,
        status: "failed",
        provider: which,
        provider_response: String(err).slice(0, 500),
        latency_ms: Date.now() - startedAt,
      });
      results.push({ contact: contact.name, phone, ok: false, error: String(err) });
    }
  }

  await supabase.from("drowsiness_events").update({ sms_sent: true }).eq("id", event.id);

  return json({ provider: which, sent: results.length, dry_run: dryRun, results });
});
