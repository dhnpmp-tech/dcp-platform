import React from 'react';
import { Box, Text } from 'ink';

const h = React.createElement;

/**
 * One-line agent row: the selected agent gets a filled dot and highlight,
 * coming-soon agents are greyed out with a "(soon)" suffix.
 */
export default function AgentPicker({ agents, selectedIndex }) {
  return h(
    Box,
    null,
    h(Text, null, 'Agent:   '),
    ...agents.flatMap((agent, index) => {
      const isSelected = index === selectedIndex;
      const marker = isSelected ? '●' : '○';
      const name = agent.comingSoon ? `${agent.label} (soon)` : agent.label;
      const parts = [
        h(
          Text,
          {
            key: agent.id,
            color: isSelected ? 'cyan' : undefined,
            bold: isSelected,
            dimColor: agent.comingSoon,
          },
          `${marker} ${name}`
        ),
      ];
      if (index < agents.length - 1) {
        parts.push(h(Text, { key: `${agent.id}-gap` }, '   '));
      }
      return parts;
    })
  );
}
