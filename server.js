import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import db from "./db.js";
import authRoutes, { authenticateToken } from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing form data
app.use(cookieParser()); // For parsing cookies

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

// Authentication routes
app.use("/api/auth", authRoutes);

// Middleware to check if user is authenticated for templates
const checkAuth = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

// Login page
app.get("/login", (req, res) => {
  res.render('login', {
    title: 'Login',
    error: null
  });
});

// Register page
app.get("/register", (req, res) => {
  res.render('register', {
    title: 'Register',
    error: null
  });
});

// Handle login form submission
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', {
      title: 'Login',
      error: 'Email and password are required'
    });
  }

  try {
    // Find user by email
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.render('login', {
          title: 'Login',
          error: 'Database error occurred'
        });
      }

      if (results.length === 0) {
        return res.render('login', {
          title: 'Login',
          error: 'Invalid email or password'
        });
      }

      const user = results[0];

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.render('login', {
          title: 'Login',
          error: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Update last login
      db.query(
        "UPDATE users SET last_login = NOW() WHERE id = ?",
        [user.id],
        (err) => {
          if (err) console.error("Failed to update last login:", err);
        }
      );

      // Set token in cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Redirect to home page
      res.redirect('/');
    });
  } catch (error) {
    console.error("Login error:", error);
    res.render('login', {
      title: 'Login',
      error: 'Server error occurred'
    });
  }
});

// Handle register form submission
app.post("/auth/register", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  // Validation
  if (!username || !email || !password || !confirmPassword) {
    return res.render('register', {
      title: 'Register',
      error: 'All fields are required'
    });
  }

  if (password !== confirmPassword) {
    return res.render('register', {
      title: 'Register',
      error: 'Passwords do not match'
    });
  }

  if (password.length < 6) {
    return res.render('register', {
      title: 'Register',
      error: 'Password must be at least 6 characters'
    });
  }

  try {
    // Check if user already exists
    db.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [email, username],
      async (err, results) => {
        if (err) {
          console.error("Database error:", err);
          return res.render('register', {
            title: 'Register',
            error: 'Database error occurred'
          });
        }

        if (results.length > 0) {
          return res.render('register', {
            title: 'Register',
            error: 'User already exists with this email or username'
          });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user
        db.query(
          "INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, NOW())",
          [username, email, hashedPassword],
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              return res.render('register', {
                title: 'Register',
                error: 'Failed to create user'
              });
            }

            // Generate JWT token
            const token = jwt.sign(
              {
                id: result.insertId,
                username: username,
                email: email
              },
              process.env.JWT_SECRET,
              { expiresIn: "24h" }
            );

            // Set token in cookie
            res.cookie('token', token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });

            // Redirect to home page
            res.redirect('/');
          }
        );
      }
    );
  } catch (error) {
    console.error("Registration error:", error);
    res.render('register', {
      title: 'Register',
      error: 'Server error occurred'
    });
  }
});

// Logout route
app.post("/auth/logout", (req, res) => {
  // Clear the token cookie
  res.clearCookie('token');
  res.redirect('/');
});

// Game route (allows guest access)
app.get("/game", checkAuth, (req, res) => {
  // Allow guest access if guest=true parameter is present
  const isGuest = req.query.guest === 'true';

  if (!req.user && !isGuest) {
    return res.redirect('/login');
  }

  // For guest users, create a unique guest user object
  if (!req.user && isGuest) {
    // Generate unique guest ID using timestamp and random number
    const guestId = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const user = { 
      id: null, // Use null for guests to avoid foreign key issues
      username: guestId, 
      email: 'guest@example.com', 
      isGuest: true,
      guestId: guestId
    };
    
    res.render('game', {
      title: 'Endless Runner Game',
      user: user
    });
  } else {
    // Authenticated user
    res.render('game', {
      title: 'Endless Runner Game',
      user: req.user
    });
  }
});

// Test route (main menu)
app.get("/", checkAuth, (req, res) => {
  res.render('menu', {
    title: 'Endless Runner Game',
    user: req.user
  });
});

// Leaderboard route
app.get("/leaderboard", checkAuth, (req, res) => {
  db.query(
    `SELECT gs.id,
            CASE 
              WHEN u.username IS NOT NULL THEN u.username 
              WHEN gs.user_id IS NULL THEN CONCAT('Guest_', gs.id)
              ELSE 'Guest' 
            END as username,
            gs.final_score as score,
            gs.duration_seconds,
            gs.coins_collected,
            gs.obstacles_hit,
            gs.powerups_collected,
            gs.distance_traveled,
            gs.game_result,
            gs.created_at,
            gs.user_id
     FROM game_sessions gs
     LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
     ORDER BY gs.final_score DESC LIMIT 20`,
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.render('leaderboard', {
          title: 'Game Leaderboard',
          scores: [],
          user: req.user
        });
      }
      res.render('leaderboard', {
        title: 'Game Leaderboard',
        scores: results,
        user: req.user
      });
    }
  );
});

