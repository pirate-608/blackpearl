import React from "react";
import { Box, Text } from "ink";
import type { ActivityItem } from "../../agent/session.js";
import { formatForPanel } from "./format.js";

type ActivityPaneProps = {
  activities: ActivityItem[];
};

export function ActivityPane({ activities }: ActivityPaneProps): JSX.Element {
  const visibleActivities = activities.slice(-16);

  return (
    <Box flexDirection="column" width="42%" paddingX={1}>
      <Text color="cyan">Activity</Text>
      {visibleActivities.length === 0 ? (
        <Text color="gray">工具调用会显示在这里</Text>
      ) : (
        visibleActivities.map((activity) => (
          <Box key={activity.id} flexDirection="column" marginTop={1}>
            <Text color={activity.label.startsWith("failed") ? "red" : "yellow"}>
              {activity.label}
            </Text>
            {activity.detail ? <Text color="gray">{formatForPanel(activity.detail)}</Text> : null}
          </Box>
        ))
      )}
    </Box>
  );
}
