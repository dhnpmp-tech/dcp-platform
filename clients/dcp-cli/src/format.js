/** Money formatting shared by the CLI output and the Ink TUI. */

export const HALALA_PER_SAR = 100;

/** 14250 halala → "142.50" (SAR, 2dp, no unit). */
export const sarAmount = (halala) => (Number(halala || 0) / HALALA_PER_SAR).toFixed(2);

/** 14250 halala → "142.50 SAR". */
export const formatSAR = (halala) => `${sarAmount(halala)} SAR`;
