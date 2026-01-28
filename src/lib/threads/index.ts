/**
 * Threads Module
 *
 * Exports thread-related utilities including state machine,
 * archiving, and stale handling detection.
 */

export {
  THREAD_STATES,
  STATE_METADATA,
  getNextState,
  isValidTransition,
  getTransitionReason,
  type ThreadState,
  type Action,
  type StateMetadata,
  type TransitionContext,
} from "./stateMachine";

export {
  archiveThread,
  unarchiveThread,
} from "./archiveThread";

export {
  checkStaleHumanHandling,
  getTimeoutHours,
  type StaleHandlingResult,
} from "./staleHumanHandling";

export {
  sendTakeoverNotification,
  isNotificationConfigured,
  type TakeoverNotificationParams,
} from "./takeoverNotification";

export {
  detectClarificationLoop,
  getCategoryDescription,
  CLARIFICATION_LOOP_ESCALATION_DRAFT,
  type ClarificationCategory,
  type ClarificationLoopResult,
} from "./clarificationLoopDetector";

export {
  reprocessThread,
  type ReprocessResult,
  type ReprocessOptions,
} from "./reprocessThread";
