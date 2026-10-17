"use strict";

const MIN_PARTICIPANTS = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @type {{ id: number, name: string, email: string }[]} */
let participants = [];
/** @type {{ giver: number, receiver: number, mutual: boolean }[]} */
let exclusions = [];
let nextId = 1;

const $ = (id) => document.getElementById(id);
const participantsEl = $("participants");
const exclusionsEl = $("exclusions");
const giverSelect = $("exclusion-giver");
const receiverSelect = $("exclusion-receiver");
const feedbackEl = $("feedback");

const isComplete = (p) => p.name.trim() && EMAIL_PATTERN.test(p.email.trim());
const byId = (id) => participants.find((p) => p.id === id);

function addParticipant() {
  const participant = { id: nextId++, name: "", email: "" };
  participants.push(participant);

  const row = document.createElement("div");
  row.className = "participant";
  row.innerHTML = `
    <input class="name" type="text" placeholder="Name" maxlength="100" aria-label="Name" />
    <input class="email" type="email" placeholder="E-Mail-Adresse" maxlength="254" aria-label="E-Mail-Adresse" />
    <button type="button" class="remove" title="Entfernen" aria-label="Entfernen">✕</button>`;

  const [nameInput, emailInput, removeButton] = row.children;
  nameInput.addEventListener("input", () => {
    participant.name = nameInput.value;
    renderExclusionControls();
  });
  emailInput.addEventListener("input", () => {
    participant.email = emailInput.value;
    emailInput.classList.remove("invalid");
    renderExclusionControls();
  });
  emailInput.addEventListener("blur", () => {
    emailInput.classList.toggle("invalid", !!emailInput.value && !EMAIL_PATTERN.test(emailInput.value.trim()));
  });
  removeButton.addEventListener("click", () => {
    participants = participants.filter((p) => p !== participant);
    exclusions = exclusions.filter((e) => e.giver !== participant.id && e.receiver !== participant.id);
    row.remove();
    renderExclusionControls();
  });

  participantsEl.append(row);
  return nameInput;
}

