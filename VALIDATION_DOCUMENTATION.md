# Project Validation Documentation

## Authentication & Authorization Validations

### JWT Token Validation
- **Location**: `server.js` (checkAuth middleware), `auth.js`
- **Mechanism**: 
  - JWT token verification using `process.env.JWT_SECRET`
  - Token checked in both Authorization header and cookies
  - Automatic token invalidation on verification failure
  - 24-hour token expiration

### Session Management
- **Location**: `server.js` (checkAuth middleware)
- **Mechanism**:
  - Automatic user context clearing on invalid tokens
  - Cookie-based session persistence with httpOnly and secure flags
  - Last login timestamp updates

## User Registration Validations

### Input Validation
- **Location**: `server.js` (POST /auth/register)
- **Required Fields**: username, email, password, confirmPassword
- **Password Requirements**:
  - Minimum length: 6 characters
  - Confirmation matching
- **Username Requirements**:
  - One word only (no spaces)
  - Only alphanumeric characters and underscores
  - Regex: `/^[a-zA-Z0-9_]+$/`
- **Email Validation**:
  - Standard email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Uniqueness Checks**:
  - Email and username uniqueness across database
- **IP Address Logging**: Automatic IP capture for security tracking

## User Login Validations

### Authentication Checks
- **Location**: `server.js` (POST /auth/login), `auth.js`
- **Required Fields**: username, password
- **User Existence**: Database lookup verification
- **Password Verification**: bcrypt comparison with stored hash
- **Error Handling**: Generic "invalid username or password" messages to prevent user enumeration

## Password Management Validations

### Password Change
- **Location**: `server.js` (POST /settings/password)
- **Required Fields**: currentPassword, newPassword, confirmNewPassword
- **Current Password Verification**: bcrypt comparison
- **New Password Requirements**:
  - Minimum 6 characters
  - Confirmation matching
- **Security**: Password hashing with saltRounds = 10

### Email Change
- **Location**: `server.js` (POST /settings/email)
- **Required Fields**: newEmail, password
- **Email Format**: Regex validation
- **Password Verification**: Required for email changes
- **Uniqueness**: Email uniqueness check excluding current user

## Financial Transaction Validations

### Pool Entry Fees
- **Location**: `server.js` (POST /api/join-pool, POST /api/pricing-pools/:poolId/join)
- **Balance Checks**: User wallet balance >= entry fee
- **Pool Existence**: Valid pool ID verification
- **Duplicate Prevention**: Single participation per competition per user
- **Transaction Integrity**: Database transactions with rollback on failure

### Deposits
- **Location**: `server.js` (POST /api/wallet/deposit)
- **Amount Validation**: > 0 and >= $5 minimum
- **Transaction Recording**: Complete audit trail with balance tracking

### Withdrawals
- **Location**: `server.js` (POST /api/wallet/withdraw)
- **Amount Validation**: > 0 and >= $10 minimum
- **Balance Checks**: Sufficient wallet balance
- **Payment Method Verification**: Valid payment method ownership
- **Transaction States**: Pending approval system

## Game Session Anti-Cheat Validations

### Client-Side Anti-Tampering
- **Location**: `game.js` (EndlessRunner constructor)
- **Integrity Monitoring**:
  - Critical property setters with validation
  - Tampering detection flags
  - Score change monitoring (max 1000 points per change)
  - Invalid value rejection with console warnings

### Server-Side Session Validation
- **Location**: `server.js` (POST /api/sessions)
- **Tampering Detection**: Client-reported tampering flags trigger rejection
- **Score Validation**:
  - Range: 0-100,000 points
  - Must equal or exceed coins collected
  - Maximum 2x coins collected (for power-ups)
- **Coin Collection Limits**: 0-10,000 coins
- **Duration Limits**: 0-3,600 seconds (1 hour)
- **Distance Validation**:
  - Range: 0-1,000,000 pixels
  - Minimum proportional to duration (200 pixels/second)
  - Maximum reasonable distance (600 pixels/second)
- **Score Progression**: Score ≤ distance/10 * 3 (allowing power-up multipliers)
- **Rate Limiting**:
  - Coins per second: ≤ 8
  - Obstacles per second: ≤ 3
  - Power-ups collected: ≤ 20
- **Duration-Based Validation**: High scores require minimum game time
- **Cross-Validation**: Multiple suspicious metrics trigger rejection
- **Suspicious Pattern Detection**: Automatic rejection of unrealistic combinations

### Client-Side Validation
- **Location**: `game.js` (endSession method)
- **Pre-Server Validation**:
  - Score caps based on reasonable maximums
  - Coin collection rate limits
  - Obstacle hit rate limits
  - Integrity hash generation for server verification

## Database-Level Validations

### Schema Constraints
- **Location**: `database_schema.sql`
- **Unique Constraints**: username, email
- **Foreign Key Constraints**: User references, cascade deletes
- **Data Types**: Enforced through column definitions

## Input Sanitization

### SQL Injection Prevention
- **Location**: Throughout `server.js`, `auth.js`
- **Mechanism**: Parameterized queries using mysql2 library
- **Example**: `db.query("SELECT * FROM users WHERE username = ?", [username])`

### XSS Prevention
- **Location**: EJS templates, server responses
- **Mechanism**: 
  - EJS automatic HTML escaping
  - Content Security Policy headers
  - No direct HTML injection from user inputs

## Rate Limiting & Abuse Prevention

### Session Limits
- **Location**: `check-sessions.js`
- **Mechanism**: Session count monitoring for abuse detection

### Transaction Limits
- **Location**: `server.js` (financial endpoints)
- **Mechanism**: Minimum/maximum amount restrictions, balance verification

## Error Handling & Security

### Generic Error Messages
- **Location**: Throughout authentication endpoints
- **Purpose**: Prevent information leakage (e.g., "Invalid username or password" instead of specific errors)

### Transaction Rollbacks
- **Location**: `server.js` (financial operations)
- **Mechanism**: Database transaction rollbacks on validation failures

### Logging
- **Location**: Throughout server code
- **Security Events**: Failed authentications, suspicious activities logged

## Client-Side Security

### Code Integrity
- **Location**: `game.js`
- **Mechanism**: 
  - Function reference monitoring
  - Property setter overrides
  - Tampering detection with server reporting

### Input Validation
- **Location**: `game.js` (various methods)
- **Mechanism**: Client-side bounds checking before server submission

---

This comprehensive validation system provides multiple layers of protection against common web application vulnerabilities including SQL injection, XSS, authentication bypasses, and game cheating attempts. The combination of client-side monitoring, server-side validation, and database constraints creates a robust security posture.