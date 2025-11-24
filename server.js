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
import { createServer } from 'http';
import { Server } from 'socket.io';

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
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', {
      title: 'Login',
      error: 'Username and password are required'
    });
  }

  try {
    // Find user by username
    db.query("SELECT * FROM users WHERE username = ?", [username], async (err, results) => {
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
          error: 'Invalid username or password'
        });
      }

      const user = results[0];

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.render('login', {
          title: 'Login',
          error: 'Invalid username or password'
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

  // Validate username is one word (no spaces) and no special characters
  if (username.includes(' ') || username.trim() !== username || /\s/.test(username)) {
    return res.render('register', {
      title: 'Register',
      error: 'Username must be one word without spaces'
    });
  }

  // Validate username contains only letters, numbers, and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.render('register', {
      title: 'Register',
      error: 'Username can only contain letters, numbers, and underscores'
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

        // Get user IP address
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || req.ip;

        // Insert new user
        db.query(
          "INSERT INTO users (username, email, password, country, ip_address, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
          [username, email, hashedPassword, country && country.trim() ? country.trim() : null, ip],
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

// Settings page route (requires authentication)
app.get("/settings", checkAuth, (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  // Get current user data from database
  db.query("SELECT * FROM users WHERE id = ?", [req.user.id], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.redirect('/');
    }

    if (results.length === 0) {
      return res.redirect('/login');
    }

    // Handle success and error messages from URL parameters
    let success = req.query.success || null;
    let passwordError = null;
    let emailError = null;
    let payoutError = null;

    if (req.query.error === 'password') {
      passwordError = req.query.msg || 'An error occurred';
    } else if (req.query.error === 'email') {
      emailError = req.query.msg || 'An error occurred';
    } else if (req.query.error === 'payout') {
      payoutError = req.query.msg || 'An error occurred';
    }

    res.render('settings', {
      title: 'Settings',
      user: results[0],
      success: success,
      passwordError: passwordError,
      emailError: emailError,
      payoutError: payoutError
    });
  });
});

// Handle password change
app.post("/settings/password", checkAuth, async (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  // Validation
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.redirect('/settings?error=password&msg=All fields are required');
  }

  if (newPassword !== confirmNewPassword) {
    return res.redirect('/settings?error=password&msg=New passwords do not match');
  }

  if (newPassword.length < 6) {
    return res.redirect('/settings?error=password&msg=Password must be at least 6 characters');
  }

  try {
    // Get current user data
    db.query("SELECT * FROM users WHERE id = ?", [req.user.id], async (err, results) => {
      if (err || results.length === 0) {
        return res.redirect('/settings?error=password&msg=User not found');
      }

      const user = results[0];

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.redirect('/settings?error=password&msg=Current password is incorrect');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password in database
      db.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedNewPassword, req.user.id],
        (err) => {
          if (err) {
            console.error("Database error:", err);
            return res.redirect('/settings?error=password&msg=Failed to update password');
          }

          res.redirect('/settings?success=Password updated successfully');
        }
      );
    });
  } catch (error) {
    console.error("Password change error:", error);
    res.redirect('/settings?error=password&msg=Server error occurred');
  }
});

