import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkPassword,
  clearSessionCookie,
  createAuthConfig,
  isAuthenticated,
  LoginLimiter,
  requireAuth,
  setSessionCookie,
} from "./auth.js";
import { createConfirmationToken, readConfirmationToken } from "./confirmation.js";
import { draw, DrawImpossibleError } from "./draw.js";
import {
  buildConfirmationNotice,
  buildMail,
  buildSummaryMail,
  createMailConfig,
  sendAll,
} from "./mailer.js";
import { confirmedPage, confirmPage, errorPage, invalidLinkPage } from "./pages.js";
import { parseDrawRequest, ValidationError } from "./validation.js";

const mailConfig = createMailConfig();
const authConfig = createAuthConfig();
const loginLimiter = new LoginLimiter();
// Verhindert doppelte Benachrichtigungen, wenn jemand mehrfach bestätigt (bis zum Neustart).
const confirmedTokens = new Set<string>();
const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// Hinter einem Reverse-Proxy (z. B. bei Hostern) TRUST_PROXY=true setzen,
// damit IP-Adresse und HTTPS korrekt erkannt werden.
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.static(publicDir));

/** Basis-URL für Links in Mails. Bei öffentlichem Betrieb PUBLIC_URL setzen. */
function baseUrl(req: express.Request): string {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

app.get("/api/status", (req, res) => {
  res.json({ dryRun: mailConfig.dryRun, authenticated: isAuthenticated(authConfig, req) });
});

app.post("/api/login", (req, res) => {
  const ip = req.ip ?? "unknown";
  if (loginLimiter.isBlocked(ip)) {
    res.status(429).json({ error: "Zu viele Fehlversuche. Bitte versuche es in 15 Minuten erneut." });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkPassword(authConfig, password)) {
    loginLimiter.recordFailure(ip);
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }
  loginLimiter.reset(ip);
  setSessionCookie(authConfig, req, res);
  res.json({ authenticated: true });
});

app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

app.post("/api/draw", requireAuth(authConfig), async (req, res) => {
  try {
    const request = parseDrawRequest(req.body);
    const byEmail = new Map(request.participants.map((p) => [p.email, p]));
    const pairings = draw([...byEmail.keys()], request.exclusions);

    if (!mailConfig.dryRun) {
      // Vor dem Versand prüfen, ob der SMTP-Server erreichbar ist – sonst gingen
      // ausgeloste Paarungen verloren, ohne dass jemand Bescheid weiß.
      await mailConfig.transporter.verify();
    }

    const { eventName, message, organizer } = request;
    const mails = pairings.map(({ giver, receiver }) => {
      const participant = byEmail.get(giver)!;
      const token = createConfirmationToken(authConfig.secret, {
        eventName,
        participantName: participant.name,
        participantEmail: participant.email,
        organizerName: organizer.name,
        organizerEmail: organizer.email,
      });
      const confirmUrl = `${baseUrl(req)}/bestaetigen?token=${encodeURIComponent(token)}`;
      return buildMail(participant, byEmail.get(receiver)!, { eventName, message, organizer, confirmUrl });
    });
    const { sent, failed } = await sendAll(mailConfig, mails);

    const summary = buildSummaryMail(
      organizer,
      eventName,
      sent.map((email) => byEmail.get(email)!),
      failed.map((email) => byEmail.get(email)!),
    );
    const summaryResult = await sendAll(mailConfig, [summary]);

    // Das Ergebnis der Auslosung wird bewusst NICHT zurückgegeben – es bleibt geheim.
    res.status(failed.length ? 502 : 200).json({
      sent: sent.length,
      failed,
      summarySent: summaryResult.failed.length === 0,
      dryRun: mailConfig.dryRun,
    });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DrawImpossibleError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({
      error: "Die Mails konnten nicht verschickt werden. Bitte prüfe die SMTP-Einstellungen.",
    });
  }
});

// Bestätigungslink aus der Wichtel-Mail. GET zeigt nur einen Button – Mailprogramme
// rufen Links oft automatisch zur Virenprüfung auf und dürfen nichts auslösen.
app.get("/bestaetigen", (req, res) => {
  const confirmation = readConfirmationToken(authConfig.secret, req.query.token);
  if (!confirmation) {
    res.status(400).send(invalidLinkPage());
    return;
  }
  res.send(
    confirmPage(
      String(req.query.token),
      confirmation.participantName,
      confirmation.eventName,
      confirmation.organizerName,
    ),
  );
});

app.post("/bestaetigen", async (req, res) => {
  const token = req.body?.token;
  const confirmation = readConfirmationToken(authConfig.secret, token);
  if (!confirmation) {
    res.status(400).send(invalidLinkPage());
    return;
  }
  if (!confirmedTokens.has(token)) {
    const notice = buildConfirmationNotice(
      { name: confirmation.organizerName, email: confirmation.organizerEmail },
      { name: confirmation.participantName, email: confirmation.participantEmail },
      confirmation.eventName,
    );
    const { failed } = await sendAll(mailConfig, [notice]);
    if (failed.length) {
      res.status(502).send(errorPage());
      return;
    }
    confirmedTokens.add(token);
  }
  res.send(confirmedPage(confirmation.organizerName));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Wichteln läuft auf http://localhost:${port}`);
  if (authConfig.generatedPassword) {
    console.log(
      `Kein ORGANIZER_PASSWORD gesetzt – Passwort für diesen Start: ${authConfig.password}`,
    );
  }
  if (authConfig.generatedSecret) {
    console.warn(
      "Achtung: Kein SESSION_SECRET gesetzt – Bestätigungslinks aus Mails funktionieren nach einem Neustart nicht mehr.",
    );
  }
  if (mailConfig.dryRun) {
    console.log("Testmodus: Mails werden nicht verschickt, sondern hier ausgegeben.");
  }
});
