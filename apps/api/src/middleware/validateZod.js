const { z } = require('zod');
const pino = require('pino');

const logger = pino({
  name: 'validate-zod',
  level: process.env.LOG_LEVEL || 'info'
});

/**
 * Zod validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} target - What to validate ('body', 'params', 'query')
 * @returns {Function} Express middleware
 */
function validateZod(schema, target = 'body') {
  return (req, res, next) => {
    try {
      let data;
      
      switch (target) {
        case 'body':
          data = req.body;
          break;
        case 'params':
          data = req.params;
          break;
        case 'query':
          data = req.query;
          break;
        default:
          data = req.body;
      }

      const result = schema.safeParse(data);
      
      if (!result.success) {
        const errorDetails = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        logger.warn({
          path: req.path,
          method: req.method,
          target,
          errors: errorDetails
        }, 'Validation failed');

        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: errorDetails
        });
      }

      // Store validated data back to request
      switch (target) {
        case 'body':
          req.body = result.data;
          break;
        case 'params':
          req.params = result.data;
          break;
        case 'query':
          req.query = result.data;
          break;
      }

      next();
    } catch (error) {
      logger.error({
        error: error.message,
        path: req.path,
        method: req.method,
        target
      }, 'Validation middleware error');

      return res.status(500).json({
        error: 'Internal server error',
        message: 'Validation process failed'
      });
    }
  };
}

// Common validation schemas
const schemas = {
  // Authentication schemas
  login: z.object({
    username: z.string().min(1, 'Username is required').max(50, 'Username too long'),
    password: z.string().min(1, 'Password is required').max(100, 'Password too long')
  }),

  // Job schemas
  createJob: z.object({
    message: z.string().min(1, 'Message is required').max(10000, 'Message too long')
  }),

  jobId: z.object({
    jobId: z.string().uuid('Invalid job ID format')
  }),

  // Memory schemas
  filename: z.object({
    filename: z.string().min(1, 'Filename is required')
                    .max(255, 'Filename too long')
                    .regex(/^[a-zA-Z0-9_.-]+$/, 'Filename can only contain letters, numbers, dots, hyphens, and underscores')
  }),

  memoryData: z.object({
    content: z.any().optional(),
    data: z.any().optional()
  }).refine((val) => val !== null && val !== undefined && (val.content !== undefined || val.data !== undefined), {
    message: 'Either content or data field is required'
  }),

  // Admin schemas
  createTenant: z.object({
    name: z.string().min(1, 'Tenant name is required').max(100, 'Tenant name too long'),
    tenantId: z.string().min(1, 'Tenant ID is required')
                   .max(50, 'Tenant ID too long')
                   .regex(/^[a-z0-9_-]+$/, 'Tenant ID can only contain lowercase letters, numbers, hyphens, and underscores')
  }),

  // Adapter schemas
  testAdapter: z.object({
    adapter: z.enum(['redis', 'database', 'websocket'], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_enum_value) {
          return { message: 'Adapter must be one of: redis, database, websocket' };
        }
        return { message: ctx.defaultError };
      }
    }),
    test_type: z.string().min(1, 'Test type is required').max(50, 'Test type too long')
  }),

  // Pagination schemas
  pagination: z.object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20)
  })
};

// Validation middleware functions
const validate = {
  login: validateZod(schemas.login, 'body'),
  createJob: validateZod(schemas.createJob, 'body'),
  jobId: validateZod(schemas.jobId, 'params'),
  filename: validateZod(schemas.filename, 'params'),
  memoryData: validateZod(schemas.memoryData, 'body'),
  createTenant: validateZod(schemas.createTenant, 'body'),
  testAdapter: validateZod(schemas.testAdapter, 'body'),
  pagination: validateZod(schemas.pagination, 'query')
};

// Combined validation for complex requests
const validateMemoryWrite = [
  validateZod(schemas.filename, 'params'),
  validateZod(schemas.memoryData, 'body')
];

module.exports = {
  validateZod,
  schemas,
  validate
};
