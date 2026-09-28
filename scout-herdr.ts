#!/usr/bin/env bun
// Scout inside herdr. Actions open a pane; the pane does the work through the
// `scout` CLI, so the plugin carries no broker code of its own.
//
//   bun scout-herdr.ts open <ask|feed>   action: stash context, open the pane
//   bun scout-herdr.ts ask               popup: ask an agent, optionally about a selection
//   bun scout-herdr.ts feed              split: stream Scout broker messages
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

type InvocationContext = {
  selected_text?: string | null;
  focused_pane_cwd?: string | null;
  focused_pane_agent?: string | null;
  workspace_cwd?: string | null;
  workspace_label?: string | null;
};

const herdr = process.env.HERDR_BIN_PATH || "herdr";
const scout = process.env.SCOUT_BIN || "scout";
const pluginId = process.env.HERDR_PLUGIN_ID || "openscout.scout";
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || join(tmpdir(), "scout-herdr");
const stashPath = join(stateDir, "invocation.json");

function parseContext(raw: string | undefined): InvocationContext {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as InvocationContext) : {};
  } catch {
    return {};
  }
}

// A popup is a separate launch with its own context, so the action's context
// (the selection above all) is handed over through the plugin's state dir.
function open(entrypoint: string): number {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stashPath, process.env.HERDR_PLUGIN_CONTEXT_JSON ?? "{}");
  const result = spawnSync(herdr, ["plugin", "pane", "open", "--plugin", pluginId, "--entrypoint", entrypoint], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

function takeStashedContext(): InvocationContext {
  try {
    const context = parseContext(readFileSync(stashPath, "utf8"));
    rmSync(stashPath, { force: true });
    return context;
  } catch {
    return parseContext(process.env.HERDR_PLUGIN_CONTEXT_JSON);
  }
}

export function buildAskBody(question: string, selection: string | null | undefined): string {
  const trimmed = selection?.trim();
  if (!trimmed) return question.trim();
  return `${question.trim()}\n\nFrom my terminal:\n\n\`\`\`\n${trimmed}\n\`\`\``;
}

/** `scout ask` arguments: an explicit target wins, otherwise route by the pane's project. */
export function buildAskArgs(target: string, projectPath: string | null, promptFile: string): string[] {
  const args = ["ask"];
  const to = target.trim().replace(/^@/, "");
  if (to) args.push("--to", to);
  else if (projectPath) args.push("--project", projectPath);
  args.push("--notify", "--prompt-file", promptFile);
  return args;
}

function ask(): number {
  const context = takeStashedContext();
  const project = context.focused_pane_cwd || context.workspace_cwd || null;
  const selection = context.selected_text ?? null;

  console.log("Ask Scout");
  if (project) console.log(`project  ${basename(project)}  (${project})`);
  if (selection?.trim()) {
    const lines = selection.trim().split("\n");
    console.log(`about    ${lines.length} selected ${lines.length === 1 ? "line" : "lines"}`);
  }
  console.log("");

  const target = prompt(project ? "To (blank = this project's agent):" : "To:") ?? "";
  if (!target.trim() && !project) {
    console.log("No target and no project to route by.");
    return waitToClose(1);
  }
  const question = prompt("Ask:") ?? "";
  if (!question.trim()) return 0;

  const promptFile = join(tmpdir(), `scout-herdr-${process.pid}.md`);
  writeFileSync(promptFile, buildAskBody(question, selection));
  try {
    const result = spawnSync(scout, buildAskArgs(target, project, promptFile), {
      cwd: project ?? undefined,
      stdio: "inherit",
    });
    return waitToClose(result.status ?? 1);
  } finally {
    rmSync(promptFile, { force: true });
  }
}

function waitToClose(status: number): number {
  prompt(status === 0 ? "\nSent. Enter to close." : "\nEnter to close.");
  return status;
}

function feed(): number {
  const result = spawnSync(scout, ["watch", "--since", "30m"], { stdio: "inherit" });
  return result.status ?? 1;
}

if (import.meta.main) {
  const [command, argument] = process.argv.slice(2);
  const status = command === "open" && argument
    ? open(argument)
    : command === "ask"
      ? ask()
      : command === "feed"
        ? feed()
        : (console.error("usage: scout-herdr.ts open <ask|feed> | ask | feed"), 2);
  process.exit(status);
}