// Handle email change
app.post("/settings/email", checkAuth, async (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  const { newEmail, password } = req.body;

  // Validation
  if (!newEmail || !password) {
    return res.redirect('/settings?error=email&msg=All fields are required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.redirect('/settings?error=email&msg=Please enter a valid email address');
  }

  try {
    // Get current user data
    db.query("SELECT * FROM users WHERE id = ?", [req.user.id], async (err, results) => {
      if (err || results.length === 0) {
        return res.redirect('/settings?error=email&msg=User not found');
      }

      const user = results[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.redirect('/settings?error=email&msg=Incorrect password');
      }

      // Check if email already exists
      db.query("SELECT * FROM users WHERE email = ? AND id != ?", [newEmail, req.user.id], (err, emailResults) => {
        if (err) {
          return res.redirect('/settings?error=email&msg=Database error occurred');
        }

        if (emailResults.length > 0) {
          return res.redirect('/settings?error=email&msg=Email already exists');
        }

        // Update email in database
        db.query(
          "UPDATE users SET email = ? WHERE id = ?",
          [newEmail, req.user.id],
          (err) => {
            if (err) {
              console.error("Database error:", err);
              return res.redirect('/settings?error=email&msg=Failed to update email');
            }

            res.redirect('/settings?success=Email updated successfully');
          }
        );
      });
    });
  } catch (error) {
    console.error("Email change error:", error);
    res.redirect('/settings?error=email&msg=Server error occurred');
  }
});

// Handle payout settings update
app.post("/settings/payout", checkAuth, (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }

  const { payoutDetails } = req.body;

  // Validation
  if (!payoutDetails || payoutDetails.trim().length < 10) {
    return res.redirect('/settings?error=payout&msg=Please provide detailed payout information');
  }

  // Update payout details in database
  db.query(
    "UPDATE users SET payout_details = ? WHERE id = ?",
    [payoutDetails.trim(), req.user.id],
    (err) => {
      if (err) {
        console.error("Database error:", err);
        return res.redirect('/settings?error=payout&msg=Failed to update payout settings');
      }

      res.redirect('/settings?success=Payout settings updated successfully');
    }
  );
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
  // First get guest mapping
  db.query(
    `SELECT guest_username, 
            ROW_NUMBER() OVER (ORDER BY MIN(created_at)) as guest_number
     FROM game_sessions 
     WHERE guest_username IS NOT NULL 
     GROUP BY guest_username`,
    (err, guestMappings) => {
      if (err) {
        console.error("Database error:", err);
        return res.render('leaderboard', {
          title: 'Game Leaderboard',
          scores: [],
          user: req.user
        });
      }
      
      // Create a mapping object
      const guestMap = {};
      guestMappings.forEach(mapping => {
        guestMap[mapping.guest_username] = mapping.guest_number;
      });
      
      // Now get the main leaderboard query
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
          
          // Transform guest usernames to friendly format
          const transformedResults = results.map(result => {
            if (result.guest_username) {
              // Since guest_username is now stored as simple numbers (1, 2, 3), 
              // display them as just the numbers without Guest_ prefix
              result.username = `Guest ${result.guest_username}`;
            }
            return result;
          });
          
          res.render('leaderboard', {
            title: 'Game Leaderboard',
            scores: transformedResults,
            user: req.user
          });
        }
      );
    }
  );
});

