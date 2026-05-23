import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { filterSlashCommands, type SlashCommand } from "./slash-commands.js";

type InputBoxProps = {
  commands: SlashCommand[];
  disabled: boolean;
  onSubmit: (value: string) => void;
};

const MAX_VISIBLE_COMMANDS = 6;

export function InputBox({ commands, disabled, onSubmit }: InputBoxProps): JSX.Element {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commandSuggestions = useMemo(() => {
    return filterSlashCommands(value, commands).slice(0, MAX_VISIBLE_COMMANDS);
  }, [commands, value]);

  const showCommandSuggestions = !disabled && value.startsWith("/");

  function updateValue(nextValue: string): void {
    setValue(nextValue);
    setSelectedIndex(0);
  }

  function submitCurrentValue(): void {
    const selectedCommand = commandSuggestions[selectedIndex];
    const submitted = selectedCommand?.name ?? value.trim();
    updateValue("");

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

      if (key.backspace || key.delete) {
        updateValue(value.slice(0, -1));
        return;
      }

      if (!key.ctrl && !key.meta && input) {
        updateValue(`${value}${input}`);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" paddingX={1}>
        <Text color={disabled ? "gray" : "green"}>Input &gt; </Text>
        <Text>{disabled ? "Agent 正在执行..." : value}</Text>
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
                {index === selectedIndex ? "› " : "  "}
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
