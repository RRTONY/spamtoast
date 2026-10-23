import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ADMIN_TOOLS,
  normalizeRepoPath,
  runAdminTool,
} from "@/lib/admin/tools";
import { isPathDenied } from "@/lib/admin/guardrails";
import {
  checkFileMatchesPath,
  MAX_UPLOAD_PAGE_BYTES,
  resolveBinaryInput,
  signUploadGrant,
} from "@/lib/admin/binary-upload";
import {
  buildReview,
  changeHistory,
  confirmChange,
  createChangeSet,
  discardChange,
  getChangeSet,
  isOpen,
  listOpenChangeSets,
  markEdited,
  otherPendingText,
  pendingRows,
  pendingOverview,
  publishChange,
  reconcileWithGitHub,
  submitForReview,
  undoChange,
  type ChangeSet,
} from "@/lib/admin/change-sets";
import {
  APPLIES_TO_LABELS,
  normalizeAppliesTo,
  normalizeChangeKey,
  normalizeConversationUrl,
} from "@/lib/admin/change-describe";
import { isNetlifyConfigured, listDeploys } from "@/lib/admin/netlify-client";
import { DEFAULT_SITE_ORIGIN } from "@/lib/admin/site-config";
import { buildMcpToolContext } from "@/lib/admin/mcp-tool-context";
import {
  READ_ONLY_TOOLS,
  canUseTool,
  type McpUser,
} from "@/lib/admin/mcp-auth";
import {
  RULES_GATED_TOOLS,
  RULES_PATH,
  RULES_VERSION_PARAM,
  getProjectGuides,
  getProjectRules,
  listKnowledgeBase,
  rulesVersionError,
  withRulesVersionParam,
} from "@/lib/admin/project-rules";
import {
  PENDING_CHANGES_HTML,
  PENDING_CHANGES_UI_URI,
} from "@/lib/admin/mcp-ui-widgets";

// MIME type the MCP Apps extension (https://mcpui.dev) expects for an
// interactive UI resource. Hosts that don't support MCP Apps simply never
// request this resource and show the tool's plain-text result instead.
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

// The SpamToast MCP server: the same change flow as the tonygreenberg.com
// server (one request = one change = one branch and pull request, a review
// card, publish only with a review token), for spamtoast.com only. The
// GitHub repo and Netlify site come from the server's env (GITHUB_REPO,
// NETLIFY_SITE_NAME), never from a tool call. The site has no CMS or
// database: change records live on a GitHub branch (change-store.ts), and
// the spam tools (confrontation links, Wall of Shame) live in tools.ts.
const CHAT_TOOLS = ADMIN_TOOLS;

const CHANGE_ID_PARAM = "change_id";

const changeIdSchema = (description: string) => ({
  type: "string",
  description,
});

