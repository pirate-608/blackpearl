import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { filterSlashCommands, type SlashCommand } from "./slash-commands.js";

type InputBoxProps = {
  commands: SlashCommand[];
  disabled: boolean;
  onSubmit: (value: string) => void;
  lastInput?: string | undefined;
};

const MAX_VISIBLE_COMMANDS = 6;

export function InputBox({
  commands,
  disabled,
  onSubmit,
  lastInput,
}: InputBoxProps): JSX.Element {
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commandSuggestions = useMemo(() => {
    return filterSlashCommands(value, commands).slice(0, MAX_VISIBLE_COMMANDS);
  }, [commands, value]);

  const showCommandSuggestions = !disabled && value.startsWith("/");

  function updateValue(nextValue: string, nextCursor?: number): void {
    setValue(nextValue);
    setCursorPos(nextCursor ?? nextValue.length);
    setSelectedIndex(0);
  }

  function submitCurrentValue(): void {
    const selectedCommand = commandSuggestions[selectedIndex];
    const submitted = selectedCommand?.name ?? value.trim();
    updateValue("", 0);

    if (submitted) {
      onSubmit(submitted);
    }
  }

  function completeSelectedCommand(): void {
    const selectedCommand = commandSuggestions[selectedIndex];

    if (selectedCommand) {
      updateValue(selectedCommand.name);
    }
  }

  useInput(
    (input, key) => {
      if (disabled) {
        return;
      }

      if (key.return) {
        submitCurrentValue();
        return;
      }

      // ── Cursor movement ────────────────────────────

      if (key.leftArrow) {
        setCursorPos(Math.max(0, cursorPos - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorPos(Math.min(value.length, cursorPos + 1));
        return;
      }

      // Ctrl+A — move to start of line
      if (key.ctrl && (input === "a" || input === "A")) {
        setCursorPos(0);
        return;
      }

      // Ctrl+E — move to end of line
      if (key.ctrl && (input === "e" || input === "E")) {
        setCursorPos(value.length);
        return;
      }

      // Ctrl+K — delete from cursor to end of line
      if (key.ctrl && (input === "k" || input === "K")) {
        setValue(value.slice(0, cursorPos));
        return;
      }

      // Ctrl+U — delete from start to cursor
      if (key.ctrl && (input === "u" || input === "U")) {
        setValue(value.slice(cursorPos));
        setCursorPos(0);
        return;
      }

      // ── Command suggestion navigation ──────────────

      if (showCommandSuggestions && key.upArrow) {
        setSelectedIndex((current) =>
          commandSuggestions.length === 0
            ? 0
            : (current - 1 + commandSuggestions.length) % commandSuggestions.length,
        );
        return;
      }

      if (showCommandSuggestions && key.downArrow) {
        setSelectedIndex((current) =>
          commandSuggestions.length === 0 ? 0 : (current + 1) % commandSuggestions.length,
        );
        return;
      }

      if (showCommandSuggestions && (key.tab || key.rightArrow)) {
        completeSelectedCommand();
        return;
      }

      // ── Recalling last input ───────────────────────

      if (key.upArrow && !showCommandSuggestions && value === "" && lastInput) {
        updateValue(lastInput);
        return;
      }

      // ── Delete operations ──────────────────────────

      if (key.backspace) {
        if (cursorPos > 0) {
          setValue(value.slice(0, cursorPos - 1) + value.slice(cursorPos));
          setCursorPos(cursorPos - 1);
        }
        return;
      }

      if (key.delete) {
        if (cursorPos < value.length) {
          setValue(value.slice(0, cursorPos) + value.slice(cursorPos + 1));
        }
        return;
      }

      // ── Regular text input ─────────────────────────

      if (!key.ctrl && !key.meta && input) {
        setValue(value.slice(0, cursorPos) + input + value.slice(cursorPos));
        setCursorPos(cursorPos + input.length);
      }
    },
    { isActive: !disabled },
  );

  // Visual cursor: invert the character at cursor position
  const cursorChar = value[cursorPos] ?? " ";
  const beforeCursor = value.slice(0, cursorPos);
  const afterCursor = value.slice(cursorPos + 1);

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" paddingX={1}>
        <Text color={disabled ? "gray" : "green"}>Input &gt; </Text>
        {disabled ? (
          <Text color="gray">Agent 正在执行...</Text>
        ) : (
          <>
            <Text>{beforeCursor}</Text>
            <Text inverse>{cursorChar}</Text>
            <Text>{afterCursor}</Text>
          </>
        )}
      </Box>
      {showCommandSuggestions ? (
        <Box flexDirection="column" paddingX={1}>
          {commandSuggestions.length > 0 ? (
            commandSuggestions.map((command, index) => (
              <Text
                key={command.name}
                color={index === selectedIndex ? "cyan" : "gray"}
                inverse={index === selectedIndex}
              >
                {index === selectedIndex ? "> " : "  "}
                {command.name.padEnd(8)} {command.description}
              </Text>
            ))
          ) : (
            <Text color="gray">  未找到匹配命令</Text>
          )}
          <Text color="gray">  ↑/↓ 选择，Tab/→ 补全，Enter 执行</Text>
        </Box>
      ) : null}
    </Box>
  );
}
