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
  description:
    "Safely evaluate a mathematical expression. " +
    "The expression must contain only numbers, operators (+, -, *, /, ^), " +
    "parentheses, and decimals. Do NOT include commas, dates like (3, 14), " +
    "JSON, equals signs, or units.",
  schema,
  async execute(input) {
    try {
      const value = parser.evaluate(input.expression);

      return {
        expression: input.expression,
        result: value,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        expression: input.expression,
        error: `Invalid expression: ${message}. Use only numbers, operators (+, -, *, /, ^), parentheses, and decimals. Remove commas, dates, or JSON syntax.`,
      };
    }
  },
});
