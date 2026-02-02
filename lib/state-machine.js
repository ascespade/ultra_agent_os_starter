/**
 * JOB STATE MACHINE
 * 
 * Validates job state transitions to prevent invalid states and data corruption.
 * 
 * Valid transitions:
 * - planning → processing, failed
 * - processing → completed, failed
 * - completed → (terminal state)
 * - failed → (terminal state)
 * 
 * CRITICAL FIX: Prevents job state corruption under concurrent load
 */

const JobStates = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PLANNING: 'planning',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Define valid state transitions
const VALID_TRANSITIONS = {
  [JobStates.PENDING]: [JobStates.QUEUED, JobStates.PLANNING, JobStates.PROCESSING, JobStates.FAILED],
  [JobStates.QUEUED]: [JobStates.PLANNING, JobStates.PROCESSING, JobStates.FAILED],
  [JobStates.PLANNING]: [JobStates.PROCESSING, JobStates.FAILED],
  [JobStates.PROCESSING]: [JobStates.COMPLETED, JobStates.FAILED],
  [JobStates.COMPLETED]: [], // Terminal state
  [JobStates.FAILED]: []      // Terminal state
};

/**
 * Validates if a state transition is allowed
 * @param {string} currentState - Current job state
 * @param {string} newState - Desired new state
 * @returns {boolean} - True if transition is valid
 * @throws {Error} - If transition is invalid
 */
function validateTransition(currentState, newState) {
  // Allow same state (idempotent updates)
  if (currentState === newState) {
    return true;
  }

  // Check if current state is valid
  if (!VALID_TRANSITIONS.hasOwnProperty(currentState)) {
    throw new Error(`Invalid current state: ${currentState}`);
  }

  // Check if new state is valid
  if (!Object.values(JobStates).includes(newState)) {
    throw new Error(`Invalid new state: ${newState}`);
  }

  // Check if transition is allowed
  const allowedTransitions = VALID_TRANSITIONS[currentState];
  if (!allowedTransitions.includes(newState)) {
    throw new Error(
      `Invalid state transition: ${currentState} → ${newState}. ` +
      `Allowed transitions from ${currentState}: ${allowedTransitions.join(', ') || 'none (terminal state)'}`
    );
  }

  return true;
}

/**
 * Checks if a state is terminal (no further transitions allowed)
 * @param {string} state - Job state to check
 * @returns {boolean} - True if state is terminal
 */
function isTerminalState(state) {
  return VALID_TRANSITIONS[state] && VALID_TRANSITIONS[state].length === 0;
}

/**
 * Gets allowed transitions for a given state
 * @param {string} state - Current job state
 * @returns {string[]} - Array of allowed next states
 */
function getAllowedTransitions(state) {
  return VALID_TRANSITIONS[state] || [];
}

/**
 * Validates job state data
 * @param {string} state - Job state to validate
 * @returns {boolean} - True if state is valid
 * @throws {Error} - If state is invalid
 */
function validateState(state) {
  if (!Object.values(JobStates).includes(state)) {
    throw new Error(`Invalid job state: ${state}. Valid states: ${Object.values(JobStates).join(', ')}`);
  }
  return true;
}

/**
 * Creates a state transition log entry
 * @param {string} jobId - Job ID
 * @param {string} fromState - Previous state
 * @param {string} toState - New state
 * @param {string} reason - Reason for transition
 * @returns {object} - Log entry
 */
function createTransitionLog(jobId, fromState, toState, reason = null) {
  return {
    jobId,
    fromState,
    toState,
    reason,
    timestamp: new Date().toISOString(),
    valid: fromState === toState || VALID_TRANSITIONS[fromState]?.includes(toState)
  };
}

module.exports = {
  JobStates,
  VALID_TRANSITIONS,
  validateTransition,
  isTerminalState,
  getAllowedTransitions,
  validateState,
  createTransitionLog
};