const SESSION_TOOLS = [
  {
    name: "get_project_rules",
    description:
      "CALL THIS FIRST, before anything else in a conversation. Returns spamtoast.com's project rules: AGENTS.md first (the must-follow summary every AI tool reads), then CONTRIBUTING.md (the full rules: Next.js / Tailwind / shadcn house rules, what's banned, honesty rules for spam pages, review checklist, testing, Status Report), a task guide and project structure map when they exist, the status block of the main project file, the list of background notes in docs/ai/, and a rulesVersion. Every tool that changes the site requires that rulesVersion as its rules_version argument and refuses to run without it. Read the rules fully and follow them for the rest of the conversation.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "start_change",
    description:
      "Start a new, separate change for ONE request from the person (e.g. 'change the homepage headline'). Returns a change_id. Every edit for this request (github_edit_file, github_write_file, github_write_binary_file, github_delete_file, add_to_wall_of_shame) must pass this change_id, so each request is kept apart and publishing it never takes any other request live. Start a new change for each new request; keep using the same change_id for follow-up tweaks to the same request. Before calling, look at the site to work out what the person really means. If the request is at all unclear, set needs_confirmation: the card then shows the person 'I understand your request as: ...' with Desktop/Mobile/Both, and every edit is refused until they say yes (confirm_change). Non-technical people often use words like tabs, table, buttons, menu, header, box or section loosely, so treat those as unclear unless the page has exactly one thing they could mean.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description:
            "Short plain-English name, e.g. 'New homepage headline'.",
        },
        request: {
          type: "string",
          description: "What the person asked for, in their words.",
        },
        understood_as: {
          type: "string",
          description:
            "One or two plain sentences saying exactly what you will change and where, in the site's real terms, e.g. 'Move the desktop navigation menu from the top of every page to a vertical menu on the right side.'",
        },
        applies_to: {
          type: "string",
          enum: ["both", "desktop", "mobile"],
          description:
            "Where the change should show. Default 'both'. Use 'desktop' or 'mobile' only when the person said so (e.g. 'on mobile', 'on my phone').",
        },
        conversation_url: {
          type: "string",
          description:
            "Optional: a link to this chat (a chatgpt.com or claude.ai share link) if the person gave you one. Shown as 'Open conversation' next to the change. You can't find this yourself; never make one up.",
        },
        needs_confirmation: {
          type: "boolean",
          description:
            "true when the request could mean more than one thing, uses loose words (tabs, table, buttons, menu, header, box, section...), or you had to guess. false only when it names exactly what to change, e.g. a precise wording edit.",
        },
      },
      required: ["title", "request", "understood_as", "needs_confirmation"],
    },
    _meta: { ui: { resourceUri: PENDING_CHANGES_UI_URI } },
  },
  {
    name: "confirm_change",
    description:
      "Record the person's YES to what you understood for a change that is 'Waiting for your OK' (start_change with needs_confirmation). Only call it after the person clearly agreed in the chat (the card's Yes button calls it too). Pass applies_to if they picked desktop or mobile only. Edits for the change are refused until this is done. If they said you got it wrong, don't call this: discard_change and start_change again with the corrected understanding.",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("The change to confirm."),
        applies_to: {
          type: "string",
          enum: ["both", "desktop", "mobile"],
          description:
            "Optional: the person's choice. Default keeps the current one.",
        },
      },
      required: [CHANGE_ID_PARAM],
    },
  },
  {
    name: "request_upload_link",
    description:
      "Get a private link where the person can upload an image or PDF straight into this change, for when they attached a file in the chat but you can't pass it to github_write_binary_file (you only see the picture, never its bytes; Claude never passes attached files to this server). Give them the link in plain words, e.g. 'Open this link and drop the picture there, then tell me when it's done.' It works for 30 minutes, for this one file, and saves it to the path you choose. After they say it's done, carry on with the code change and submit_for_review.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "Where to save it in the repo, e.g. public/images/tsi-hero.png. The upload must be the same kind of file as the ending.",
        },
      },
      // change_id is added by withChangeIdParam (CHANGE_REQUIRED_TOOLS).
      required: ["path"],
    },
  },
  {
    name: "submit_for_review",
    description:
      "Call when the edits for a change are finished and checked. Saves a plain-English summary and marks the change 'Ready for review'; only then can it be published. Any later edit to the change sends it back to Draft, so submit again after more edits. Then call list_pending_changes with the same change_id to show the person the review card.",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("The change_id from start_change."),
        summary: {
          type: "string",
          description:
            "1 to 3 plain sentences for a non-technical owner: what changed and where, e.g. 'Changed the homepage headline. No other pages were touched.' No jargon, no em dashes.",
        },
        before_after: {
          type: "array",
          description:
            "For visible wording or image changes made in code: what the visitor saw before and will see after. For a Wall of Shame addition, the company and note.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "e.g. 'Homepage headline'",
              },
              before: { type: "string" },
              after: { type: "string" },
            },
            required: ["label", "before", "after"],
          },
        },
      },
      required: [CHANGE_ID_PARAM, "summary"],
    },
  },
  {
    name: "list_pending_changes",
    description:
      'Show waiting changes. With a change_id: the full review for that one change: ONE status (state: working, checking, ready, failed, stuck, awaiting_ok, published, discarded) with nextStep telling the person what to do, the checks (Build, Type check, Lint, GitHub checks), what will go live, before and after, preview links, and its review_token. The card shows Preview, Discard and Publish together (greyed out when not allowed) plus Retry when something failed. Without a change_id (only when the person asks what\'s waiting; while working on a task always pass that task\'s change_id): every waiting change, each reviewable on its own, plus older waiting work that will NOT be published. Always show the person this review before publishing. In your reply, lead with the state and nextStep in one line and don\'t repeat the card. If state is "checking", call it again in a bit (you have no timer to wait with).',
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("Optional: the change to review."),
      },
      required: [],
    },
    // Hosts that support MCP Apps render this as a review card with
    // Publish and Discard buttons (see mcp-ui-widgets.ts). Others just see
    // the plain-text result.
    _meta: { ui: { resourceUri: PENDING_CHANGES_UI_URI } },
  },
  {
    name: "publish_changes",
    description:
      "Go live with ONE reviewed change: publishes only that change's edits, nothing else. Needs the change_id and the review_token from list_pending_changes for that change; refuses if anything changed since that review, if the site check isn't passing, or if the change isn't 'Ready for review'. Before calling, show the person exactly what will go live and get a clear yes: 'You are about to publish these changes to the live spamtoast.com website. Are you sure you want to continue?'",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("The change to publish."),
        review_token: {
          type: "string",
          description:
            "The reviewToken from list_pending_changes for this change.",
        },
      },
      required: [CHANGE_ID_PARAM, "review_token"],
    },
  },
  {
    name: "discard_change",
    description:
      "Reject a waiting change completely: its edits are thrown away and nothing goes live. Use when the person doesn't want it. It stays in the change history as Discarded. Also works for older waiting changes listed under olderChanges. Confirm with the person first.",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("The change to discard."),
      },
      required: [CHANGE_ID_PARAM],
    },
  },
  {
    name: "list_change_history",
    description:
      "History of website changes made through this server, newest first: when, who asked, what was changed, a summary, and whether it was published, discarded, or undone. Shown as a card where each published change has a Restore button (it calls undo_change, which prepares an 'Undo' change for review; nothing goes live until that is published). Use canUndo and undo_change to restore the previous version of a published change.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "How many (default 20, max 100).",
        },
      },
      required: [],
    },
    _meta: { ui: { resourceUri: PENDING_CHANGES_UI_URI } },
  },
  {
    name: "check_deploy",
    description:
      "Netlify build status, in plain words. With a change_id: that change's preview builds (is the preview ready, still building, or did the build fail and why). Without: the live site's latest builds, e.g. to confirm a publish actually went live or to explain a failed build. Read-only. If a build failed, use the error text to fix the cause in the same change.",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema(
          "Optional: show this change's preview builds instead of the live site.",
        ),
      },
      required: [],
    },
  },
  {
    name: "undo_change",
    description:
      "Restore what the site looked like before a PUBLISHED change (from list_change_history). Creates a new waiting change called 'Undo: ...' that puts the old files back; it goes live only after the person reviews and publishes it like any other change. Refuses if the same files were changed again afterwards, so later work isn't wiped out.",
    input_schema: {
      type: "object" as const,
      properties: {
        [CHANGE_ID_PARAM]: changeIdSchema("The published change to undo."),
      },
      required: [CHANGE_ID_PARAM],
    },
  },
];

