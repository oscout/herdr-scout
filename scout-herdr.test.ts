import { describe, expect, test } from "bun:test";

import { buildAskArgs, buildAskBody } from "./scout-herdr.ts";

describe("buildAskArgs", () => {
  test("an explicit target wins, with or without its @", () => {
    expect(buildAskArgs("@hudson", "/repo", "/tmp/p.md"))
      .toEqual(["ask", "--to", "hudson", "--notify", "--prompt-file", "/tmp/p.md"]);
  });

  test("a blank target routes by the pane's project", () => {
    expect(buildAskArgs("  ", "/repo", "/tmp/p.md"))
      .toEqual(["ask", "--project", "/repo", "--notify", "--prompt-file", "/tmp/p.md"]);
  });
});

describe("buildAskBody", () => {
  test("a selection rides along as a fenced block under the question", () => {
    expect(buildAskBody("why does this fail?", "error: boom\n"))
      .toBe("why does this fail?\n\nFrom my terminal:\n\n```\nerror: boom\n```");
  });

  test("no selection is just the question", () => {
    expect(buildAskBody(" ship it? ", null)).toBe("ship it?");
  });
});
