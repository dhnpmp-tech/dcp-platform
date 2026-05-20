/**
 * Re-export of shared DCP API contracts.
 *
 * Source of truth: https://github.com/DCP-SA/dcp-contracts
 * Mounted as a git submodule at `packages/contracts`.
 *
 * Import from this file (never directly from the submodule path) so the
 * import surface stays stable if we later swap the submodule for an npm
 * package.
 *
 * Example:
 *   import type { components } from '@/lib/contracts';
 *   type GpuInfo = components['schemas']['GpuInfo'];
 *
 * Adoption is intentionally incremental. The platform's hand-rolled types
 * differ from the spec in several places (snake_case vs camelCase, narrow
 * projections, DCP-specific extensions). Resolve drift case-by-case in
 * follow-up PRs — do not silently widen or rename hand-rolled types here.
 */

export type { paths, components, operations } from '@dcp-sa/contracts';