// Wiki route
app.get("/wiki", checkAuth, (req, res) => {
  res.render('wiki', {
    title: 'Game Wiki - Info, Payouts & Terms',
    user: req.user
  });
});

// Get all scores (public)
app.get("/api/scores", (req, res) => {
  db.query(
    `SELECT gs.id,
            CASE 
              WHEN u.username IS NOT NULL THEN u.username 
              WHEN gs.user_id IS NULL THEN CONCAT('Guest_', gs.id)
              ELSE 'Guest' 
            END as username,
            gs.final_score as score,
            gs.duration_seconds,
            gs.coins_collected,
            gs.obstacles_hit,
            gs.powerups_collected,
            gs.distance_traveled,
            gs.game_result,
            gs.created_at,
            gs.user_id
     FROM game_sessions gs
     LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
     ORDER BY gs.final_score DESC LIMIT 50`,
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Failed to fetch scores" });
      }
      res.json({
        message: "Scores retrieved successfully",
        scores: results
      });
    }
  );
});

// Get user's scores (protected)
app.get("/api/scores/my", authenticateToken, (req, res) => {
  db.query(
    "SELECT * FROM scores WHERE user_id = ? ORDER BY score DESC",
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Failed to fetch your scores" });
      }
      res.json({
        message: "Your scores retrieved successfully",
        scores: results
      });
    }
  );
});

// Add a new score (protected)
app.post("/api/scores", authenticateToken, (req, res) => {
  console.log("Score saving request received:", req.body);
  console.log("User:", req.user);
  
  const { score, level = 1, distance = 0, game_type = "default" } = req.body;
  
  if (!score || score < 0) {
    console.log("Invalid score:", score);
    return res.status(400).json({ message: "Valid score is required" });
  }

  db.query(
    "INSERT INTO scores (user_id, username, score, level, distance, game_type) VALUES (?, ?, ?, ?, ?, ?)",
    [req.user.id, req.user.username, score, level, distance, game_type],
    (err, result) => {
      if (err) {
        console.error("Database error saving score:", err);
        return res.status(500).json({ message: "Failed to save score" });
      }
      console.log("Score saved successfully:", result.insertId);
      res.json({ 
        message: "Score saved successfully!",
        scoreId: result.insertId
      });
    }
  );
});

// Add a new session (allows guest sessions)
app.post("/api/sessions", (req, res) => {
  // Check if user is authenticated or if it's a guest session
  const token = req.cookies.token;
  let user = null;

  if (token) {
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Token invalid, treat as guest
    }
  }

  console.log("Session saving request received:", req.body);
  console.log("Authenticated user:", user || 'None');

  // Handle guest users - get guest info from request body
  let userId, username;
  if (user) {
    userId = user.id;
    username = user.username;
  } else {
    // For guest users, use NULL for user_id and generate unique guest name
    const { guestId } = req.body;
    userId = null; // Use NULL to avoid foreign key constraint issues
    username = guestId || `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    console.log("Guest info from body:", { guestId, finalUserId: userId, finalUsername: username });
  }

  console.log("Final userId:", userId, "username:", username);

  const {
    sessionId,
    durationSeconds,
    finalScore,
    coinsCollected,
    obstaclesHit,
    powerupsCollected,
    distanceTraveled,
    gameResult
  } = req.body;

  if (!sessionId || !durationSeconds || finalScore === undefined) {
    console.log("Invalid session data:", req.body);
    return res.status(400).json({ message: "Valid session data is required" });
  }

  // Ensure all values are properly set
  const dbUserId = userId; // Allow NULL for guests
  const dbUsername = username || 'Guest';
  const dbCoinsCollected = coinsCollected || 0;
  const dbObstaclesHit = obstaclesHit || 0;
  const dbPowerupsCollected = powerupsCollected || 0;
  const dbDistanceTraveled = distanceTraveled || 0;
  const dbGameResult = gameResult || 'unknown';

  console.log("Inserting session with values:", {
    userId: dbUserId, sessionId, durationSeconds, finalScore, 
    coinsCollected: dbCoinsCollected, obstaclesHit: dbObstaclesHit, 
    powerupsCollected: dbPowerupsCollected, distanceTraveled: dbDistanceTraveled, 
    gameResult: dbGameResult
  });

  db.query(
    "INSERT INTO game_sessions (user_id, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [dbUserId, sessionId, durationSeconds, finalScore, dbCoinsCollected, dbObstaclesHit, dbPowerupsCollected, dbDistanceTraveled, dbGameResult],
    (err, result) => {
      if (err) {
        console.error("Database error saving session:", err);
        console.error("Error details:", err.message);
        return res.status(500).json({ message: "Failed to save session: " + err.message });
      }
      console.log("Session saved successfully with ID:", result.insertId);
      res.json({
        message: "Session saved successfully!",
        sessionId: result.insertId
      });
    }
  );
});

const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static('.'));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
