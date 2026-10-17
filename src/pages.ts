import { escapeHtml } from "./mailer.js";

/** Einfache, serverseitig erzeugte Seite im Stil der App. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎁</text></svg>" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main>
      <header><h1>🎁 Wichteln</h1></header>
      <section class="card">${body}</section>
    </main>
  </body>
</html>`;
}

export function confirmPage(token: string, participantName: string, eventName: string, organizerName: string) {
  return page(
    "Erhalt bestätigen",
    `<h2>Hallo ${escapeHtml(participantName)}!</h2>
     <p>Bestätige ${escapeHtml(organizerName)}, dass du deine Wichtel-Mail für
        <strong>${escapeHtml(eventName)}</strong> erhalten hast.</p>
     <form method="post" action="/bestaetigen">
       <input type="hidden" name="token" value="${escapeHtml(token)}" />
       <button type="submit" class="primary">Erhalten – ich bin dabei!</button>
     </form>`,
  );
}

export function confirmedPage(organizerName: string) {
  return page(
    "Bestätigt",
    `<h2>Danke! 🎉</h2>
     <p>${escapeHtml(organizerName)} wurde benachrichtigt. Viel Spaß beim Wichteln!</p>`,
  );
}

export function invalidLinkPage() {
  return page(
    "Link ungültig",
    `<h2>Dieser Link ist leider ungültig</h2>
     <p>Er ist entweder abgelaufen oder unvollständig. Bitte melde dich direkt beim Organisator.</p>`,
  );
}

export function errorPage() {
  return page(
    "Fehler",
    `<h2>Das hat nicht geklappt</h2>
     <p>Die Bestätigung konnte gerade nicht verschickt werden. Bitte versuche es später noch einmal.</p>`,
  );
}
