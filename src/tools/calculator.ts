import { Parser } from "expr-eval";
import { z } from "zod";
import { createToolDefinition } from "./registry.js";

const schema = z.object({
  expression: z
    .string()
    .min(1)
    .describe("A mathematical expression, for example: (1955 - 1879)"),
});

const parser = new Parser({
  operators: {
    assignment: false,
    logical: false,
    comparison: false,
    conditional: false,
    in: false,
  },
});

export const calculatorTool = createToolDefinition({
  name: "calculator",
  description: "Safely evaluate a mathematical expression.",
  schema,
  async execute(input) {
    const value = parser.evaluate(input.expression);

    return {
      expression: input.expression,
      result: value,
    };
  },
});
