import nodemailer, { type Transporter } from "nodemailer";
import type { Participant } from "./validation.js";

export type MailConfig = {
  dryRun: boolean;
  from: string;
  transporter: Transporter;
};

/**
 * Liest die SMTP-Einstellungen aus der Umgebung. Ist kein SMTP_HOST gesetzt
 * (oder MAIL_DRY_RUN=true), werden Mails nicht verschickt, sondern nur in der
 * Konsole ausgegeben – praktisch zum Ausprobieren.
 */
export function createMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const dryRun = env.MAIL_DRY_RUN === "true" || !env.SMTP_HOST;
  if (dryRun) {
    return {
      dryRun,
      from: env.MAIL_FROM || "Wichteln <wichteln@example.com>",
      transporter: nodemailer.createTransport({ jsonTransport: true }),
    };
  }

  const port = Number(env.SMTP_PORT || 587);
  return {
    dryRun,
    from: env.MAIL_FROM || env.SMTP_USER || "",
    transporter: nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    }),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };

const WRAPPER_STYLE =
  "font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2933";

export function buildMail(
  giver: Participant,
  receiver: Participant,
  options: { eventName: string; message: string; organizer: Participant; confirmUrl: string },
): Mail {
  const { eventName, message, organizer, confirmUrl } = options;
  const subject = `🎁 ${eventName}: Dein Wichtelpartner steht fest`;
  const text = [
    `Hallo ${giver.name},`,
    "",
    `die Auslosung für „${eventName}" ist erfolgt.`,
    `Du beschenkst: ${receiver.name}`,
    ...(message ? ["", message] : []),
    "",
    `Bitte bestätige ${organizer.name} kurz, dass deine Mail angekommen ist:`,
    confirmUrl,
    "",
    "Pssst – nicht verraten! 🤫",
  ].join("\n");

  const html = `
<div style="${WRAPPER_STYLE}">
  <p>Hallo ${escapeHtml(giver.name)},</p>
  <p>die Auslosung für <strong>${escapeHtml(eventName)}</strong> ist erfolgt.</p>
  <div style="margin:24px 0;padding:20px;border-radius:12px;background:#fdf2f2;text-align:center">
    <div style="font-size:14px;color:#7b1d1d">Du beschenkst</div>
    <div style="font-size:26px;font-weight:700;color:#b91c1c;margin-top:4px">${escapeHtml(receiver.name)}</div>
  </div>
  ${message ? `<p style="white-space:pre-line">${escapeHtml(message)}</p>` : ""}
  <p>Bitte bestätige ${escapeHtml(organizer.name)} kurz, dass deine Mail angekommen ist:</p>
  <p style="text-align:center;margin:20px 0">
    <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#b91c1c;color:#ffffff;text-decoration:none;font-weight:600">Erhalten – ich bin dabei!</a>
  </p>
  <p style="color:#6b7280">Pssst – nicht verraten! 🤫</p>
</div>`;

  // Antworten auf die Mail landen beim Organisator.
  return { to: giver.email, subject, text, html, replyTo: organizer.email };
}

/** Zusammenfassung für den Organisator – ohne Paarungen, das Ergebnis bleibt geheim. */
export function buildSummaryMail(
  organizer: Participant,
  eventName: string,
  sent: Participant[],
  failed: Participant[],
): Mail {
  const list = (people: Participant[]) => people.map((p) => `${p.name} <${p.email}>`);
  const htmlList = (people: Participant[]) =>
    `<ul>${people.map((p) => `<li>${escapeHtml(p.name)} (${escapeHtml(p.email)})</li>`).join("")}</ul>`;

  const text = [
    `Hallo ${organizer.name},`,
    "",
    `die Auslosung für „${eventName}" ist erfolgt. Wer wen beschenkt, bleibt geheim – auch für dich.`,
    "",
    `${sent.length} Mail(s) verschickt an:`,
    ...list(sent).map((line) => `- ${line}`),
    ...(failed.length
      ? ["", `${failed.length} Mail(s) konnten NICHT zugestellt werden:`, ...list(failed).map((l) => `- ${l}`)]
      : []),
    "",
    "Sobald jemand den Erhalt bestätigt, bekommst du eine Mail.",
  ].join("\n");

  const html = `
<div style="${WRAPPER_STYLE}">
  <p>Hallo ${escapeHtml(organizer.name)},</p>
  <p>die Auslosung für <strong>${escapeHtml(eventName)}</strong> ist erfolgt. Wer wen beschenkt, bleibt geheim – auch für dich.</p>
  <p><strong>${sent.length} Mail(s) verschickt an:</strong></p>
  ${htmlList(sent)}
  ${failed.length ? `<p style="color:#b91c1c"><strong>${failed.length} Mail(s) konnten nicht zugestellt werden:</strong></p>${htmlList(failed)}` : ""}
  <p style="color:#6b7280">Sobald jemand den Erhalt bestätigt, bekommst du eine Mail.</p>
</div>`;

  return { to: organizer.email, subject: `📋 ${eventName}: Auslosung erfolgt`, text, html };
}

/** Benachrichtigung an den Organisator, wenn ein Teilnehmer den Erhalt bestätigt. */
export function buildConfirmationNotice(
  organizer: Participant,
  participant: Participant,
  eventName: string,
): Mail {
  const text = [
    `Hallo ${organizer.name},`,
    "",
    `${participant.name} (${participant.email}) hat die Wichtel-Mail für „${eventName}" erhalten und ist dabei.`,
  ].join("\n");
  const html = `
<div style="${WRAPPER_STYLE}">
  <p>Hallo ${escapeHtml(organizer.name)},</p>
  <p>✅ <strong>${escapeHtml(participant.name)}</strong> (${escapeHtml(participant.email)}) hat die Wichtel-Mail für <strong>${escapeHtml(eventName)}</strong> erhalten und ist dabei.</p>
</div>`;
  return {
    to: organizer.email,
    subject: `✅ ${eventName}: ${participant.name} hat bestätigt`,
    text,
    html,
    replyTo: participant.email,
  };
}

export type SendResult = { sent: string[]; failed: string[] };

export async function sendAll(config: MailConfig, mails: Mail[]): Promise<SendResult> {
  const results = await Promise.allSettled(
    mails.map((mail) => config.transporter.sendMail({ ...mail, from: config.from })),
  );

  const sent: string[] = [];
  const failed: string[] = [];
  results.forEach((result, i) => {
    const to = mails[i].to;
    if (result.status === "fulfilled") {
      sent.push(to);
      if (config.dryRun) console.log(`[Testmodus] Mail an ${to}:\n${mails[i].text}\n`);
    } else {
      failed.push(to);
      console.error(`Mail an ${to} fehlgeschlagen:`, result.reason);
    }
  });
  return { sent, failed };
}