// Edits must name their change (see start_change); reads may, to see that
// change's version of a file instead of the live one.
const CHANGE_REQUIRED_TOOLS = new Set([
  "request_upload_link",
  "github_write_file",
  "github_edit_file",
  "github_write_binary_file",
  "github_delete_file",
  "add_to_wall_of_shame",
]);
const CHANGE_ACTION_TOOLS = new Set([
  "confirm_change",
  "submit_for_review",
  "publish_changes",
  "discard_change",
  "undo_change",
]);
const CHANGE_OPTIONAL_TOOLS = new Set([
  "github_read_file",
  "github_list_dir",
  "github_search_code",
  "check_pr_status",
  "get_check_log_excerpt",
]);

function withChangeIdParam(name: string, schema: ToolSchema): ToolSchema {
  if (CHANGE_REQUIRED_TOOLS.has(name)) {
    return {
      ...schema,
      properties: {
        ...schema.properties,
        [CHANGE_ID_PARAM]: changeIdSchema(
          "The change_id from start_change for the request this edit belongs to.",
        ),
      },
      // A duplicate in "required" is invalid JSON Schema: Claude tolerates it,
      // but ChatGPT then drops every tool on the server ("editing tools
      // aren't available", seen on the tonygreenberg.com server 2026-10-17).
      required: [
        ...(schema.required ?? []).filter((k) => k !== CHANGE_ID_PARAM),
        CHANGE_ID_PARAM,
      ],
    };
  }
  if (CHANGE_OPTIONAL_TOOLS.has(name)) {
    return {
      ...schema,
      properties: {
        ...schema.properties,
        [CHANGE_ID_PARAM]: changeIdSchema(
          "Optional: read/check this change's version instead of the live site.",
        ),
      },
    };
  }
  return schema;
}

interface ToolSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

const MCP_TOOLS = [...CHAT_TOOLS, ...SESSION_TOOLS];

// structuredContent is what MCP Apps hosts (ChatGPT, Claude) hand to a UI
// card; the text block stays for hosts and models that only read text.
function toResult(output: unknown, isError = false) {
  const isObject =
    !!output && typeof output === "object" && !Array.isArray(output);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    ...(isObject && !isError
      ? { structuredContent: output as Record<string, unknown> }
      : {}),
    isError,
  };
}

function fromChangeResult<T extends { ok: boolean }>(result: T) {
  return toResult(result, !result.ok);
}

// Tool hints ChatGPT and Claude use to decide when to ask the person to
// confirm before running a tool (read-only tools run straight away; tools
// that change things, delete, or go live get a prompt).
const DESTRUCTIVE_TOOLS = new Set([
  "github_delete_file",
  "publish_changes",
  "discard_change",
]);
const OPEN_WORLD_TOOLS = new Set(["publish_changes"]);

function toolAnnotations(name: string) {
  const readOnly = READ_ONLY_TOOLS.has(name);
  return {
    title: name
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    readOnlyHint: readOnly,
    destructiveHint: !readOnly && DESTRUCTIVE_TOOLS.has(name),
    openWorldHint: OPEN_WORLD_TOOLS.has(name),
  };
}

