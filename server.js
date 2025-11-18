import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import fs from 'fs';
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
  const { username, email, password, confirmPassword, country } = req.body;

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
          "INSERT INTO users (username, email, password, country, created_at) VALUES (?, ?, ?, ?, NOW())",
          [username, email, hashedPassword, country && country.trim() ? country.trim() : null],
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
  const guestId = req.query.guestId; // Get guest ID from query params

  if (!req.user && !isGuest) {
    return res.redirect('/login');
  }

  // For guest users, use provided guest ID or create a new one
  let user;
  if (isGuest) {
    const finalGuestId = guestId || 'GUEST_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    user = { 
      id: 0, 
      username: finalGuestId, 
      email: 'guest@example.com', 
      isGuest: true,
      guestId: finalGuestId 
    };
  } else {
    user = req.user;
  }

  res.render('game', {
    title: 'Endless Runner Game',
    user: user
  });
});

// Test route (main menu)
app.get("/", checkAuth, (req, res) => {
  res.render('menu', {
    title: 'Endless Runner Game',
    user: req.user
  });
});

// Leaderboard route - Shows each user's highest score from last 24 hours
app.get("/leaderboard", checkAuth, (req, res) => {
  // Get the main leaderboard query
      db.query(
        `SELECT 
                ranked_sessions.username,
                ranked_sessions.score,
                ranked_sessions.duration_seconds,
                ranked_sessions.coins_collected,
                ranked_sessions.obstacles_hit,
                ranked_sessions.powerups_collected,
                ranked_sessions.distance_traveled,
                ranked_sessions.game_result,
                ranked_sessions.created_at,
                ranked_sessions.user_id,
                ranked_sessions.guest_username
         FROM (
           SELECT 
                CASE 
                  WHEN u.username IS NOT NULL THEN u.username 
                  WHEN gs.guest_username IS NOT NULL THEN gs.guest_username
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
                gs.user_id,
                gs.guest_username,
                gs.id,
                ROW_NUMBER() OVER (
                  PARTITION BY 
                    CASE 
                      WHEN gs.user_id IS NOT NULL THEN CONCAT('user_', gs.user_id)
                      WHEN gs.guest_username IS NOT NULL THEN CONCAT('guest_', gs.guest_username)
                      ELSE CONCAT('unknown_', gs.id)
                    END
                  ORDER BY gs.final_score DESC, gs.created_at DESC
                ) as rn
           FROM game_sessions gs
           LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
           WHERE gs.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ) ranked_sessions
         WHERE ranked_sessions.rn = 1
         ORDER BY ranked_sessions.score DESC 
         LIMIT 20`,
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

// Winners route - Shows top 3 players from selected day (defaults to yesterday)
app.get("/winners", checkAuth, (req, res) => {
  // Set permissive CSP for winners page to allow Bootstrap, images, and inline scripts
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://cdn.jsdelivr.net data:; " +
    "connect-src 'self'"
  );
  
  // Get date parameter from query string, default to yesterday in Sri Lankan timezone (UTC+5:30)
  const sriLankaOffset = 5.5 * 60 * 60 * 1000; // UTC+5:30 in milliseconds
  const nowInSriLanka = new Date(Date.now() + sriLankaOffset); // Current time in Sri Lanka
  const yesterdayInSriLanka = new Date(nowInSriLanka - 24 * 60 * 60 * 1000); // Yesterday in Sri Lanka
  const selectedDate = req.query.date || yesterdayInSriLanka.toISOString().split('T')[0];
  
  const query = `
        SELECT 
                ranked_sessions.username,
                ranked_sessions.score,
                ranked_sessions.duration_seconds,
                ranked_sessions.coins_collected,
                ranked_sessions.obstacles_hit,
                ranked_sessions.powerups_collected,
                ranked_sessions.distance_traveled,
                ranked_sessions.game_result,
                ranked_sessions.created_at,
                ranked_sessions.user_id,
                ranked_sessions.guest_username
         FROM (
           SELECT 
                CASE 
                  WHEN u.username IS NOT NULL THEN u.username 
                  WHEN gs.guest_username IS NOT NULL THEN gs.guest_username
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
                gs.user_id,
                gs.guest_username,
                gs.id,
                ROW_NUMBER() OVER (
                  PARTITION BY 
                    CASE 
                      WHEN gs.user_id IS NOT NULL THEN CONCAT('user_', gs.user_id)
                      WHEN gs.guest_username IS NOT NULL THEN CONCAT('guest_', gs.guest_username)
                      ELSE CONCAT('unknown_', gs.id)
                    END
                  ORDER BY gs.final_score DESC, gs.created_at DESC
                ) as rn
           FROM game_sessions gs
           LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
           WHERE DATE(gs.created_at) = ?
         ) ranked_sessions
         WHERE ranked_sessions.rn = 1
         ORDER BY ranked_sessions.score DESC 
         LIMIT 3`;

  db.query(query, [selectedDate], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.render('winners', {
        title: 'Game Winners',
        winners: [],
        selectedDate: selectedDate,
        user: req.user,
        error: 'Failed to load winners data'
      });
    }
    
    res.render('winners', {
      title: 'Game Winners',
      winners: results,
      selectedDate: selectedDate,
      user: req.user,
      error: null
    });
  });
});

