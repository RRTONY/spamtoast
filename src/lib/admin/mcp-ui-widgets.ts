// MCP Apps resource for the change tools: one card rendered by hosts that
// support the MCP Apps extension (ChatGPT, Claude; see https://mcpui.dev).
// Hosts that don't just show the tool's plain text result instead, so this
// is additive, not a replacement.
//
// Built for a non-technical owner (team feedback, 2026-10-06): every view
// leads with ONE status and the next step, and the actions always sit in
// the same place, in the same order, greyed out when not available:
//   Preview | Discard | Publish   (+ Retry when something failed or stuck)
// The server decides the status, next step and which actions work
// (change-describe.ts reviewOutcome), so the card never has to guess.
//
// Views, one per result (never a drill-down inside one card):
// - "confirm" (start_change): "I understand your request as ...", where it
//   applies (Desktop and mobile by default), Yes, proceed / Tell me what you
//   meant. Yes calls confirm_change, then posts "Yes, go ahead" into the chat
//   so the AI carries on.
// - "detail" (list_pending_changes with one change): status + next step +
//   actions, what will go live (always ending with what is NOT included),
//   the checks (Build, Type check, Lint, GitHub checks), before
//   and after.
// - "list" (several waiting changes): each with its own Review button, so an
//   old waiting change never stands in the way of a new one.
// - "history" (list_change_history): who changed what and when, with a
//   Restore button on published changes (prepares an Undo change to review).
//
// Buttons call the server through the App runtime's callServerTool bridge
// (@modelcontextprotocol/ext-apps). Rules-gated tools get the rules version
// the server put in the result's _meta (card-only, never shown to the
// model). Each button is hidden or greyed out for roles that can't use it.
//
// Host theme, fonts and colours via applyDocumentTheme /
// applyHostStyleVariables / applyHostFonts with light/dark fallbacks; brand
// gold only on the one primary button; no inner scrolling (long lists
// collapse to "+N more"); plain words. Every server value is HTML-escaped
// and links must be https. No red anywhere (team standard): failures use the
// brand purple plus words, never colour alone.
//
// The runtime loads from esm.sh inside the sandboxed iframe (csp
// resourceDomains), so it adds no dependency to this server. The URI is
// versioned because ChatGPT caches a card's HTML by URI.
export const PENDING_CHANGES_UI_URI =
  "ui://spamtoast-admin/pending-changes-v1.html";