// ChatGPT-specific extras on top of the MCP Apps standard keys: the legacy
// outputTemplate alias, the short "working / done" status lines shown while
// a tool runs, and widgetAccessible so the card's buttons may call
// list_pending_changes / publish_changes / discard_change.
const CHATGPT_TOOL_META: Record<string, Record<string, unknown>> = {
  start_change: {
    "openai/outputTemplate": PENDING_CHANGES_UI_URI,
    "openai/toolInvocation/invoking": "Starting the change…",
    "openai/toolInvocation/invoked": "Change started",
    "openai/widgetAccessible": true,
  },
  confirm_change: {
    "openai/toolInvocation/invoking": "Saving your OK…",
    "openai/toolInvocation/invoked": "Confirmed",
    "openai/widgetAccessible": true,
  },
  list_change_history: {
    "openai/outputTemplate": PENDING_CHANGES_UI_URI,
    "openai/toolInvocation/invoking": "Loading the change history…",
    "openai/toolInvocation/invoked": "Change history",
    "openai/widgetAccessible": true,
  },
  undo_change: {
    "openai/toolInvocation/invoking": "Preparing the restore…",
    "openai/toolInvocation/invoked": "Restore ready to review",
    "openai/widgetAccessible": true,
  },
  list_pending_changes: {
    "openai/outputTemplate": PENDING_CHANGES_UI_URI,
    "openai/toolInvocation/invoking": "Checking waiting website changes…",
    "openai/toolInvocation/invoked": "Changes ready to review",
    "openai/widgetAccessible": true,
  },
  publish_changes: {
    "openai/toolInvocation/invoking": "Publishing to the live site…",
    "openai/toolInvocation/invoked": "Publish finished",
    "openai/widgetAccessible": true,
  },
  discard_change: {
    "openai/toolInvocation/invoking": "Discarding the change…",
    "openai/toolInvocation/invoked": "Change discarded",
    "openai/widgetAccessible": true,
  },
  github_write_binary_file: {
    "openai/fileParams": ["file"],
    "openai/toolInvocation/invoking": "Saving the file…",
    "openai/toolInvocation/invoked": "File saved",
  },
  get_project_rules: {
    "openai/toolInvocation/invoking": "Loading the site's rules…",
    "openai/toolInvocation/invoked": "Rules loaded",
  },
};

async function listPendingChanges(changeKey: string | null) {
  const open = await reconcileWithGitHub(await listOpenChangeSets());
  const overview = await pendingOverview(open);
  const target = changeKey
    ? await getChangeSet(changeKey)
    : open.length === 1 && overview.olderChanges.length === 0
      ? open[0]
      : null;

  if (changeKey && !target) {
    return {
      view: "list" as const,
      error: `No change found with id ${changeKey}.`,
      ...overview,
    };
  }
  if (!target) return { view: "list" as const, ...overview };

  const others =
    open.filter((c) => c.key !== target.key).length +
    overview.olderChanges.length;
  const review = await buildReview(target, others);
  // Asked about one change: answer about that change only (owner,
  // 2026-10-17). The rest is listed only when asked for without a change_id.
  if (changeKey) return { view: "detail" as const, ...review };
  return {
    view: "detail" as const,
    ...review,
    otherWaiting: overview.changes.filter((c) => c.changeId !== target.key),
    olderChanges: overview.olderChanges,
  };
}

async function rulesVersionOrNull(): Promise<string | null> {
  return getProjectRules()
    .then((r) => r.version)
    .catch(() => null);
}

// Sent to every connecting client during the MCP handshake and meant to act
// like a system-prompt hint (per the MCP spec). The real rules live in one
// place, AGENTS.md on the default branch, served by get_project_rules - not
// duplicated here, so they can't drift. Some clients ignore these
// instructions, which is why the write tools are also hard-gated on
// rules_version (see project-rules.ts).
const ADMIN_SERVER_INSTRUCTIONS = `This server lets you edit the spamtoast.com Next.js site (Tony Greenberg's anti-spam site) and run its spam tools.

STEP 1, EVERY CONVERSATION: call get_project_rules before anything else, read the rules it
returns in full (AGENTS.md first, then CONTRIBUTING.md), and follow them for the rest of the
conversation. They override your defaults. Every tool that changes the site or its content
requires the rulesVersion it returns as the rules_version argument, and refuses to run without it.

STEP 2, EVERY REQUEST: one request = one change. Call start_change, pass its change_id on
every edit, then submit_for_review with a plain summary, then list_pending_changes with that
change_id to show the review card. The person then publishes or discards THAT change only,
after you show what goes live and they confirm. list_change_history and undo_change restore
an earlier version.

EDITING CODE, THE EASY WAY: github_search_code to find the file (search for the words the person
sees on the page, or a component/page name), github_read_file to see it, then github_edit_file
with exact old_text/new_text pairs. Only use github_write_file for a brand-new file.

SPAM TOOLS: create_confrontation_link makes a signed "You've been reported" link to send to a
spammer (changes nothing; Tony is emailed when it's opened). list_wall_of_shame shows the public
list. add_to_wall_of_shame is an edit inside a change: it goes public only after review and
publish. Only name senders Tony confirmed, and never claim the site files reports with agencies.

The rules cover, among other things:
- Plain, short, jargon-free replies for a non-technical team, no em dashes.
- Next.js 16 (params are Promises, proxy.ts not middleware.ts), Server Components by default.
- Tailwind v4 + shadcn/ui only: no inline style={{}}, no framer-motion, next/image only.
- Checks before calling anything done (check_code_quality on changed files, then
  check_pr_status and the Netlify preview link), and confirming with the person before
  publish_changes.
- Ending every reply that did work with the Status Report.

Background notes are in docs/ai/ (listed by get_project_rules). Read the relevant one with
github_read_file before changing that feature.`;

