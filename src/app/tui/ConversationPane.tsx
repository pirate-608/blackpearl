import React from "react";
import { Box, Text } from "ink";
import type { ConversationMessage } from "../../agent/session.js";
import { formatForPanel } from "./format.js";

type ConversationPaneProps = {
  messages: ConversationMessage[];
};

export function ConversationPane({ messages }: ConversationPaneProps): JSX.Element {
  const visibleMessages = messages.slice(-12);

  return (
    <Box flexDirection="column" width="58%" paddingX={1}>
      <Text color="cyan">Conversation</Text>
      {visibleMessages.length === 0 ? (
        <Text color="gray">输入任务，例如：查一下爱因斯坦的出生年份，然后算一下他活了多少岁</Text>
      ) : (
        visibleMessages.map((message, index) => (
          <Box key={`${message.createdAt}-${index}`} flexDirection="column" marginTop={1}>
            <Text color={message.role === "user" ? "green" : "magenta"}>
              {message.role === "user" ? "User" : "Agent"}
            </Text>
            <Text>{formatForPanel(message.content, 900)}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