export const PENDING_CHANGES_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    color-scheme: light dark;
    --fallback-text: #1f1f1f;
    --fallback-muted: #5f5f5f;
    --fallback-border: rgba(0,0,0,0.12);
    --fallback-surface: rgba(0,0,0,0.035);
    --alert: #4A1D5E;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fallback-text: #ececec;
      --fallback-muted: #b0b0b0;
      --fallback-border: rgba(255,255,255,0.14);
      --fallback-surface: rgba(255,255,255,0.05);
      --alert: #D3B5E3;
    }
  }
  :root[data-theme="dark"] {
    --fallback-text: #ececec;
    --fallback-muted: #b0b0b0;
    --fallback-border: rgba(255,255,255,0.14);
    --fallback-surface: rgba(255,255,255,0.05);
    --alert: #D3B5E3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: transparent;
    color: var(--color-text-primary, var(--fallback-text));
    font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    font-size: var(--font-text-md-size, 14px);
    line-height: var(--font-text-md-line-height, 1.45);
  }
  .card { display: flex; flex-direction: column; gap: 12px; }
  h2 {
    margin: 0;
    font-size: var(--font-heading-sm-size, 16px);
    line-height: var(--font-heading-sm-line-height, 1.3);
    font-weight: var(--font-weight-semibold, 600);
  }
  h3 {
    margin: 0 0 4px;
    font-size: var(--font-text-sm-size, 13px);
    font-weight: var(--font-weight-semibold, 600);
  }
  p { margin: 0; }
  .muted { color: var(--color-text-secondary, var(--fallback-muted)); font-size: var(--font-text-sm-size, 13px); }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: var(--font-weight-semibold, 600);
    padding: 2px 8px; border-radius: var(--border-radius-full, 999px);
    white-space: nowrap; flex: none;
    box-shadow: inset 0 0 0 1px var(--color-border-primary, var(--fallback-border));
  }
  .dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
  .dot.success { background: var(--color-text-success, #15803d); }
  .dot.pending { background: var(--color-text-warning, #b45309); }
  .dot.failure { background: var(--alert); }
  .dot.unknown { background: var(--color-text-tertiary, #9ca3af); }
  .box {
    margin: 0; padding: 10px 12px; list-style: none;
    border-radius: var(--border-radius-md, 8px);
    background: var(--color-background-secondary, var(--fallback-surface));
    display: flex; flex-direction: column; gap: 6px;
    font-size: var(--font-text-sm-size, 13px);
  }
  .box li { min-width: 0; overflow-wrap: anywhere; }
  .row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .row .muted { flex: none; }
  a { color: inherit; text-underline-offset: 2px; }
  .ba { display: grid; grid-template-columns: 4.2em 1fr; gap: 2px 8px; }
  .ba .k { color: var(--color-text-secondary, var(--fallback-muted)); }
  .ba .before { text-decoration: line-through; text-decoration-thickness: 1px; color: var(--color-text-secondary, var(--fallback-muted)); }
  .note { font-size: var(--font-text-sm-size, 13px); }
  .note.error { color: var(--alert); font-weight: var(--font-weight-semibold, 600); }
  .note.success { color: var(--color-text-success, #15803d); }
  .confirm {
    padding: 10px 12px; border-radius: var(--border-radius-md, 8px);
    box-shadow: inset 0 0 0 1px var(--color-border-primary, var(--fallback-border));
    font-size: var(--font-text-sm-size, 13px);
  }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .btn {
    appearance: none; border: 0; cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 40px; padding: 0 16px;
    border-radius: var(--border-radius-full, 999px);
    font: inherit; font-size: var(--font-text-sm-size, 13px);
    font-weight: var(--font-weight-semibold, 600);
  }
  .btn:focus-visible { outline: 2px solid var(--color-ring-primary, #2563eb); outline-offset: 2px; }
  .btn:disabled { opacity: 0.55; cursor: default; }
  /* Brand accent only on the single primary action, per the UI guidelines. */
  .btn.primary { background: #d4a843; color: #2a1f14; }
  .btn.secondary {
    background: transparent;
    color: var(--color-text-primary, var(--fallback-text));
    box-shadow: inset 0 0 0 1px var(--color-border-primary, var(--fallback-border));
  }

  .status {
    display: flex; flex-direction: column; gap: 6px;
    padding: 12px; border-radius: var(--border-radius-md, 8px);
    background: var(--color-background-secondary, var(--fallback-surface));
  }
  .status .big { display: flex; align-items: center; gap: 8px; font-weight: var(--font-weight-semibold, 600); font-size: var(--font-text-md-size, 14px); }
  .status .big .dot { width: 10px; height: 10px; }
  .status .next { font-size: var(--font-text-sm-size, 13px); }
  .dot.issues { background: var(--color-text-warning, #b45309); }
  .checks li { display: grid; grid-template-columns: 10px minmax(0, 9em) minmax(0, 1fr); gap: 2px 8px; align-items: baseline; }
  .checks .dot { align-self: center; }
  .checks .what { font-weight: var(--font-weight-semibold, 600); }
  .understood { margin: 0; padding: 8px 12px; border-left: 3px solid var(--color-border-primary, var(--fallback-border)); }
  fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  legend { font-weight: var(--font-weight-semibold, 600); margin-bottom: 4px; padding: 0; }
  label.opt { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .linkbtn { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .linkbtn:disabled { opacity: 0.55; cursor: default; }
  .pending li { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
  .pending li + li { border-top: 1px solid var(--color-border-primary, var(--fallback-border)); padding-top: 10px; }
  .pending .head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .pending .asked { font-style: italic; }
  .pending .actions { margin-top: 0; }
  .hist li { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .hist .who { min-width: 0; }
</style>
</head>
<body>
  <div id="root" class="card" aria-live="polite"><span class="muted">Loading…</span></div>
  <script type="module">
    // Exact versions of the runtime's own dependencies (?deps=): left open,
    // esm.sh picked zod 4.x, whose esm.sh build lacks z.custom, so the SDK
    // crashed on import and ChatGPT showed "Couldn't display tonyweb"
    // (2026-10-17). zod 3.25.76 ships the same v4 API and builds correctly.
    const RUNTIME = "https://esm.sh/@modelcontextprotocol/ext-apps@1.7.5?deps=@modelcontextprotocol/sdk@1.30.0,zod@3.25.76";
    const root = document.getElementById("root");
    let runtime;
    try {
      runtime = await import(RUNTIME);
    } catch (e) {
      root.innerHTML = '<p class="muted">The review card could not load just now. Everything it would show is in the chat reply above; ask there to publish or discard.</p>';
      throw e;
    }
    const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = runtime;

    const MAX_ITEMS = 6;
    const MAX_BEFORE_AFTER = 4;
    let data = null;
    let rulesVersion = null;
    let confirming = null; // "publish" | "discard" | null
    let busy = null;       // name of the running action, or null
    let note = null;
    let scope = "both";

    function esc(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function safeUrl(url) {
      return typeof url === "string" && url.indexOf("https://") === 0 ? url : null;
    }
    function when(iso) {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    function day(iso) {
      const d = new Date(iso);
      return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    function capped(items, render) {
      const shown = items.slice(0, MAX_ITEMS).map(render);
      if (items.length > MAX_ITEMS) shown.push('<li class="muted">+' + (items.length - MAX_ITEMS) + ' more</li>');
      return shown.join("");
    }
    function noteHtml() {
      return note ? '<div class="note ' + note.kind + '" role="status">' + esc(note.text) + '</div>' : "";
    }

    // One colour per status, always with words next to it.
    const STATE_DOT = {
      awaiting_ok: "pending", working: "unknown", checking: "pending", ready: "success",
      failed: "failure", stuck: "pending", published: "success", discarded: "unknown",
    };
    const CHECK_DOT = {
      passed: "success", issues: "issues", running: "pending", not_run: "pending",
      timed_out: "pending", failed: "failure", could_not_run: "failure", not_needed: "unknown",
    };
    const CHECK_WORD = {
      passed: "Passed", issues: "Passed with notes", running: "Running", not_run: "Not run yet",
      timed_out: "Timed out", failed: "Failed", could_not_run: "Could not run", not_needed: "Not needed",
    };
    const STATUS_DOT = { awaiting_confirmation: "pending", draft: "unknown", ready_for_review: "pending", published: "success", discarded: "unknown" };

    function statusBlock(stateKey, label, next) {
      return '<div class="status" role="status"><div class="big"><span class="dot ' + (STATE_DOT[stateKey] || "unknown") + '" aria-hidden="true"></span>' +
        esc(label) + '</div>' + (next ? '<div class="next"><strong>Next step:</strong> ' + esc(next) + '</div>' : "") + '</div>';
    }
    function button(id, label, kind, enabled, title) {
      return '<button class="btn ' + kind + '" id="' + id + '"' + (enabled ? "" : " disabled") +
        (title ? ' title="' + esc(title) + '"' : "") + '>' + esc(label) + '</button>';
    }

    // ── Confirm what the AI understood (start_change) ─────────────────────
    function renderConfirm() {
      const d = data;
      const parts = ['<h2>' + esc(d.title) + '</h2>'];
      parts.push(statusBlock(d.state, d.stateLabel, d.nextStep));
      parts.push('<div><h3>I understand your request as:</h3><p class="understood">' + esc(d.understoodAs) + '</p></div>');
      if (d.state === "awaiting_ok") {
        const opts = [["both", "Both desktop and mobile"], ["desktop", "Desktop only"], ["mobile", "Mobile only"]];
        parts.push('<fieldset' + (busy ? " disabled" : "") + '><legend>Where should this change apply?</legend>' + opts.map(function (o) {
          return '<label class="opt"><input type="radio" name="scope" value="' + o[0] + '"' + (scope === o[0] ? " checked" : "") + ' /> ' + esc(o[1]) + '</label>';
        }).join("") + '</fieldset>');
        parts.push(noteHtml());
        const can = !!rulesVersion;
        parts.push('<div class="actions">' +
          button("yes-proceed", busy === "confirm" ? "Saving…" : "Yes, proceed", "primary", can && !busy) +
          button("not-quite", "Tell me what you meant", "secondary", !busy) + '</div>');
        if (!can) parts.push('<p class="muted">Say yes in the chat to let the AI start.</p>');
      } else {
        parts.push('<p class="muted">Applies to: ' + esc(d.appliesToLabel) + '</p>');
        parts.push(noteHtml());
      }
      parts.push(pendingSection(d.otherPending, "Other pending changes"));
      root.innerHTML = parts.join("");
      bindPending(d.otherPending);
      document.querySelectorAll('input[name="scope"]').forEach(function (el) {
        el.onchange = function () { scope = el.value; };
      });
      bind("yes-proceed", confirmYes);
      bind("not-quite", notQuite);
    }

    async function confirmYes() {
      busy = "confirm"; note = null; render();
      try {
        const result = await app.callServerTool({ name: "confirm_change", arguments: { change_id: data.changeId, applies_to: scope, rules_version: rulesVersion } });
        const out = result.structuredContent || readText(result);
        busy = null;
        if (result.isError || !out || out.ok === false) {
          note = { kind: "error", text: (out && out.error) || "That didn't work. Say yes in the chat instead." };
        } else {
          data.state = "working"; data.stateLabel = "Working";
          data.nextStep = "The AI is making this change. Nothing to do yet.";
          data.appliesToLabel = out.appliesToLabel || data.appliesToLabel;
          note = { kind: "success", text: "Thanks, the AI is starting now." };
          tell("Yes, that's right. Go ahead (" + (out.appliesToLabel || "desktop and mobile") + ").");
        }
      } catch (e) {
        busy = null;
        note = { kind: "error", text: "That didn't work. Say yes in the chat instead." };
      }
      render();
    }
    function notQuite() {
      note = { kind: "success", text: "Type what you meant in the chat below. Nothing has been changed." };
      tell("That's not quite what I meant.");
      render();
    }
    function tell(text) {
      try { app.sendMessage({ role: "user", content: [{ type: "text", text: text }] }).catch(function () {}); } catch (e) {}
    }

    // ── Other pending changes (every view) ─────────────────────────────────
    // Each row has its own buttons. Publish and Discard first open THAT
    // change's review with the confirm step showing, so the person always
    // sees exactly what goes live and publishing one never takes another.
    function pendingSection(rows, heading) {
      if (!Array.isArray(rows)) return "";
      if (!rows.length) return '<div><h3>' + esc(heading) + '</h3><p class="muted">No other pending changes.</p></div>';
      const can = !!rulesVersion && !busy;
      return '<div><h3>' + esc(heading) + ' (' + rows.length + ')</h3><ul class="box pending" aria-label="' + esc(heading) + '">' +
        capped(rows, function (r, i) {
          const tag = "p" + i;
          return '<li><div class="head"><button class="linkbtn" id="' + tag + '-open"' + (busy ? " disabled" : "") + '><strong>' + esc(r.title) + '</strong></button>' +
            '<span class="chip"><span class="dot ' + (STATUS_DOT[r.status] || "unknown") + '" aria-hidden="true"></span>' + esc(r.statusLabel) + '</span></div>' +
            '<span class="muted">Asked by ' + esc(r.requestedBy) + ', ' + esc(when(r.createdAt)) + '</span>' +
            (r.request ? '<span class="muted asked">"' + esc(r.request.length > 160 ? r.request.slice(0, 157) + "…" : r.request) + '"</span>' : "") +
            '<div class="actions">' +
            button(tag + "-preview", "Preview", "secondary", !!safeUrl(r.previewUrl), safeUrl(r.previewUrl) ? "Open this change's preview site" : "No preview yet") +
            button(tag + "-publish", busy === tag + "-publish" ? "Opening…" : "Publish", "secondary", !!(r.readyToPublish && data.youCanPublish && can), r.readyToPublish ? "Review and publish only this change" : "Not ready to publish yet") +
            button(tag + "-discard", busy === tag + "-discard" ? "Opening…" : "Discard", "secondary", !!(data.youCanDiscard && can)) +
            button(tag + "-chat", safeUrl(r.conversationUrl) ? "Open conversation" : "Continue in chat", "secondary", true,
              safeUrl(r.conversationUrl) ? "Open the chat where this was asked" : "No link to the original chat was saved. This picks the change up here.") +
            '</div></li>';
        }) + '</ul></div>';
    }
    function bindPending(rows) {
      (Array.isArray(rows) ? rows : []).slice(0, MAX_ITEMS).forEach(function (r, i) {
        const tag = "p" + i;
        bind(tag + "-open", function () { refresh(r.changeId, tag + "-open"); });
        bind(tag + "-preview", function () { openLink(safeUrl(r.previewUrl)); });
        bind(tag + "-publish", function () { openAndConfirm(r.changeId, "publish", tag + "-publish"); });
        bind(tag + "-discard", function () { openAndConfirm(r.changeId, "discard", tag + "-discard"); });
        bind(tag + "-chat", function () {
          const link = safeUrl(r.conversationUrl);
          if (link) { openLink(link); return; }
          tell("Let's pick up the website change: " + r.title + " (change_id " + r.changeId + "). Show me where it stands.");
          note = { kind: "success", text: "Sent to the chat. The AI will pick this change up there." };
          render();
        });
      });
    }
    async function openAndConfirm(changeId, kind, tag) {
      await refresh(changeId, tag);
      if (!data || data.changeId !== changeId) return;
      const a = data.actions || {};
      if (kind === "publish" && !(a.publish && data.canPublish)) {
        note = { kind: "error", text: "This change can't be published yet. " + (data.nextStep || "") };
      } else if (kind === "discard" && !a.discard) {
        note = { kind: "error", text: "This change can't be discarded right now." };
      } else {
        confirming = kind;
      }
      render();
    }

    // ── Several waiting changes ─────────────────────────────────────────────
    function renderList() {
      const changes = data.changes || [];
      const older = data.olderChanges || [];
      const parts = [];
      if (data.error) parts.push('<div class="note error">' + esc(data.error) + '</div>');
      if (!changes.length && !older.length) {
        parts.push(statusBlock("published", "Nothing waiting", "Nothing is waiting to go live."));
      } else {
        parts.push('<h2>Website changes waiting (' + changes.length + ')</h2>');
        parts.push('<p class="muted">Each change is separate. Publishing one never takes another live.</p>');
        if (changes.length) parts.push(pendingSection(data.otherPending || [], "Waiting changes"));
        if (older.length) {
          parts.push('<p class="muted">' + older.length + ' older waiting change' + (older.length === 1 ? "" : "s") + ' from before the change tracking. They can be discarded, not published. Ask in the chat to discard them.</p>');
        }
      }
      parts.push(noteHtml());
      root.innerHTML = parts.join("");
      bindPending(data.otherPending);
    }

    // ── One change: status, actions, what goes live, checks ───────────────
    function renderDetail() {
      const d = data;
      const a = d.actions || {};
      const parts = [];
      parts.push('<h2>' + esc(d.title) + '</h2>');
      parts.push(statusBlock(d.state, d.stateLabel, d.nextStep));

      // Actions: always the same buttons in the same place.
      const preview = safeUrl(((d.previewLinks || [])[0] || {}).url) || safeUrl(d.previewUrl);
      if (confirming === "publish") {
        parts.push('<div class="confirm"><strong>You are about to publish "' + esc(d.title) + '" to the live spamtoast.com website.</strong> Only what is listed under "What will go live" goes out, nothing else. Are you sure?</div>');
        parts.push('<div class="actions">' + button("yes", busy ? "Publishing…" : "Yes, publish", "primary", !busy) + button("cancel", "Cancel", "secondary", !busy) + '</div>');
      } else if (confirming === "discard") {
        parts.push('<div class="confirm"><strong>Discard "' + esc(d.title) + '"?</strong> Everything in it is thrown away and nothing goes live. You can always ask for it again.</div>');
        parts.push('<div class="actions">' + button("yes", busy ? "Discarding…" : "Yes, discard", "secondary", !busy) + button("cancel", "Cancel", "secondary", !busy) + '</div>');
      } else {
        const can = !!rulesVersion && !busy;
        const bar = [];
        if (a.retry) bar.push(button("retry", busy === "retry" ? "Checking…" : "Retry", "secondary", !busy, "Check the status again"));
        bar.push(button("preview", "Preview", "secondary", !!(a.preview && preview), a.preview && preview ? "Open the preview site" : "No preview yet"));
        bar.push(button("discard", "Discard", "secondary", !!(a.discard && d.youCanDiscard && can)));
        bar.push(button("publish", "Publish", "primary", !!(a.publish && d.canPublish && d.youCanPublish && can),
          a.publish ? "" : "Publish unlocks when the status is Ready for review"));
        parts.push('<div class="actions">' + bar.join("") + '</div>');
        if (a.publish && !d.youCanPublish) parts.push('<p class="muted">Ready to publish. Ask a team member with publish access to approve it.</p>');
        else if ((a.publish || a.discard) && !rulesVersion) parts.push('<p class="muted">Ask in the chat to publish or discard this change.</p>');
      }
      parts.push(noteHtml());

      const live = d.goesLive || [];
      if (live.length) {
        parts.push('<div><h3>What will go live</h3><ul class="box" aria-label="What will go live">' + capped(live, function (t) { return '<li>' + esc(t) + '</li>'; }) + '</ul></div>');
      }
      if (d.understoodAs) {
        parts.push('<p class="muted">Asked by ' + esc(d.requestedBy) + ', ' + esc(when(d.createdAt)) + '. Understood as: ' + esc(d.understoodAs) + '</p>');
      } else {
        parts.push('<p class="muted">Asked by ' + esc(d.requestedBy) + ', ' + esc(when(d.createdAt)) + '.</p>');
      }

      const checks = d.checks || [];
      if (checks.length) {
        parts.push('<div><h3>Checks</h3><ul class="box checks" aria-label="Checks">' + checks.map(function (c) {
          return '<li><span class="dot ' + (CHECK_DOT[c.state] || "unknown") + '" aria-hidden="true"></span>' +
            '<span class="what">' + esc(c.label) + '</span>' +
            '<span><strong>' + esc(CHECK_WORD[c.state] || c.state) + '</strong>' + (c.required ? "" : ' <span class="muted">(optional)</span>') + '. <span class="muted">' + esc(c.detail) + '</span></span></li>';
        }).join("") + '</ul></div>');
      }

      const ba = d.beforeAfter || [];
      if (ba.length) {
        const shown = ba.slice(0, MAX_BEFORE_AFTER).map(function (b) {
          return '<li><div><strong>' + esc(b.label) + '</strong></div><div class="ba">' +
            '<span class="k">Before</span><span class="before">' + esc(b.before) + '</span>' +
            '<span class="k">After</span><span>' + esc(b.after) + '</span></div></li>';
        });
        if (ba.length > MAX_BEFORE_AFTER) shown.push('<li class="muted">+' + (ba.length - MAX_BEFORE_AFTER) + ' more changes, ask in the chat to see them all</li>');
        parts.push('<div><h3>Before and after</h3><ul class="box">' + shown.join("") + '</ul></div>');
      }

      const pages = (d.previewLinks || []).filter(function (l) { return safeUrl(l.url); });
      if (pages.length > 1) {
        parts.push('<p class="muted">Preview each page: ' + pages.slice(0, MAX_ITEMS).map(function (l) {
          return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>';
        }).join(", ") + '</p>');
      }

      if (!confirming) parts.push(pendingSection(d.otherPending, "Other pending changes"));

      root.innerHTML = parts.join("");
      bindPending(d.otherPending);
      bind("preview", function () { openLink(preview); });
      bind("publish", function () { confirming = "publish"; note = null; render(); });
      bind("discard", function () { confirming = "discard"; note = null; render(); });
      bind("cancel", function () { confirming = null; render(); });
      bind("yes", function () { act(confirming); });
      bind("retry", function () { refresh(d.changeId, "retry"); });
    }


    // ── History with Restore ────────────────────────────────────────────────
    function renderHistory() {
      const rows = data.history || [];
      const parts = ['<h2>Change history</h2>'];
      if (!rows.length) parts.push('<span class="muted">No changes yet.</span>');
      else {
        parts.push('<ul class="box hist" aria-label="Change history">' + capped(rows, function (h, i) {
          const restore = h.canUndo && data.youCanRestore && rulesVersion
            ? button("restore-" + i, busy === "restore-" + i ? "Preparing…" : "Restore previous", "secondary", !busy)
            : "";
          return '<li><span class="who">' + esc(day(h.publishedAt || h.createdAt)) + ' · ' + esc(h.requestedBy) + ' · ' + esc(h.title) +
            ' <span class="chip"><span class="dot ' + (STATUS_DOT[h.status] || "unknown") + '" aria-hidden="true"></span>' +
            esc(h.undoneBy ? "Restored" : h.statusLabel) + '</span></span>' + restore + '</li>';
        }) + '</ul>');
        parts.push('<p class="muted">Restore prepares a new change that puts the site back the way it was before. Nothing goes live until you review and publish it.</p>');
      }
      parts.push(noteHtml());
      root.innerHTML = parts.join("");
      rows.slice(0, MAX_ITEMS).forEach(function (h, i) {
        bind("restore-" + i, function () { restore(h.changeId, "restore-" + i); });
      });
    }

    async function restore(changeId, tag) {
      busy = tag; note = null; render();
      try {
        const result = await app.callServerTool({ name: "undo_change", arguments: { change_id: changeId, rules_version: rulesVersion } });
        const out = result.structuredContent || readText(result);
        if (result.isError || !out || out.ok === false) {
          busy = null;
          note = { kind: "error", text: (out && out.error) || "Restoring didn't work." };
          render();
          return;
        }
        busy = null;
        await refresh(out.changeId, tag);
      } catch (e) {
        busy = null;
        note = { kind: "error", text: "That didn't work: " + (e && e.message ? e.message : "unknown error") };
        render();
      }
    }

    // ── Shared actions ──────────────────────────────────────────────────────
    function render() {
      if (!data) return;
      if (data.view === "confirm") renderConfirm();
      else if (data.view === "detail") renderDetail();
      else if (data.view === "history") renderHistory();
      else renderList();
    }
    function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }
    function openLink(url) {
      if (!url) return;
      try { app.openLink({ url: url }).catch(function () { window.open(url, "_blank", "noopener"); }); }
      catch (e) { window.open(url, "_blank", "noopener"); }
    }

    function show(result) {
      data = result.structuredContent || readText(result);
      if (result._meta && result._meta.rulesVersion) rulesVersion = result._meta.rulesVersion;
      if (data && data.appliesTo) scope = data.appliesTo;
    }

    async function refresh(changeId, tag) {
      busy = tag; note = null; render();
      try {
        const result = await app.callServerTool({ name: "list_pending_changes", arguments: changeId ? { change_id: changeId } : {} });
        busy = null; confirming = null;
        if (result.isError) note = { kind: "error", text: "Couldn't load that change. Ask in the chat." };
        else show(result);
      } catch (e) {
        busy = null;
        note = { kind: "error", text: "That didn't work: " + (e && e.message ? e.message : "unknown error") };
      }
      render();
    }

    async function act(kind) {
      busy = kind; render();
      const args = { change_id: data.changeId, rules_version: rulesVersion };
      if (kind === "publish") args.review_token = data.reviewToken;
      try {
        const result = await app.callServerTool({ name: kind === "publish" ? "publish_changes" : "discard_change", arguments: args });
        const out = result.structuredContent || readText(result);
        busy = null;
        confirming = null;
        if (result.isError || !out || out.ok === false || out.error) {
          note = { kind: "error", text: (out && out.error) || (kind === "publish" ? "Publishing didn't work." : "Discarding didn't work.") };
        } else {
          const published = kind === "publish";
          data = Object.assign({}, data, {
            view: "detail",
            status: published ? "published" : "discarded",
            statusLabel: published ? "Published" : "Discarded",
            state: published ? "published" : "discarded",
            stateLabel: published ? "Published" : "Discarded",
            nextStep: published
              ? "Nothing to do. The live site updates in a few minutes. It's in the change history and can be restored."
              : "Nothing to do. Nothing from this change will go live.",
            actions: { preview: false, discard: false, publish: false, retry: false },
          });
          note = null;
        }
      } catch (e) {
        busy = null;
        confirming = null;
        note = { kind: "error", text: "That didn't work: " + (e && e.message ? e.message : "unknown error") };
      }
      render();
    }

    function readText(result) {
      try {
        const block = result && result.content && result.content[0];
        return block && block.text ? JSON.parse(block.text) : null;
      } catch (e) {
        return null;
      }
    }

    function applyHost(ctx) {
      if (!ctx) return;
      if (ctx.theme) applyDocumentTheme(ctx.theme);
      if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
      if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
    }

    const app = new App({ name: "spamtoast-admin-ui", version: "1.0.0" }, {}, { autoResize: true });
    app.ontoolresult = function (params) {
      rulesVersion = null;
      confirming = null; busy = null; note = null;
      show(params);
      if (!data) {
        root.innerHTML = '<span class="muted">Couldn\\'t read this result. Ask again in the chat.</span>';
        return;
      }
      render();
    };
    app.onhostcontextchanged = function (ctx) { applyHost(ctx); };
    await app.connect();
    applyHost(app.getHostContext());
  </script>
</body>
</html>
`;
