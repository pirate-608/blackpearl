import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";
import { calculatorTool } from "./calculator.js";

describe("calculatorTool", () => {
  it("evaluates arithmetic expressions safely", async () => {
    const registry = new ToolRegistry({
      workspaceRoot: process.cwd(),
    });
    registry.register(calculatorTool);

    const result = await registry.execute("calculator", {
      expression: "(1955 - 1879)",
    });

    expect(result).toEqual({
      expression: "(1955 - 1879)",
      result: 76,
    });
  });
});
