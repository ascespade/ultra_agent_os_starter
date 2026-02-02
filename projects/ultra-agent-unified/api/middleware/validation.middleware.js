function validateInput(req, res, next) {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res
      .status(400)
      .json({ error: "Message is required and must be a string" });
  }

  if (message.length < 1 || message.length > 10000) {
    return res
      .status(400)
      .json({ error: "Message must be between 1 and 10000 characters" });
  }

  // Basic XSS prevention
  if (/<script|javascript:|on\w+=/i.test(message)) {
    return res.status(400).json({ error: "Invalid characters in message" });
  }

  next();
}

/**
 * Validates memory filename to prevent path traversal
 */
function validateFilename(req, res, next) {
  const { filename } = req.params;
  
  // CRITICAL FIX: Enhanced path traversal protection
  const SAFE_FILENAME = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/; 
  
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  // Allow simple filenames like data.json, user_1.txt
  // If stricter regex needed: /^[a-zA-Z0-9_-]+$/ (no extension)
  
  next();
}

module.exports = {
  validateInput,
  validateFilename
};
