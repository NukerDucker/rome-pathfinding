import type { NodeId } from './romania'

// TODO(friend): fill from assignment PDF page 2 ONLY.
// BANNED: straight-line distance (SLD), even as an input to derive this from.
// BANNED: GPS / real-world coordinates. Must be a custom heuristic.
// See HEURISTIC_GUIDE.md before touching this file.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- params unused until h() is implemented
export function h(_node: NodeId, _goal: NodeId): number {
  return 0
}
