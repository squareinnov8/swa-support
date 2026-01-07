/**
 * Collaboration Module
 *
 * Enables human-agent collaboration for the Lina support agent.
 * Provides intervention detection, observation mode, and learning.
 */

// Types
export type {
  InterventionChannel,
  InterventionSignal,
  ObservedMessage,
  ObservationState,
  ResolutionType,
  ObservationResolution,
  LearningProposalType,
  LearningProposal,
  LearningProposalStatus,
  CustomerProfile,
  EscalationEmailContent,
  EscalationResponse,
} from "./types";

// Intervention Detection
export {
  detectGmailIntervention,
  detectHubSpotIntervention,
  detectAdminIntervention,
  isThreadBeingHandled,
  wasMessageGeneratedByAgent,
  getThreadHandler,
} from "./interventionDetector";

// Observation Mode
export {
  enterObservationMode,
  recordObservation,
  exitObservationMode,
  getActiveObservation,
  isInObservationMode,
} from "./observationMode";

// Learning
export {
  generateLearningProposals,
  getPendingProposals,
  approveProposal,
  rejectProposal,
} from "./learningGenerator";
