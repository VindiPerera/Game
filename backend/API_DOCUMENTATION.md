# Gaming App Authentication API Documentation

## Base URL
```
http://localhost:5000
```

## Authentication Endpoints

### 1. Register/Signup
**POST** `/api/auth/register`

**Request Body:**
```json
{
  "username": "player123",
  "email": "player@example.com",
  "password": "mypassword123"
}
```

**Response (Success - 201):**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "player123",
    "email": "player@example.com"
  }
}
```

### 2. Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "email": "player@example.com",
  "password": "mypassword123"
}
```

**Response (Success - 200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "player123",
    "email": "player@example.com"
  }
}
```

### 3. Get Profile (Protected)
**GET** `/api/auth/profile`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
```

**Response (Success - 200):**
```json
{
  "message": "Profile retrieved successfully",
  "user": {
    "id": 1,
    "username": "player123",
    "email": "player@example.com",
    "created_at": "2025-11-13T10:00:00.000Z",
    "last_login": "2025-11-13T10:05:00.000Z"
  }
}
```

### 4. Logout (Protected)
**POST** `/api/auth/logout`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
```

**Response (Success - 200):**
```json
{
  "message": "Logout successful"
}
```

## Game Score Endpoints

### 1. Get All Scores (Public)
**GET** `/api/scores`

**Response (Success - 200):**
```json
{
  "message": "Scores retrieved successfully",
  "scores": [
    {
      "id": 1,
      "username": "player123",
      "score": 1500,
      "game_type": "default",
      "created_at": "2025-11-13T10:00:00.000Z"
    }
  ]
}
```

### 2. Get My Scores (Protected)
**GET** `/api/scores/my`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
```

**Response (Success - 200):**
```json
{
  "message": "Your scores retrieved successfully",
  "scores": [
    {
      "id": 1,
      "user_id": 1,
      "username": "player123",
      "score": 1500,
      "game_type": "default",
      "created_at": "2025-11-13T10:00:00.000Z"
    }
  ]
}
```

### 3. Add New Score (Protected)
**POST** `/api/scores`

**Headers:**
```
Authorization: Bearer your_jwt_token_here
```

**Request Body:**
```json
{
  "score": 1500,
  "game_type": "puzzle" // optional, defaults to "default"
}
```

**Response (Success - 200):**
```json
{
  "message": "Score saved successfully!",
  "scoreId": 1
}
```

## Error Responses

### Authentication Errors
```json
// Missing token (401)
{
  "message": "Access token required"
}

// Invalid token (403)
{
  "message": "Invalid or expired token"
}

// Invalid credentials (401)
{
  "message": "Invalid email or password"
}
```

### Validation Errors
```json
// Missing fields (400)
{
  "message": "All fields are required"
}

// Password too short (400)
{
  "message": "Password must be at least 6 characters"
}

// User already exists (400)
{
  "message": "User already exists with this email or username"
}
```

## How to Use in Frontend

### 1. Register a new user
```javascript
const response = await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'player123',
    email: 'player@example.com',
    password: 'mypassword123'
  })
});

const data = await response.json();
if (response.ok) {
  // Store token in localStorage or sessionStorage
  localStorage.setItem('token', data.token);
  console.log('User registered:', data.user);
}
```

### 2. Login
```javascript
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'player@example.com',
    password: 'mypassword123'
  })
});

const data = await response.json();
if (response.ok) {
  localStorage.setItem('token', data.token);
  console.log('Login successful:', data.user);
}
```

### 3. Make authenticated requests
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5000/api/scores', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    score: 1500,
    game_type: 'puzzle'
  })
});

const data = await response.json();
console.log('Score saved:', data);
```

## Token Management

- JWT tokens expire in 24 hours
- Store tokens securely (localStorage for web apps)
- Include token in Authorization header: `Bearer your_token_here`
- Remove token on logout

## Database Tables Created

1. **users** - Stores user registration info
2. **scores** - Stores game scores linked to users
3. **game_sessions** - Optional table for tracking game sessions