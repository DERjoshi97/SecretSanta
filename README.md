# SecretSanta – Wichteln per E-Mail

Web-App für das klassische Wichteln: Der Organisator trägt alle Teilnehmer (Name + E-Mail) ein,
legt optional Ausschlüsse fest (z. B. „Anna und Ben sollen sich nicht gegenseitig ziehen“) und
startet die Auslosung. Jede Person bekommt eine E-Mail mit dem Namen der Person, die sie beschenkt.

- Jede Person zieht genau eine andere Person und wird genau einmal gezogen; niemand zieht sich selbst.
- Ausschlüsse sind einseitig („A darf B nicht ziehen“) oder beidseitig möglich.
- Das Ergebnis bleibt geheim: Es wird nicht gespeichert und auch dem Organisator nicht angezeigt.
- Ist mit den Ausschlüssen keine Auslosung möglich, meldet die App das, bevor Mails verschickt werden.
- Der Organisator bekommt nach der Auslosung eine Zusammenfassung (an wen Mails gingen, ohne Paarungen).
- In jeder Wichtel-Mail steckt ein Button „Erhalten – ich bin dabei!“. Bestätigt jemand, bekommt der
  Organisator eine Mail. Antworten auf die Wichtel-Mail gehen ebenfalls direkt an den Organisator.

## Rückmeldungen

Die Bestätigungslinks kommen ohne Datenbank aus. Alles Nötige (Teilnehmer, Organisator, Anlass)
steht signiert im Link selbst, aber nicht, wen die Person gezogen hat. Links sind 120 Tage gültig.
Damit sie funktionieren, gilt:

- `SESSION_SECRET` muss fest gesetzt sein, sonst werden alte Links nach einem Neustart ungültig.
- Die App muss für die Teilnehmer erreichbar sein. Links auf `http://localhost` funktionieren nur
  auf dem eigenen Rechner. Für öffentlichen Betrieb `PUBLIC_URL` auf die echte Adresse setzen.
- Mehrfaches Bestätigen löst nur eine Benachrichtigung aus, bis der Server neu gestartet wird.

## Starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
cp .env.example .env   # SMTP-Zugangsdaten eintragen (siehe unten)
npm start              # oder: npm run dev (startet bei Änderungen neu)
```

Danach <http://localhost:3000> öffnen.

## Anmeldung

Nur der Organisator darf auslosen. Er meldet sich mit dem Passwort aus `ORGANIZER_PASSWORD`
(in `.env`) an. Ist dort keins gesetzt, erzeugt die App bei jedem Start ein zufälliges Passwort
und zeigt es in der Konsole an. Eine Anmeldung gilt 12 Stunden. Nach 10 falschen Versuchen
wird die IP-Adresse für 15 Minuten gesperrt.

Damit man nach einem Neustart angemeldet bleibt, `SESSION_SECRET` auf eine feste, lange
Zufallszeichenkette setzen. Wenn die App öffentlich erreichbar ist, sollte sie nur über HTTPS
laufen (hinter einem Reverse-Proxy zusätzlich `TRUST_PROXY=true` setzen).

## Mailversand einrichten

Die Mails werden über ein normales SMTP-Konto verschickt. Die Zugangsdaten stehen in `.env`
(diese Datei wird nicht eingecheckt):

| Anbieter | `SMTP_HOST`      | `SMTP_PORT` | Hinweis                                                           |
| -------- | ---------------- | ----------- | ----------------------------------------------------------------- |
| Gmail    | `smtp.gmail.com` | `465`       | [App-Passwort](https://myaccount.google.com/apppasswords) nötig   |
| GMX      | `mail.gmx.net`   | `587`       | SMTP-Zugriff in den GMX-Einstellungen aktivieren                  |
| Web.de   | `smtp.web.de`    | `587`       | SMTP-Zugriff in den Web.de-Einstellungen aktivieren               |

Ist kein `SMTP_HOST` gesetzt (oder `MAIL_DRY_RUN=true`), läuft die App im **Testmodus**: Es wird
ganz normal ausgelost, die Mails werden aber nur in der Server-Konsole ausgegeben.

## Entwicklung

```bash
npm test          # Tests (Auslosung + Eingabeprüfung)
npm run typecheck
```

| Datei                                        | Inhalt                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| [src/draw.ts](src/draw.ts)                   | Auslosungs-Algorithmus inkl. Ausschlüssen            |
| [src/validation.ts](src/validation.ts)       | Prüfung der Eingaben des Organisators                |
| [src/mailer.ts](src/mailer.ts)               | SMTP-Konfiguration und Mail-Inhalt                   |
| [src/auth.ts](src/auth.ts)                   | Organisator-Login (Passwort, Sitzungs-Cookie)        |
| [src/confirmation.ts](src/confirmation.ts)   | Signierte Bestätigungslinks                          |
| [src/pages.ts](src/pages.ts)                 | Bestätigungsseiten für Teilnehmer                    |
| [src/server.ts](src/server.ts)               | Express-Server (Login, Auslosung, `/bestaetigen`)    |
| [public/](public/)                           | Oberfläche (HTML/CSS/JS, ohne Build-Schritt)         |

Die Auslosung zieht zuerst zufällige Permutationen und verwirft ungültige. So ist jede gültige
Zuordnung gleich wahrscheinlich. Nur wenn die Ausschlüsse das zu selten zulassen, sucht sie per
Backtracking weiter.
