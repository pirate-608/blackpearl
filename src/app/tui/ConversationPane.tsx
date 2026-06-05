import React from "react";
import { Box, Text } from "ink";
import type { ConversationMessage } from "../../agent/session.js";
import { formatForPanel } from "./format.js";

const ASCII_LOGO = [
  "        GG8888@@@@8888GG        ",
  "    GG88@@@@@@@@@@@@@@@@88GG    ",
  "  GG88@@@@@@@@@@@@@@@@@@@@88GG  ",
  "  88@@@@@@@@@@8888@@@@@@@@@@88  ",
  "GG@@@@@@@@@@00fftt@@@@@@@@@@@@GG",
  "88@@@@@@@@@@ff11iiGG00@@@@@@@@88",
  "88@@@@@@@@GGtt;;;;GGCC@@@@@@@@88",
  "@@@@@@@@@@LL;;;;iittii@@@@@@@@@@",
  "@@@@@@@@@@GG;;11ffttii@@@@@@@@@@",
  "88@@8888@@@@11CCCCCCff@@@@00GG88",
  "88@@CC11GGGGffLLLLCCLLGGGGLL@@88",
  "GG@@@@ii;;;;;;;;;;;;;;;;ii@@@@GG",
  "  88@@CC;;;;;;;;;;;;;;;;CC@@88  ",
  "  GG888888LLttiiiittLL0000GGGG  ",
  "    GG88@@@@@@@@@@@@@@@@88GG    ",
  "        GG8888@@@@8888GG        ",
];

type ConversationPaneProps = {
  messages: ConversationMessage[];
};

export function ConversationPane({ messages }: ConversationPaneProps): JSX.Element {
  const visibleMessages = messages.slice(-12);

  return (
    <Box flexDirection="column" width="58%" paddingX={1}>
      <Text color="cyan">Conversation</Text>
      {visibleMessages.length === 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {ASCII_LOGO.map((line, i) => (
            <Text key={i} color="cyan">{line}</Text>
          ))}
          <Text color="gray" dimColor>输入任务，例如：查一下爱因斯坦的出生年份，然后算一下他活了多少岁</Text>
        </Box>
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