// Wiki route
app.get("/wiki", checkAuth, (req, res) => {
  res.render('wiki', {
    title: 'Game Wiki - Info, Payouts & Terms',
    user: req.user
  });
});

// Get all scores (public) - Shows each user's highest score from last 24 hours
app.get("/api/scores", (req, res) => {
      
      db.query(
        `SELECT 
                ranked_sessions.username,
                ranked_sessions.score,
                ranked_sessions.duration_seconds,
                ranked_sessions.coins_collected,
                ranked_sessions.obstacles_hit,
                ranked_sessions.powerups_collected,
                ranked_sessions.distance_traveled,
                ranked_sessions.game_result,
                ranked_sessions.created_at,
                ranked_sessions.user_id,
                ranked_sessions.guest_username
         FROM (
           SELECT 
                CASE 
                  WHEN u.username IS NOT NULL THEN u.username 
                  WHEN gs.guest_username IS NOT NULL THEN gs.guest_username
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
                gs.user_id,
                gs.guest_username,
                gs.id,
                ROW_NUMBER() OVER (
                  PARTITION BY 
                    CASE 
                      WHEN gs.user_id IS NOT NULL THEN CONCAT('user_', gs.user_id)
                      WHEN gs.guest_username IS NOT NULL THEN CONCAT('guest_', gs.guest_username)
                      ELSE CONCAT('unknown_', gs.id)
                    END
                  ORDER BY gs.final_score DESC, gs.created_at DESC
                ) as rn
           FROM game_sessions gs
           LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
           WHERE gs.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ) ranked_sessions
         WHERE ranked_sessions.rn = 1
         ORDER BY ranked_sessions.score DESC 
         LIMIT 50`,
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

  console.log("Session saving request received for:", user ? user.username : 'Guest');

  // Handle guest users - get guest info from request body
  let userId, username, guestUsername;
  if (user) {
    userId = user.id;
    username = user.username;
    guestUsername = null;
  } else {
    // For guest users, use NULL for user_id and store guest ID
    const { guestId } = req.body;
    userId = null; // Use NULL to avoid foreign key constraint issues
    guestUsername = guestId || `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    username = guestUsername; // For display purposes
    console.log("Saving guest session with ID:", guestUsername);
  }

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
  let dbGuestUsername; // Will be generated for guests or set to null for registered users
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

  // Generate or reuse guest username based on localStorage guest ID
  console.log("🔍 Processing guest session - dbUserId:", dbUserId, "guestUsername:", guestUsername);
  if (!dbUserId) {
    // Create a guest mapping table in memory for this session
    if (!global.guestMappings) {
      global.guestMappings = new Map();
    }
    
    console.log("📋 Guest username check:", guestUsername, "starts with Guest_?", guestUsername && guestUsername.startsWith('Guest_'));
    // Check if we already have a Guest_X username for this localStorage guest ID  
    if (guestUsername && guestUsername.startsWith('Guest_')) {
      // First check our in-memory mapping
      if (global.guestMappings.has(guestUsername)) {
        dbGuestUsername = global.guestMappings.get(guestUsername);
        console.log("Reusing cached guest username:", dbGuestUsername, "for guest ID:", guestUsername);
        insertGuestSession();
        return;
      }
      
      // Check database for existing mapping by searching for the original guest ID in session_id field
      console.log("Checking database for existing guest ID:", guestUsername);
      db.query(
        "SELECT DISTINCT guest_username FROM game_sessions WHERE session_id LIKE ? AND guest_username REGEXP '^Guest_[0-9]+$' LIMIT 1", 
        [`%|${guestUsername}`],
        (err, existingResults) => {
          console.log("Database query results:", existingResults, "Error:", err);
          if (err) {
            console.error("Error checking existing guest:", err);
            generateNewGuestUsername();
            return;
          }
          
          if (existingResults && existingResults.length > 0) {
            // Reuse existing guest username from database
            dbGuestUsername = existingResults[0].guest_username;
            global.guestMappings.set(guestUsername, dbGuestUsername);
            console.log("✅ Reusing database guest username:", dbGuestUsername, "for guest ID:", guestUsername);
            insertGuestSession();
          } else {
            console.log("❌ No existing guest found, creating new username for:", guestUsername);
            // Generate new guest username for this localStorage guest ID
            generateNewGuestUsername();
          }
        }
      );
    } else {
      // No guest ID provided, generate new one
      generateNewGuestUsername();
    }

    function generateNewGuestUsername() {
      db.query(
        "SELECT MAX(CAST(SUBSTRING_INDEX(guest_username, '_', -1) AS UNSIGNED)) AS max_guest_number FROM game_sessions WHERE guest_username REGEXP '^Guest_[0-9]+$'",
        (err, results) => {
          if (err) {
            console.error("Error fetching max guest number:", err);
            return res.status(500).json({ message: "Failed to generate guest username" });
          }

          const nextGuestNumber = (results[0].max_guest_number || 0) + 1;
          dbGuestUsername = `Guest_${nextGuestNumber}`;
          
          // Store the mapping for future use
          if (guestUsername && guestUsername.startsWith('guest_')) {
            global.guestMappings.set(guestUsername, dbGuestUsername);
          }
          
          console.log("Generated new guest username:", dbGuestUsername, "for guest ID:", guestUsername);
          insertGuestSession();
        }
      );
    }

    function insertGuestSession() {
      // Create a combined session ID that includes the original guest ID for easy searching
      const combinedSessionId = guestUsername ? `${sessionId}|${guestUsername}` : sessionId;

      // Insert the guest session
      db.query(
        "INSERT INTO game_sessions (user_id, guest_username, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [dbUserId, dbGuestUsername, combinedSessionId, durationSeconds, finalScore, dbCoinsCollected, dbObstaclesHit, dbPowerupsCollected, dbDistanceTraveled, dbGameResult],
        (err, result) => {
          if (err) {
            console.error("Database error saving session:", err);
            return res.status(500).json({ message: "Failed to save session" });
          }
          console.log("Session saved successfully with ID:", result.insertId);
          res.json({
            message: "Session saved successfully!",
            sessionId: result.insertId
          });
        }
      );
    }
  } else {
    // Proceed with inserting the session for registered users
    dbGuestUsername = null; // No guest username for registered users
    db.query(
      "INSERT INTO game_sessions (user_id, guest_username, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [dbUserId, dbGuestUsername, sessionId, durationSeconds, finalScore, dbCoinsCollected, dbObstaclesHit, dbPowerupsCollected, dbDistanceTraveled, dbGameResult],
      (err, result) => {
        if (err) {
          console.error("Database error saving session:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        console.log("Session saved successfully with ID:", result.insertId);
        res.json({
          message: "Session saved successfully!",
          sessionId: result.insertId
        });
      }
    );
  }
});

const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static('.'));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));