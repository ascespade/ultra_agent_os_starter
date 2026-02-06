/**
 * Job State Machine
 * Validates job status transitions to maintain state consistency
 */

class StateMachine {
  // Valid job states and their allowed transitions
  static STATES = {
    PENDING: ['pending', 'active', 'failed'],
    ACTIVE: ['active', 'completed', 'failed'],
    COMPLETED: ['completed'], // Terminal state
    FAILED: ['failed', 'pending'] // Can retry failed jobs
  };

  static validateTransition(fromStatus, toStatus) {
    // Normalize status values
    const from = fromStatus?.toLowerCase();
    const to = toStatus?.toLowerCase();

    // Allow same status (idempotent)
    if (from === to) {
      return true;
    }

    // Check if transition is valid
    const allowedTransitions = this.STATES[from.toUpperCase()];
    if (!allowedTransitions) {
      throw new Error(`Invalid source state: ${fromStatus}`);
    }

    if (!allowedTransitions.includes(to)) {
      throw new Error(`Invalid state transition: ${fromStatus} -> ${toStatus}. Allowed: ${allowedTransitions.join(', ')}`);
    }

    return true;
  }

  static getValidTransitions(status) {
    const normalized = status?.toLowerCase();
    return this.STATES[normalized?.toUpperCase()] || [];
  }

  static isTerminalState(status) {
    const normalized = status?.toLowerCase();
    const transitions = this.STATES[normalized?.toUpperCase()] || [];
    return transitions.length === 1 && transitions[0] === normalized;
  }

  static canRetry(status) {
    const normalized = status?.toLowerCase();
    const transitions = this.STATES[normalized?.toUpperCase()] || [];
    return transitions.includes('pending');
  }
}

module.exports = StateMachine;
