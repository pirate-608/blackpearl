import React from "react";
import { Box, Text } from "ink";

type StatusBarProps = {
  sessionId: string;
  provider: string;
  model: string;
  isRunning: boolean;
};

export function StatusBar({ sessionId, provider, model, isRunning }: StatusBarProps): JSX.Element {
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text color="cyan">Session </Text>
      <Text>{sessionId.slice(0, 8)}</Text>
      <Text color="gray"> | </Text>
      <Text color="cyan">Mode </Text>
      <Text>agent</Text>
      <Text color="gray"> | </Text>
      <Text color="cyan">Model </Text>
      <Text>
        {provider}:{model}
      </Text>
      <Text color="gray"> | </Text>
      <Text color={isRunning ? "yellow" : "green"}>
        {isRunning ? "running" : "ready"}
      </Text>
    </Box>
  );
}