function renderExclusionControls() {
  const complete = participants.filter(isComplete);
  for (const select of [giverSelect, receiverSelect]) {
    const previous = Number(select.value);
    select.replaceChildren(
      ...complete.map((p) => new Option(p.name.trim(), String(p.id), false, p.id === previous)),
    );
  }
  if (giverSelect.value === receiverSelect.value && receiverSelect.options.length > 1) {
    receiverSelect.selectedIndex = giverSelect.selectedIndex === 0 ? 1 : 0;
  }
  $("add-exclusion").disabled = complete.length < 2;

  exclusionsEl.replaceChildren(
    ...exclusions.map((exclusion) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      const arrow = exclusion.mutual ? "⇄" : "→";
      label.textContent = `${byId(exclusion.giver).name.trim() || "?"} ${arrow} ${byId(exclusion.receiver).name.trim() || "?"}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "✕";
      remove.title = "Ausschluss entfernen";
      remove.addEventListener("click", () => {
        exclusions = exclusions.filter((e) => e !== exclusion);
        renderExclusionControls();
      });
      li.append(label, remove);
      return li;
    }),
  );
}

function addExclusion() {
  const giver = Number(giverSelect.value);
  const receiver = Number(receiverSelect.value);
  const mutual = $("exclusion-mutual").checked;
  if (!giver || !receiver) return;
  if (giver === receiver) {
    showFeedback("error", "Bitte zwei verschiedene Personen auswählen.");
    return;
  }
  const exists = exclusions.some(
    (e) =>
      (e.giver === giver && e.receiver === receiver) ||
      (e.mutual && e.giver === receiver && e.receiver === giver),
  );
  if (exists) {
    showFeedback("error", "Dieser Ausschluss existiert bereits.");
    return;
  }
  exclusions.push({ giver, receiver, mutual });
  hideFeedback();
  renderExclusionControls();
}

function showFeedback(kind, message) {
  feedbackEl.className = `feedback ${kind}`;
  feedbackEl.textContent = message;
  feedbackEl.hidden = false;
  feedbackEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideFeedback() {
  feedbackEl.hidden = true;
}

function validate() {
  if (!$("organizer-name").value.trim()) return "Bitte gib deinen Namen als Organisator an.";
  if (!EMAIL_PATTERN.test($("organizer-email").value.trim())) {
    return "Bitte gib eine gültige E-Mail-Adresse für Rückmeldungen an.";
  }
  const filled = participants.filter((p) => p.name.trim() || p.email.trim());
  const incomplete = filled.find((p) => !isComplete(p));
  if (incomplete) {
    return `Bitte Name und gültige E-Mail-Adresse vollständig angeben${incomplete.name.trim() ? ` (${incomplete.name.trim()})` : ""}.`;
  }
  if (filled.length < MIN_PARTICIPANTS) {
    return `Es werden mindestens ${MIN_PARTICIPANTS} Teilnehmer benötigt.`;
  }
  const emails = filled.map((p) => p.email.trim().toLowerCase());
  const duplicate = emails.find((e, i) => emails.indexOf(e) !== i);
  if (duplicate) return `Die E-Mail-Adresse ${duplicate} kommt mehrfach vor.`;
  return null;
}

async function submit(event) {
  event.preventDefault();
  const error = validate();
  if (error) {
    showFeedback("error", error);
    return;
  }

  const filled = participants.filter(isComplete);
  const emailOf = (id) => byId(id).email.trim();
  if (!confirm(`Jetzt auslosen und ${filled.length} Mails verschicken?\nDas Ergebnis kann danach nicht mehr eingesehen werden.`)) {
    return;
  }

  const button = $("submit");
  button.disabled = true;
  button.textContent = "Wird ausgelost …";
  hideFeedback();

  try {
    const response = await fetch("/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: $("event-name").value,
        message: $("message").value,
        organizer: { name: $("organizer-name").value.trim(), email: $("organizer-email").value.trim() },
        participants: filled.map((p) => ({ name: p.name.trim(), email: p.email.trim() })),
        exclusions: exclusions
          .filter((e) => isComplete(byId(e.giver)) && isComplete(byId(e.receiver)))
          .map((e) => ({
          giver: emailOf(e.giver),
          receiver: emailOf(e.receiver),
          mutual: e.mutual,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const summary = data.summarySent
        ? " Du bekommst eine Zusammenfassung und Bescheid, sobald jemand bestätigt."
        : " Die Zusammenfassung an dich konnte allerdings nicht verschickt werden.";
      showFeedback(
        "success",
        (data.dryRun
          ? `🎉 Ausgelost! (Testmodus: ${data.sent} Mails wurden in der Server-Konsole ausgegeben.)`
          : `🎉 Ausgelost! ${data.sent} Mails wurden verschickt.`) + summary,
      );
    } else if (response.status === 401) {
      showLoggedOut();
      showLoginError("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    } else if (Array.isArray(data.failed) && data.failed.length) {
      showFeedback(
        "error",
        `Ausgelost, aber ${data.failed.length} Mail(s) konnten nicht zugestellt werden: ${data.failed.join(", ")}. ` +
          "Da das Ergebnis geheim ist, muss ggf. neu ausgelost werden.",
      );
    } else {
      showFeedback("error", data.error || "Es ist ein Fehler aufgetreten.");
    }
  } catch {
    showFeedback("error", "Der Server ist nicht erreichbar.");
  } finally {
    button.disabled = false;
    button.textContent = "Auslosen & Mails verschicken";
  }
}

let dryRun = false;

function showLoggedIn() {
  $("login-form").hidden = true;
  $("draw-form").hidden = false;
  $("logout").hidden = false;
  $("dry-run-banner").hidden = !dryRun;
}

function showLoggedOut() {
  $("login-form").hidden = false;
  $("draw-form").hidden = true;
  $("logout").hidden = true;
  $("dry-run-banner").hidden = true;
  $("password").value = "";
  $("password").focus();
}

function showLoginError(message) {
  $("login-feedback").textContent = message;
  $("login-feedback").hidden = false;
}

async function login(event) {
  event.preventDefault();
  const button = $("login-submit");
  button.disabled = true;
  $("login-feedback").hidden = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value }),
    });
    if (response.ok) {
      showLoggedIn();
    } else {
      const data = await response.json().catch(() => ({}));
      showLoginError(data.error || "Anmeldung fehlgeschlagen.");
      $("password").select();
    }
  } catch {
    showLoginError("Der Server ist nicht erreichbar.");
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  hideFeedback();
  showLoggedOut();
}

$("add-participant").addEventListener("click", () => addParticipant().focus());
$("add-exclusion").addEventListener("click", addExclusion);
$("draw-form").addEventListener("submit", submit);
$("login-form").addEventListener("submit", login);
$("logout").addEventListener("click", logout);

for (let i = 0; i < MIN_PARTICIPANTS; i++) addParticipant();
renderExclusionControls();

fetch("/api/status")
  .then((r) => r.json())
  .then((status) => {
    dryRun = status.dryRun;
    if (status.authenticated) showLoggedIn();
    else showLoggedOut();
  })
  .catch(() => showLoggedOut());
