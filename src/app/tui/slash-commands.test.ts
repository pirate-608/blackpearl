import { describe, expect, it } from "vitest";
import { filterSlashCommands, findSlashCommand } from "./slash-commands.js";

describe("slash commands", () => {
  it("finds exact commands", () => {
    expect(findSlashCommand("/tools")?.id).toBe("tools");
    expect(findSlashCommand("/missing")).toBeUndefined();
  });

  it("filters command suggestions by prefix", () => {
    expect(filterSlashCommands("/t").map((command) => command.name)).toEqual(["/tools"]);
    expect(filterSlashCommands("/m").map((command) => command.name)).toEqual(["/model"]);
    expect(filterSlashCommands("plain text")).toEqual([]);
  });
});