// One fresh Server per request (see api/mcp/route.ts) — cheap to construct,
// and keeps this stateless like everything else the admin tools touch.
// Commit messages on the admin branch carry who asked for the change, so
// git history shows which team member did what (every commit is otherwise
// authored by the one GitHub token).
const ATTRIBUTED_MESSAGE_TOOLS = new Set([
  "github_write_file",
  "github_edit_file",
  "github_write_binary_file",
  "github_delete_file",
  "add_to_wall_of_shame",
]);

export function createAdminMcpServer(
  user: McpUser,
  origin = DEFAULT_SITE_ORIGIN,
): Server {
  const server = new Server(
    { name: "spamtoast-admin", version: "1.0.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: ADMIN_SERVER_INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS.filter((t) => canUseTool(user.role, t.name)).map((t) => ({
      name: t.name,
      description: RULES_GATED_TOOLS.has(t.name)
        ? `${t.description} Requires ${RULES_VERSION_PARAM} from get_project_rules.`
        : t.description,
      inputSchema: (() => {
        const schema = withChangeIdParam(t.name, t.input_schema as ToolSchema);
        return RULES_GATED_TOOLS.has(t.name)
          ? withRulesVersionParam(schema)
          : schema;
      })(),
      annotations: toolAnnotations(t.name),
      ...("_meta" in t || CHATGPT_TOOL_META[t.name]
        ? {
            _meta: {
              ...("_meta" in t ? t._meta : {}),
              ...CHATGPT_TOOL_META[t.name],
            },
          }
        : {}),
    })),
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: PENDING_CHANGES_UI_URI,
        name: "Pending changes",
        mimeType: MCP_APP_MIME_TYPE,
      },
    ],
  }));

  // Declaring the resources capability means clients may also ask for
  // templates; answering "method not found" there made some clients abort
  // setup. There are none, so say so.
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== PENDING_CHANGES_UI_URI) {
      throw new Error(`Unknown resource "${request.params.uri}"`);
    }
    return {
      contents: [
        {
          uri: PENDING_CHANGES_UI_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: PENDING_CHANGES_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { resourceDomains: ["https://esm.sh"] },
            },
            "openai/widgetDescription":
              "Review card for one website change: what will go live, before and after wording, the site checks, preview links, and Publish or Discard buttons with a confirm step.",
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    };
  });

  const handleCall = async (request: CallToolRequest) => {
    const { name, arguments: rawArgs } = request.params;
    const { [RULES_VERSION_PARAM]: rulesVersion, ...input } = (rawArgs ??
      {}) as Record<string, unknown>;

    console.log(
      `[mcp] ${user.name}${user.email ? ` <${user.email}>` : ""} (${user.role}) called ${name}`,
    );
    if (!canUseTool(user.role, name)) {
      return toResult(
        {
          error: `${user.name}'s access level (${user.role}) doesn't allow ${name}. Ask the webmaster if you need it.`,
        },
        true,
      );
    }
    if (
      ATTRIBUTED_MESSAGE_TOOLS.has(name) &&
      typeof input.message === "string" &&
      user.name
    ) {
      input.message = `${input.message} [by ${user.name}]`;
    }

    if (name === "get_project_rules") {
      const [rules, guides, knowledgeBase] = await Promise.all([
        getProjectRules(),
        getProjectGuides(),
        listKnowledgeBase().catch(() => []),
      ]);
      return toResult({
        rulesVersion: rules.version,
        you: {
          name: user.name,
          role: user.role,
          note:
            user.role === "read"
              ? "Look-only access: you can read, check and report, not change anything."
              : user.role === "edit"
                ? "You can prepare changes (they wait as pending) and discard them, but a team member with write access must publish them."
                : "Full access, including publishing.",
        },
        howToUse: `Follow every rule below for the rest of this conversation. One request = one change: start_change, pass its change_id on every edit, submit_for_review with a plain summary, then list_pending_changes with that change_id so the person sees exactly what will go live and can Publish or Discard it (publish needs their clear yes). Read projectStatus (the status block of SPAMTOAST-TODO.md, the main project file) to see what's done, open and waiting on a decision. For each request, first use taskGuide to decide what kind of task it is, where it lives and whether it needs a yes, and projectStructure to find the files. Pass "${rules.version}" as ${RULES_VERSION_PARAM} on every tool that changes something. End every reply that did work with the Status Report. Before touching a feature, read its note from knowledgeBase with github_read_file.`,
        rules: rules.content,
        fullRules: rules.fullRules,
        taskGuide: guides.taskGuide,
        projectStructure: guides.projectStructure,
        projectStatus: guides.projectStatus,
        knowledgeBase,
      });
    }

    if (RULES_GATED_TOOLS.has(name)) {
      let current: string;
      try {
        current = (await getProjectRules()).version;
      } catch (err) {
        return toResult(
          {
            error: `Could not load ${RULES_PATH} to check the rules version, so this change was not made: ${String(err)}`,
          },
          true,
        );
      }
      const blocked = rulesVersionError(rulesVersion, current);
      if (blocked) return toResult({ error: blocked }, true);
    }

    const rawChangeId = input[CHANGE_ID_PARAM];
    delete input[CHANGE_ID_PARAM];
    const changeKey =
      rawChangeId === undefined || rawChangeId === ""
        ? null
        : normalizeChangeKey(rawChangeId);
    if (rawChangeId !== undefined && rawChangeId !== "" && !changeKey) {
      return toResult(
        {
          error: `"${String(rawChangeId)}" isn't a valid change_id. Use the one start_change returned.`,
        },
        true,
      );
    }

    if (name === "start_change") {
      const title = String(input.title ?? "").trim();
      const request = String(input.request ?? "").trim();
      const understoodAs = String(input.understood_as ?? "").trim();
      if (!title || !request || !understoodAs) {
        return toResult(
          {
            error:
              "A title, the person's request, and understood_as (what you will change, in plain words) are all required.",
          },
          true,
        );
      }
      const appliesTo = normalizeAppliesTo(input.applies_to);
      const needsConfirmation = input.needs_confirmation === true;
      const change = await createChangeSet({
        title,
        request,
        user,
        understoodAs,
        appliesTo,
        needsConfirmation,
        conversationUrl: normalizeConversationUrl(input.conversation_url),
      });
      return {
        ...toResult({
          view: "confirm",
          change_id: change.key,
          changeId: change.key,
          title: change.title,
          request: change.request,
          understoodAs,
          appliesTo,
          appliesToLabel: APPLIES_TO_LABELS[appliesTo],
          needsConfirmation,
          state: needsConfirmation ? "awaiting_ok" : "working",
          stateLabel: needsConfirmation ? "Waiting for your OK" : "Working",
          nextStep: needsConfirmation
            ? "Check what the AI understood. Say yes to let it start, or tell it what you meant."
            : "The AI is making this change. Nothing to do yet.",
          next: needsConfirmation
            ? `STOP: show the person exactly this and wait for their answer: "I understand your request as: ${understoodAs} (Applies to: ${APPLIES_TO_LABELS[appliesTo]}). Is that right?" Edits are refused until they say yes and you call confirm_change (or they press Yes in the card). If they meant something else, discard_change and start_change again.`
            : `Pass change_id "${change.key}" on every edit for this request. When done, call submit_for_review, then list_pending_changes with this change_id.`,
          youCanDiscard: canUseTool(user.role, "discard_change"),
          youCanPublish: canUseTool(user.role, "publish_changes"),
        }),
        _meta: { rulesVersion: await rulesVersionOrNull() },
      };
    }

    if (name === "list_change_history") {
      const limit = Number(input.limit ?? 20);
      return {
        ...toResult({
          view: "history",
          history: await changeHistory(Number.isFinite(limit) ? limit : 20),
          youCanRestore: canUseTool(user.role, "undo_change"),
        }),
        _meta: { rulesVersion: await rulesVersionOrNull() },
      };
    }

    if (name === "list_pending_changes") {
      const pending = await listPendingChanges(changeKey);
      // rulesVersion goes in the result's _meta, which hosts pass to the UI
      // card but not to the model - so the model still has to call
      // get_project_rules itself before it can publish or discard.
      const rulesVersion = await rulesVersionOrNull();
      return {
        ...toResult({
          ...pending,
          youCanPublish: canUseTool(user.role, "publish_changes"),
          youCanDiscard: canUseTool(user.role, "discard_change"),
          you: { name: user.name, role: user.role },
        }),
        _meta: { rulesVersion },
      };
    }

    if (
      (CHANGE_REQUIRED_TOOLS.has(name) || CHANGE_ACTION_TOOLS.has(name)) &&
      !changeKey
    ) {
      return toResult(
        {
          error:
            name === "publish_changes" ||
            name === "discard_change" ||
            name === "undo_change"
              ? "Say which change: pass its change_id (see list_pending_changes or list_change_history)."
              : "Every edit must belong to a change. Call start_change for this request first and pass its change_id.",
        },
        true,
      );
    }

    if (name === "confirm_change") {
      const result = await confirmChange(changeKey!, input.applies_to);
      return fromChangeResult(
        result.ok
          ? {
              ...result,
              appliesToLabel: APPLIES_TO_LABELS[result.appliesTo],
              next: `Confirmed. Now make the change, passing change_id "${result.changeId}" on every edit, then submit_for_review.`,
            }
          : result,
      );
    }
    if (name === "publish_changes") {
      return fromChangeResult(
        await publishChange(changeKey!, String(input.review_token ?? ""), user),
      );
    }
    if (name === "discard_change") {
      return fromChangeResult(await discardChange(changeKey!, user));
    }
    if (name === "check_deploy") {
      if (!isNetlifyConfigured()) {
        return toResult(
          {
            error:
              "Netlify access isn't set up on the server (NETLIFY_AUTH_TOKEN). Ask the webmaster.",
          },
          true,
        );
      }
      let branch: string | undefined;
      if (changeKey) {
        const target = await getChangeSet(changeKey);
        branch = target?.branch ?? undefined;
        if (!branch) {
          return toResult({
            deploys: [],
            note: target
              ? "This change has no edits yet, so there is no preview build."
              : `No change found with id ${changeKey}.`,
          });
        }
      }
      try {
        const deploys = await listDeploys(
          branch ? { branch, limit: 3 } : { production: true, limit: 3 },
        );
        return toResult({
          site: branch ? `Preview of change ${changeKey}` : "Live site",
          deploys,
        });
      } catch (err) {
        return toResult(
          { error: err instanceof Error ? err.message : "Netlify check failed" },
          true,
        );
      }
    }

    if (name === "undo_change") {
      const result = await undoChange(changeKey!, user);
      return fromChangeResult(
        result.ok
          ? {
              ...result,
              next: `Created "${result.title}". Show it with list_pending_changes and change_id "${result.changeId}"; it goes live only if the person publishes it.`,
            }
          : result,
      );
    }

    let change: ChangeSet | null = null;
    if (changeKey) {
      change = await getChangeSet(changeKey);
      if (!change) {
        return toResult(
          {
            error: `No change found with id ${changeKey}. Call start_change for a new request.`,
          },
          true,
        );
      }
    }

    if (name === "request_upload_link") {
      const path = normalizeRepoPath(input.path);
      if (!path || isPathDenied(path)) {
        return toResult(
          {
            error: path
              ? `${path} can't be changed from here.`
              : "Say where to save the file (path).",
          },
          true,
        );
      }
      if (change!.status === "awaiting_confirmation" || !isOpen(change!)) {
        return toResult(
          {
            error:
              change!.status === "awaiting_confirmation"
                ? "The person hasn't confirmed this change yet. Get their yes (confirm_change) first."
                : `Change ${change!.key} is already ${change!.status.replace(/_/g, " ")}. Call start_change for a new request.`,
          },
          true,
        );
      }
      const { token, expiresAt } = signUploadGrant(change!.key, path, user);
      return toResult({
        ok: true,
        uploadUrl: `${origin}/api/mcp/upload?t=${encodeURIComponent(token)}`,
        path,
        expiresAt,
        maxSizeMb: MAX_UPLOAD_PAGE_BYTES / 1024 / 1024,
        next: "Give the person this link in plain words and ask them to tell you when the upload is done. Then check it with github_list_dir (with this change_id) and carry on.",
      });
    }

    if (name === "submit_for_review") {
      const summary = String(input.summary ?? "").trim();
      if (!summary) {
        return toResult(
          { error: "A plain-English summary is required." },
          true,
        );
      }
      const beforeAfter = Array.isArray(input.before_after)
        ? (input.before_after as Array<Record<string, unknown>>)
            .filter((b) => b && typeof b === "object")
            .map((b) => ({
              label: String(b.label ?? ""),
              before: String(b.before ?? ""),
              after: String(b.after ?? ""),
            }))
        : [];
      const result = await submitForReview(change!, summary, beforeAfter);
      return fromChangeResult(
        result.ok
          ? {
              ...result,
              next: `Now call list_pending_changes with change_id "${change!.key}" to show the person the review.`,
            }
          : result,
      );
    }

    if (!CHAT_TOOLS.some((t) => t.name === name)) {
      return toResult({ error: `Unknown tool "${name}"` }, true);
    }

    if (CHANGE_REQUIRED_TOOLS.has(name)) {
      if (change!.status === "awaiting_confirmation") {
        return toResult(
          {
            error: `The person hasn't confirmed what you understood yet ("${change!.understoodAs ?? change!.title}"). Ask them, wait for a clear yes, then call confirm_change. If they meant something else, discard_change and start_change again.`,
          },
          true,
        );
      }
      if (!isOpen(change!)) {
        return toResult(
          {
            error: `Change ${change!.key} is already ${change!.status.replace(/_/g, " ")}. Call start_change for a new request.`,
          },
          true,
        );
      }
      if (name === "github_write_binary_file") {
        // Check (and download) the file before touching the change, so a
        // bad file never creates a branch or marks the change edited.
        const file = await resolveBinaryInput(input);
        const path = normalizeRepoPath(input.path);
        const problem = file.ok
          ? path && checkFileMatchesPath(path, file.bytes)
          : file.error;
        if (!file.ok || problem) return toResult({ error: problem }, true);
        delete input.file;
        delete input.source_url;
        input.base64Content = file.bytes.toString("base64");
      }
      await markEdited(change!);
    }

    const { ctx, auditLog, finalize } = await buildMcpToolContext(change);
    const result = await runAdminTool(name, input, ctx);
    const session = await finalize();

    // Only append session/audit info when THIS call actually did something
    // (ensureWriteBranch/log calls push into auditLog) — not just because a
    // branch happens to already be open from an earlier call, which is true
    // for most calls once any change is pending. Also: never name this field
    // "log" — get_check_log_excerpt's own output already has a `log` string,
    // and spreading a same-named field after it silently clobbers it (this
    // is exactly the bug that shipped: get_check_log_excerpt started
    // returning `log: []` instead of the real log text, on any call made
    // while a PR was open).
    const isPlainObject =
      result.output &&
      typeof result.output === "object" &&
      !Array.isArray(result.output);
    const output =
      isPlainObject && auditLog.length > 0
        ? { ...(result.output as object), ...session, mcpAuditLog: auditLog }
        : result.output;

    return toResult(output, result.isError);
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleCall(request);
    if (!OTHER_PENDING_TOOLS.has(request.params.name)) return result;
    // While someone works on a task, only that task (owner, 2026-10-17):
    // the full list of waiting changes only comes with list_pending_changes
    // called without a change_id, i.e. when the person asks what's waiting.
    const asked = request.params.arguments?.[CHANGE_ID_PARAM];
    if (request.params.name === "list_pending_changes" && !asked) {
      return withOtherPending(result, undefined);
    }
    return withTaskOnlyNote(result);
  });

  return server;
}