// Winners route - Shows top 3 users of yesterday after Sri Lankan midnight
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

  // Calculate yesterday's date in Sri Lankan timezone (UTC+5:30)
  const now = new Date();
  const sriLankanTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); // Add 5:30 hours
  
  // Always show yesterday's winners (previous day's champions)
  const yesterdayInSriLanka = new Date(sriLankanTime.getTime() - (24 * 60 * 60 * 1000)); // Subtract 24 hours
  const targetDate = yesterdayInSriLanka.toISOString().split('T')[0]; // Yesterday in Sri Lanka
  
  console.log("Current Sri Lankan time:", sriLankanTime.toISOString());
  console.log("Looking for winners from date (yesterday in Sri Lanka):", targetDate);
  
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
            ranked_sessions.user_id
     FROM (
       SELECT 
            u.username as username,
            gs.final_score as score,
            gs.duration_seconds,
            gs.coins_collected,
            gs.obstacles_hit,
            gs.powerups_collected,
            gs.distance_traveled,
            gs.game_result,
            gs.created_at,
            gs.user_id,
            gs.id,
            ROW_NUMBER() OVER (
              PARTITION BY 
                CASE 
                  WHEN gs.user_id IS NOT NULL THEN CONCAT('user_', gs.user_id)
                  ELSE CONCAT('unknown_', gs.id)
                END
              ORDER BY gs.final_score DESC, gs.created_at DESC
            ) as rn
       FROM game_sessions gs
       LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
       WHERE DATE(gs.created_at) = ?
         AND gs.user_id IS NOT NULL
     ) ranked_sessions
     WHERE ranked_sessions.rn = 1
     ORDER BY ranked_sessions.score DESC 
     LIMIT 3`;

  console.log("Executing query with date:", targetDate);
  
  // First, let's check what data exists for debugging
  const debugQuery = "SELECT DATE(created_at) as date_only, user_id, final_score, created_at FROM game_sessions WHERE user_id IS NOT NULL ORDER BY created_at DESC LIMIT 10";
  db.query(debugQuery, (debugErr, debugResults) => {
    console.log("Debug - All sessions:", debugResults);
    
    db.query(query, [targetDate], (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.render('winners', {
          title: 'Game Winners',
          winners: [],
          user: req.user,
          error: 'Failed to load winners data'
        });
      }

      console.log("Winners query results:", results);
      console.log("Number of results:", results.length);

      res.render('winners', {
        title: 'Game Winners',
        winners: results,
        user: req.user,
        error: null
      });
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

// Get active users
app.get("/api/active-users", (req, res) => {
  const users = Array.from(activeUsers.values()).map(user => ({
    username: user.username,
    isGuest: user.isGuest,
    connectedAt: user.connectedAt
  }));
  res.json({
    message: "Active users retrieved successfully",
    activeUsers: users,
    count: users.length
  });
});

// Get all scores (top scores from last 24 hours)
// History route - Shows game history for the logged-in user only
app.get("/history", checkAuth, (req, res) => {
  // If user is not logged in, redirect to login
  if (!req.user) {
    return res.redirect('/login');
  }

  // Get game history for the logged-in user only
  db.query(
    `SELECT 
            u.username,
            gs.session_id,
            gs.id AS game_id,
            gs.final_score,
            gs.duration_seconds,
            gs.coins_collected,
            gs.obstacles_hit,
            gs.powerups_collected,
            gs.distance_traveled,
            gs.game_result,
            gs.created_at
     FROM game_sessions gs
     INNER JOIN users u ON gs.user_id = u.id
     WHERE gs.user_id = ?
     ORDER BY gs.created_at DESC 
     LIMIT 50`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.render('history', {
          title: 'Game History',
          history: [],
          user: req.user,
          error: 'Failed to load game history'
        });
      }
      
      res.render('history', {
        title: 'Game History',
        history: results,
        user: req.user,
        error: null
      });
    }
  );
});

// Get all scores (public) - Shows each user's highest score from last 24 hours
app.get("/api/scores", (req, res) => {
  // First get guest mapping
  db.query(
    `SELECT guest_username, 
            ROW_NUMBER() OVER (ORDER BY MIN(created_at)) as guest_number
     FROM game_sessions 
     WHERE guest_username IS NOT NULL 
     GROUP BY guest_username`,
    (err, guestMappings) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Failed to fetch scores" });
      }
      
      // Create a mapping object
      const guestMap = {};
      guestMappings.forEach(mapping => {
        guestMap[mapping.guest_username] = mapping.guest_number;
      });
      
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
          
         
          const transformedResults = results.map(result => {
            if (result.guest_username && result.guest_username.match(/^\d+$/)) {
              
              result.username = `Guest ${result.guest_username}`;
            }
            return result;
          });
          
          res.json({
            message: "Scores retrieved successfully",
            scores: transformedResults
          });
        }
      );
    }
  );
});
app.get("/api/scores/my", authenticateToken, (req, res) => {
  db.query(
    "SELECT session_id, final_score as score, duration_seconds, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result, created_at FROM game_sessions WHERE user_id = ? ORDER BY final_score DESC",
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

// Scores are now saved through /api/sessions route using game_sessions table

// Rate limiting store
const rateLimitStore = new Map(); // IP -> { count, resetTime }

// Anti-cheat tracking
const userActivityLog = new Map(); // userId -> activity history
const suspiciousPatterns = new Map(); // userId -> suspicious flags

// Rate limiting middleware
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10; // Max 10 session saves per minute per IP

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const userLimit = rateLimitStore.get(ip);

  if (now > userLimit.resetTime) {
    // Reset window
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (userLimit.count >= maxRequests) {
    console.log(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ message: "Too many requests. Please wait before submitting again." });
  }

  userLimit.count++;
  next();
}

// Enhanced validation function for session data with anti-cheat
function validateSessionData(data, userId, ip, guestId = null) {
  const { durationSeconds, finalScore, coinsCollected, obstaclesHit, powerupsCollected, distanceTraveled, gameResult } = data;

  // Check types and basic ranges
  if (typeof durationSeconds !== 'number' || durationSeconds < 0 || durationSeconds > 3600) {
    return "Invalid duration: must be between 0 and 3600 seconds";
  }

  if (typeof finalScore !== 'number' || finalScore < 0 || finalScore > 10000) {
    return "Invalid score: must be between 0 and 10000";
  }

  if (typeof coinsCollected !== 'number' || coinsCollected < 0 || coinsCollected > 10000) {
    return "Invalid coins collected: must be between 0 and 10000";
  }

  if (typeof obstaclesHit !== 'number' || obstaclesHit < 0 || obstaclesHit > 100) {
    return "Invalid obstacles hit: must be between 0 and 100";
  }

  if (typeof powerupsCollected !== 'number' || powerupsCollected < 0 || powerupsCollected > 50) {
    return "Invalid powerups collected: must be between 0 and 50";
  }

  if (typeof distanceTraveled !== 'number' || distanceTraveled < 0 || distanceTraveled > 50000) {
    return "Invalid distance: must be between 0 and 50000";
  }

  if (!['died', 'survived', 'unknown'].includes(gameResult)) {
    return "Invalid game result: must be 'died', 'survived', or 'unknown'";
  }

  // Check for speed hacking FIRST (before distance validation)
  const avgSpeed = distanceTraveled / Math.max(durationSeconds, 1); // pixels per second
  if (avgSpeed > 1000) { // Very high speed - impossible
    return "Game speed appears manipulated";
  }

  // Check for coin farming (coins collected way higher than reasonable)
  const maxReasonableCoins = Math.floor(distanceTraveled / 30); // More generous estimate
  if (coinsCollected > maxReasonableCoins * 3) {
    return "Coin collection appears manipulated";
  }

  // Distance should roughly match duration (game speed is ~7 pixels/frame, 60fps = ~420 pixels/second)
  // But allow for slowdown periods and variable gameplay
  const expectedMinDistance = Math.max(0, durationSeconds * 100); // Much more generous minimum
  const expectedMaxDistance = durationSeconds * 800; // Allow for speed boosts
  if (distanceTraveled < expectedMinDistance) {
    return "Distance traveled seems too low for duration";
  }
  if (distanceTraveled > expectedMaxDistance) {
    return "Distance traveled seems too high for duration";
  }

  // Logical validations
  // Score should be at least coins collected (base) and at most 2x coins (with multiplier)
  if (finalScore < coinsCollected || finalScore > coinsCollected * 2) {
    return "Score must be between coins collected and 2x coins collected";
  }

  // Obstacles hit should be reasonable for distance
  const maxExpectedObstacles = Math.floor(distanceTraveled / 80) + 15; // More generous estimate
  if (obstaclesHit > maxExpectedObstacles) {
    return "Too many obstacles hit for distance traveled";
  }

  // Anti-cheat validations
  const userKey = userId || (guestId ? `guest_${guestId}` : `guest_${ip}`);

  // Track user activity
  if (!userActivityLog.has(userKey)) {
    userActivityLog.set(userKey, []);
  }

  const activityLog = userActivityLog.get(userKey);
  const now = Date.now();

  // Clean old activity (keep last 24 hours)
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const recentActivity = activityLog.filter(entry => entry.timestamp > oneDayAgo);

  // Add current session to activity log
  recentActivity.push({
    timestamp: now,
    score: finalScore,
    duration: durationSeconds,
    coins: coinsCollected,
    obstacles: obstaclesHit,
    distance: distanceTraveled
  });

  // Keep only recent activity
  userActivityLog.set(userKey, recentActivity.slice(-100)); // Keep last 100 sessions

  // Check for suspicious patterns
  if (recentActivity.length >= 3) {
    // Check for perfect games (no obstacles hit but high scores) - more sensitive
    const perfectGames = recentActivity.filter(a => a.obstacles === 0 && a.score > 50).length;
    if (perfectGames >= 2) { // Lower threshold
      return "Too many perfect games detected";
    }

    // Check for impossible score progression (score increasing too fast)
    if (recentActivity.length >= 5) {
      const scores = recentActivity.map(a => a.score).sort((a, b) => b - a);
      const avgTop3 = (scores[0] + scores[1] + scores[2]) / 3;
      const avgRecent = recentActivity.slice(-3).reduce((sum, a) => sum + a.score, 0) / 3;

      if (avgRecent > avgTop3 * 2 && recentActivity.length > 8) {
        // Recent scores are 2x higher than best historical scores - suspicious
        if (!suspiciousPatterns.has(userKey)) {
          suspiciousPatterns.set(userKey, { scoreAnomaly: true, timestamp: now });
        }
        return "Suspicious scoring pattern detected";
      }
    }
  }

  // Check for rapid submissions (possible bot)
  const recentSubmissions = recentActivity.filter(entry => now - entry.timestamp < 60000).length; // Last minute
  if (recentSubmissions > 5) {
    return "Too many rapid submissions detected";
  }

  return null; // No errors
}

// Add a new session (allows guest sessions)
app.post("/api/sessions", rateLimit, async (req, res) => {
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

  // Get client IP for rate limiting and anti-cheat
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || req.ip;

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
    
    // Create a simple in-memory guest mapping for session persistence
    if (!global.guestMapping) {
      global.guestMapping = new Map();
    }
    
    if (guestId) {
      // Check if this guestId already has an assigned number
      if (global.guestMapping.has(guestId)) {
        guestUsername = global.guestMapping.get(guestId);
        console.log(`Returning guest ${guestId} using existing number: ${guestUsername}`);
      } else {
        // New guest - assign next sequential number
        const maxGuestNumber = await new Promise((resolve, reject) => {
          db.query(
            'SELECT MAX(CAST(guest_username AS UNSIGNED)) as max_num FROM game_sessions WHERE guest_username REGEXP "^[0-9]+$"',
            (err, results) => {
              if (err) reject(err);
              else resolve(results[0]?.max_num || 0);
            }
          );
        });
        
        guestUsername = (maxGuestNumber + 1).toString();
        
        // Store the mapping for future sessions
        global.guestMapping.set(guestId, guestUsername);
        console.log(`New guest ${guestId} assigned number: ${guestUsername}`);
      }
    } else {
      // No guestId - generate sequential number
      const maxGuestNumber = await new Promise((resolve, reject) => {
        db.query(
          'SELECT MAX(CAST(guest_username AS UNSIGNED)) as max_num FROM game_sessions WHERE guest_username REGEXP "^[0-9]+$"',
          (err, results) => {
            if (err) reject(err);
            else resolve(results[0]?.max_num || 0);
          }
        );
      });
      guestUsername = (maxGuestNumber + 1).toString();
    }
    
    username = guestUsername; // For display purposes
    console.log("Saving guest session with ID:", guestUsername);
  }

  // Generate a 7-digit session ID
  const generateSessionId = () => Math.floor(1000000 + Math.random() * 9000000).toString();

  const {
    durationSeconds,
    finalScore,
    coinsCollected,
    obstaclesHit,
    powerupsCollected,
    distanceTraveled,
    gameResult
  } = req.body;

  // Enhanced validation with anti-cheat
  const validationError = validateSessionData({
    durationSeconds,
    finalScore,
    coinsCollected,
    obstaclesHit,
    powerupsCollected,
    distanceTraveled,
    gameResult
  }, userId, clientIP, guestId);

  if (validationError) {
    console.log("Session validation failed:", validationError, "User:", userId || 'guest', "IP:", clientIP);
    return res.status(400).json({ message: validationError });
  }

  // Always generate a new 7-digit session ID
  const sessionId = generateSessionId();

  if (!durationSeconds || finalScore === undefined) {
    console.log("Invalid session data:", req.body);
    return res.status(400).json({ message: "Valid session data is required" });
  }

  // Ensure all values are properly set
  const dbUserId = userId; // Allow NULL for guests
  const dbUsername = username || 'Guest';
  const dbGuestUsername = guestUsername; // Store guest username for persistence
  const dbCoinsCollected = coinsCollected || 0;
  const dbObstaclesHit = obstaclesHit || 0;
  const dbPowerupsCollected = powerupsCollected || 0;
  const dbDistanceTraveled = distanceTraveled || 0;
  const dbGameResult = gameResult || 'unknown';

  console.log("Inserting session with values:", {
    userId: dbUserId, guestUsername: dbGuestUsername, sessionId, durationSeconds, finalScore, 
    coinsCollected: dbCoinsCollected, obstaclesHit: dbObstaclesHit, 
    powerupsCollected: dbPowerupsCollected, distanceTraveled: dbDistanceTraveled, 
    gameResult: dbGameResult
  });

  db.query(
    "INSERT INTO game_sessions (user_id, guest_username, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [dbUserId, dbGuestUsername, sessionId, durationSeconds, finalScore, dbCoinsCollected, dbObstaclesHit, dbPowerupsCollected, dbDistanceTraveled, dbGameResult],
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

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server);

// Track active users
const activeUsers = new Map(); // socket.id -> { id, username, isGuest }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When user joins the game
  socket.on('join-game', (userData) => {
    activeUsers.set(socket.id, {
      id: userData.id || 0,
      username: userData.username,
      isGuest: userData.isGuest || false,
      connectedAt: new Date()
    });
    console.log('User joined game:', userData.username);
    // Broadcast updated active users count
    io.emit('active-users-update', Array.from(activeUsers.values()));
  });

  // When user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeUsers.delete(socket.id);
    // Broadcast updated active users count
    io.emit('active-users-update', Array.from(activeUsers.values()));
  });
});

// Serve static files
app.use(express.static('public'));

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Periodic cleanup of rate limiting and activity logs
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  // Clean up old rate limit entries
  for (const [ip, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }

  // Clean up old activity logs and suspicious patterns
  for (const [userKey, activities] of userActivityLog.entries()) {
    const recentActivities = activities.filter(activity => activity.timestamp > oneDayAgo);
    if (recentActivities.length === 0) {
      userActivityLog.delete(userKey);
      suspiciousPatterns.delete(userKey);
    } else {
      userActivityLog.set(userKey, recentActivities);
    }
  }

  console.log(`🧹 Cleanup completed: ${rateLimitStore.size} IPs tracked, ${userActivityLog.size} users monitored`);
}, 30 * 60 * 1000); // Run every 30 minutes