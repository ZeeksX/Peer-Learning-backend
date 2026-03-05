# Quick Fix Guide - Architecture Gaps

## 🔴 CRITICAL FIX #1: Rate Limiting

### Current Status
❌ **Missing** - No rate limiting protection

### Why This Matters
- Protects login endpoints from brute force attacks (try passwords rapidly)
- Prevents API abuse and DoS attacks
- Standard security best practice

### Step 1: Install dependency
```bash
npm install express-rate-limit
```

### Step 2: Add to index.js
Replace this section in `index.js`:

**BEFORE:**
```javascript
app.use(cors({...}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);
app.use('/uploads', express.static(path.resolve('uploads')));

// Routes
app.use('/api', routes);
```

**AFTER:**
```javascript
import rateLimit from 'express-rate-limit';

// ... existing imports ...

// Rate limiting middleware
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  skipSuccessfulRequests: true, // Don't count successful logins
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false // Disable X-RateLimit-* headers
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(cors({...}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);
app.use('/uploads', express.static(path.resolve('uploads')));

// Apply rate limiting
app.use('/api/v1/tutor/auth/login', loginLimiter);
app.use('/api/v1/learner/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api', routes);
```

### Testing
```bash
# Try login 6 times rapidly - 6th should fail with 429 status
curl -X POST http://localhost:5000/api/v1/tutor/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass"}'
```

---

## 🟡 CRITICAL FIX #2: Request Validation

### Current Status
⚠️ **Partial** - Only checks required fields, no format validation

### Why This Matters
- Invalid data corrupts database (bad emails, weak passwords)
- Inconsistent API contract with frontend
- Security risk (no password complexity requirements)
- Poor user experience (silent failures)

### What's Missing
- Email format validation (`test` is accepted instead of `test@email.com`)
- Password strength rules (no minimum length or complexity)
- String length bounds (name can be 1 char or 1000 chars)
- Numeric constraints (hourly rate can be negative)

### Solution: Add Validation Middleware

#### Step 1: Install joi
```bash
npm install joi
```

#### Step 2: Create src/middleware/validationMiddleware.js
```javascript
import joi from 'joi';
import { sendError } from './responseHandler.js';

// Define reusable schemas
export const schemas = {
  email: joi.string().email().required().messages({
    'string.email': 'Invalid email format',
    'any.required': 'Email is required'
  }),
  
  password: joi.string().min(8).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must have uppercase, lowercase, and number',
      'any.required': 'Password is required'
    }),
  
  name: joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must be less than 100 characters',
    'any.required': 'Name is required'
  }),
  
  hourlyRate: joi.number().positive().required().messages({
    'number.positive': 'Hourly rate must be greater than 0',
    'number.base': 'Hourly rate must be a number',
    'any.required': 'Hourly rate is required'
  }),
  
  title: joi.string().min(5).max(500).required(),
  description: joi.string().min(10).max(2000).optional(),
};

// Generic validator
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Show all errors, not just first
      stripUnknown: true // Remove unknown fields
    });
    
    if (error) {
      const messages = error.details.map(d => d.message).join('; ');
      return sendError(res, messages, 'VALIDATION_ERROR', 400);
    }
    
    req.body = value; // Use sanitized value
    next();
  };
};

// Specific schemas
export const tutorRegisterSchema = joi.object({
  name: schemas.name,
  email: schemas.email,
  password: schemas.password,
  bio: joi.string().max(500).optional(),
  subjects: joi.array().items(joi.string()).optional(),
  hourlyRate: joi.number().positive().optional()
});

export const learnerRegisterSchema = joi.object({
  name: schemas.name,
  email: schemas.email,
  password: schemas.password,
  interests: joi.array().items(joi.string()).optional()
});

export const sessionCreateSchema = joi.object({
  title: schemas.title,
  description: schemas.description,
  courseId: joi.string().optional(),
  startTime: joi.date().required().messages({
    'date.base': 'Start time must be a valid date',
    'any.required': 'Start time is required'
  }),
  duration: joi.number().positive().required().messages({
    'number.positive': 'Duration must be greater than 0'
  }),
  maxStudents: joi.number().positive().optional()
});
```

#### Step 3: Apply to auth routes

**In src/routes/tutorRoutes.js:**
```javascript
import { tutorRegisterSchema, validateRequest } from '../middleware/validationMiddleware.js';

// OLD
router.post('/auth/register', registerTutor);

// NEW
router.post('/auth/register', validateRequest(tutorRegisterSchema), registerTutor);
```

**In src/routes/learnerRoutes.js:**
```javascript
import { learnerRegisterSchema, validateRequest } from '../middleware/validationMiddleware.js';

// OLD
router.post('/auth/register', registerLearner);

// NEW
router.post('/auth/register', validateRequest(learnerRegisterSchema), registerLearner);
```

#### Step 4: Apply to session creation
**In src/routes/tutorRoutes.js:**
```javascript
import { sessionCreateSchema, validateRequest } from '../middleware/validationMiddleware.js';

// OLD
router.post('/sessions', createSession);

// NEW
router.post('/sessions', validateRequest(sessionCreateSchema), createSession);
```

### Testing
```bash
# Test 1: Invalid email
curl -X POST http://localhost:5000/api/v1/tutor/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John",
    "email": "not-an-email",
    "password": "Weak1"
  }'
# Expected: 400 error "Invalid email format; Password must have..."

# Test 2: Valid registration
curl -X POST http://localhost:5000/api/v1/tutor/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass1",
    "bio": "Math tutor",
    "hourlyRate": 50
  }'
# Expected: 201 success with token
```

---

## Implementation Order

1. **First:** Rate Limiting (5 min - highest security impact)
2. **Second:** Request Validation (15 min - maintains data integrity)

Both are **straightforward** with no risk to existing functionality.

---

## Files to Create/Modify

### New Files:
- `src/middleware/validationMiddleware.js` - Validation schemas

### Files to Modify:
- `index.js` - Add rate limiting
- `src/routes/tutorRoutes.js` - Add validation to register + session create
- `src/routes/learnerRoutes.js` - Add validation to register

**Total Time:** ~20 minutes  
**Risk Level:** LOW (purely additive, no breaking changes)

---

## After Implementation

Run this to verify no syntax errors:
```bash
node --input-type=module -e "
import('./src/routes/tutorRoutes.js')
  .then(() => import('./src/routes/learnerRoutes.js'))
  .then(() => console.log('✅ Validation routes loaded'))
  .catch((e) => console.error('❌ Error:', e.message))
"
```

Then test the endpoints with the curl examples above.
