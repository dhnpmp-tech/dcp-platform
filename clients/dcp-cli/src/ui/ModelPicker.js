import React from 'react';
import { Box, Text } from 'ink';
import { sarAmount } from '../format.js';

const h = React.createElement;

/**
 * Model list: one row per coding model with label, VRAM, per-1M SAR prices,
 * and a live-status dot (green ● available / grey ○ busy). The selected row
 * carries the ▸ pointer; busy rows stay visible but are not launchable.
 */
export default function ModelPicker({ models, selectedIndex }) {
  if (models.length === 0) {
    return h(Text, { dimColor: true }, 'No coding models are live right now — try again soon.');
  }
  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, null, 'Model:'),
    ...models.map((model, index) => {
      const isSelected = index === selectedIndex;
      const isAvailable = model.status === 'available';
      const pointer = isSelected ? '▸' : ' ';
      const prices = `in ${sarAmount(model.price_in_halala_per_1m)}/M out ${sarAmount(model.price_out_halala_per_1m)}/M SAR`;
      return h(
        Box,
        { key: model.id, columnGap: 2 },
        // flexShrink + truncate keep every model on one row at narrow widths,
        // with the status dot always visible.
        h(
          Box,
          { flexShrink: 1 },
          h(
            Text,
            { color: isSelected ? 'cyan' : undefined, bold: isSelected, wrap: 'truncate-end' },
            `  ${pointer} ${model.label}   ${model.vram_gb}GB · ${prices}`
          )
        ),
        h(
          Box,
          { flexShrink: 0 },
          h(
            Text,
            { color: isAvailable ? 'green' : 'gray' },
            isAvailable ? '● available' : '○ busy'
          )
        )
      );
    })
  );
}