// Team feedback 2026-10-08: change-related answers carried the other waiting
// changes ("Other Pending Changes") so an old change is never forgotten.
// Owner, 2026-10-17: while someone works on a task, show only that task;
// list the others only when the person asks (list_pending_changes without a
// change_id). Task answers get a one-line note telling the AI how to ask.
const OTHER_PENDING_TOOLS = new Set([
  "start_change",
  "confirm_change",
  "submit_for_review",
  "list_pending_changes",
  "publish_changes",
  "discard_change",
  "undo_change",
]);

const TASK_ONLY_NOTE =
  "Talk only about this change (its status, preview link and pull request). Don't list other waiting website changes unless the person asks; if they ask what else is waiting, call list_pending_changes without a change_id.";

function withTaskOnlyNote<
  T extends {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  },
>(result: T): T {
  const sc = result.structuredContent;
  if (result.isError || !sc) return result;
  const merged = { ...sc, otherPendingNote: TASK_ONLY_NOTE };
  return {
    ...result,
    structuredContent: merged,
    content: [{ type: "text", text: JSON.stringify(merged, null, 2) }],
  };
}

async function withOtherPending<
  T extends {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  },
>(result: T, requestedKey: string | undefined): Promise<T> {
  const sc = result.structuredContent;
  if (result.isError || !sc) return result;
  const exclude =
    sc.view === "list"
      ? null
      : typeof sc.changeId === "string"
        ? sc.changeId
        : (normalizeChangeKey(requestedKey) ?? null);
  // Never fails the answer it is attached to.
  const rows = await listOpenChangeSets()
    .then((open) => pendingRows(open, exclude))
    .catch(() => null);
  const extra = {
    otherPending: rows,
    otherPendingNote: `The person asked what's waiting. List these in plain words (what it is, when it was asked, status), or "No other pending changes." if there are none. Each can be previewed, published or discarded on its own; publishing one never publishes another.\n${otherPendingText(rows)}`,
  };
  const merged = { ...sc, ...extra };
  return {
    ...result,
    structuredContent: merged,
    content: [{ type: "text", text: JSON.stringify(merged, null, 2) }],
  };
}
