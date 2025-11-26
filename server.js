import express from "express";
import cron from "node-cron";
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

// Scheduled leaderboard reset every 24 hours at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily leaderboard reset...');
  try {
    // Archive leaderboard: snapshot all active competitions before reset
    const today = new Date().toISOString().slice(0, 10);
    // Mark all active competitions as completed (if not already)
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE daily_competitions SET status = 'completed', end_time = NOW() WHERE status = 'active' AND competition_date < ?",
        [today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    // Clear pool_participations for previous days (not today)
    await new Promise((resolve, reject) => {
      db.query(
        `DELETE pp FROM pool_participations pp
         JOIN daily_competitions dc ON pp.competition_id = dc.id
         WHERE dc.competition_date < ?`,
        [today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    console.log('[CRON] Leaderboard reset complete.');
  } catch (err) {
    console.error('[CRON] Error during leaderboard reset:', err);
  }
});
// Scheduled leaderboard reset every 24 hours at midnight Sri Lankan time (Asia/Colombo)
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily leaderboard reset (Asia/Colombo)...');
  try {
    // Archive leaderboard: snapshot all active competitions before reset
    const today = new Date().toISOString().slice(0, 10);
    // Mark all active competitions as completed (if not already)
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE daily_competitions SET status = 'completed', end_time = NOW() WHERE status = 'active' AND competition_date < ?",
        [today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    // Clear pool_participations for previous days (not today)
    await new Promise((resolve, reject) => {
      db.query(
        `DELETE pp FROM pool_participations pp
         JOIN daily_competitions dc ON pp.competition_id = dc.id
         WHERE dc.competition_date < ?`,
        [today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    console.log('[CRON] Leaderboard reset complete.');
  } catch (err) {
    console.error('[CRON] Error during leaderboard reset:', err);
  }
}, { timezone: 'Asia/Colombo' });

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
          "INSERT INTO users (username, email, password, country, ip_address, wallet_balance, total_deposited, total_withdrawn, total_winnings, created_at) VALUES (?, ?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00, NOW())",
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

// Get available pricing pools
app.get("/api/pricing-pools", checkAuth, (req, res) => {
  db.query("SELECT * FROM pricing_pools ORDER BY entry_fee ASC", (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: 'Failed to fetch pricing pools' });
    }
    res.json(results);
  });
});

// Join a pricing pool (pay entry fee)
app.post("/api/join-pool", checkAuth, async (req, res) => {
  const { poolId } = req.body;
  const userId = req.user.id;

  try {
    // Get pool information and user's wallet balance
    const [poolResult, userResult] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query("SELECT * FROM pricing_pools WHERE id = ?", [poolId], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        db.query("SELECT wallet_balance FROM users WHERE id = ?", [userId], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);

    if (poolResult.length === 0) {
      return res.status(400).json({ error: 'Pricing pool not found' });
    }

    if (userResult.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const pool = poolResult[0];
    const user = userResult[0];

    if (user.wallet_balance < pool.entry_fee) {
      return res.status(400).json({ 
        error: `Insufficient balance. Required: $${pool.entry_fee}, Available: $${user.wallet_balance}` 
      });
    }

    // Get today's competition for this pool
    const today = new Date().toISOString().split('T')[0];
    let competitionResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM daily_competitions WHERE pool_id = ? AND competition_date = ?",
        [poolId, today],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    let competitionId;
    if (competitionResult.length === 0) {
      // Create new daily competition
      const insertResult = await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO daily_competitions (pool_id, competition_date, total_participants, total_prize_pool, status) VALUES (?, ?, 0, 0.00, 'active')",
          [poolId, today],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
      competitionId = insertResult.insertId;
    } else {
      competitionId = competitionResult[0].id;
    }

    // Check if user already participated in this competition
    const existingParticipation = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM pool_participations WHERE user_id = ? AND competition_id = ?",
        [userId, competitionId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    if (existingParticipation.length > 0) {
      return res.status(400).json({ error: 'You have already joined this competition today' });
    }

    // Begin transaction
    await new Promise((resolve, reject) => {
      db.query("START TRANSACTION", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      // Deduct entry fee from user's wallet
      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?",
          [pool.entry_fee, userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Record wallet transaction
      await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO wallet_transactions (user_id, transaction_type, amount, description, status) VALUES (?, 'debit', ?, ?, 'completed')",
          [userId, pool.entry_fee, `Entry fee for ${pool.pool_name} pool`],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Create pool participation record
      const participationResult = await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO pool_participations (user_id, pool_id, competition_id, entry_fee_paid, joined_at) VALUES (?, ?, ?, ?, NOW())",
          [userId, poolId, competitionId, pool.entry_fee],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      // Update daily competition totals
      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE daily_competitions SET total_participants = total_participants + 1, total_prize_pool = total_prize_pool + ? WHERE id = ?",
          [pool.entry_fee, competitionId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Commit transaction
      await new Promise((resolve, reject) => {
        db.query("COMMIT", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({ 
        message: 'Successfully joined the competition!',
        participationId: participationResult.insertId,
        competitionId: competitionId
      });

    } catch (error) {
      // Rollback transaction
      await new Promise((resolve, reject) => {
        db.query("ROLLBACK", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      throw error;
    }

  } catch (error) {
    console.error("Error joining pool:", error);
    res.status(500).json({ error: 'Failed to join pool' });
  }
});

// Get user's wallet balance
app.get("/api/wallet/balance", checkAuth, (req, res) => {
  db.query(
    "SELECT wallet_balance, total_deposited, total_withdrawn, total_winnings FROM users WHERE id = ?",
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch balance' });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(results[0]);
    }
  );
});

// Get user's current pool participation for today
app.get("/api/my-participation", checkAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  db.query(
    `SELECT pp.*, pp.id as participation_id, dc.competition_date, pr.pool_name as pool_name, pr.entry_fee
     FROM pool_participations pp
     JOIN daily_competitions dc ON pp.competition_id = dc.id
     JOIN pricing_pools pr ON dc.pool_id = pr.id
     WHERE pp.user_id = ? AND dc.competition_date = ?`,
    [req.user.id, today],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch participation' });
      }
      res.json(results);
    }
  );
});

// Get wallet transaction history
app.get("/api/wallet/transactions", checkAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  db.query(
    `SELECT * FROM wallet_transactions 
     WHERE user_id = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch transactions' });
      }
      res.json(results);
    }
  );
});

// Request withdrawal
app.post("/api/wallet/withdraw", checkAuth, async (req, res) => {
  const { amount, paymentMethodId } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!paymentMethodId) {
    return res.status(400).json({ error: 'Payment method is required' });
  }

  try {
    // Check user's balance
    const userResult = await new Promise((resolve, reject) => {
      db.query("SELECT wallet_balance FROM users WHERE id = ?", [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (userResult.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult[0];
    if (user.wallet_balance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. Available: $${user.wallet_balance}` 
      });
    }

    // Verify payment method belongs to user
    const paymentMethodResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM payment_methods WHERE id = ? AND user_id = ?",
        [paymentMethodId, userId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    if (paymentMethodResult.length === 0) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Begin transaction
    await new Promise((resolve, reject) => {
      db.query("START TRANSACTION", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    try {
      // Create withdrawal request
      const withdrawalResult = await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO withdrawal_requests (user_id, amount, payment_method_id, status) VALUES (?, ?, ?, 'pending')",
          [userId, amount, paymentMethodId],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      // Deduct from user's wallet (hold the amount)
      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?",
          [amount, userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Record wallet transaction
      await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO wallet_transactions (user_id, transaction_type, amount, description, status, withdrawal_request_id) VALUES (?, 'debit', ?, 'Withdrawal request', 'pending', ?)",
          [userId, amount, withdrawalResult.insertId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Commit transaction
      await new Promise((resolve, reject) => {
        db.query("COMMIT", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({ 
        message: 'Withdrawal request submitted successfully',
        withdrawalId: withdrawalResult.insertId
      });

    } catch (error) {
      // Rollback transaction
      await new Promise((resolve, reject) => {
        db.query("ROLLBACK", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      throw error;
    }

  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Add payment method
app.post("/api/payment-methods", checkAuth, (req, res) => {
  const { type, details, isDefault } = req.body;
  const userId = req.user.id;

  if (!type || !details) {
    return res.status(400).json({ error: 'Type and details are required' });
  }

  db.query(
    "INSERT INTO payment_methods (user_id, type, details, is_default) VALUES (?, ?, ?, ?)",
    [userId, type, JSON.stringify(details), isDefault || false],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to add payment method' });
      }

      // If this is set as default, update other methods
      if (isDefault) {
        db.query(
          "UPDATE payment_methods SET is_default = FALSE WHERE user_id = ? AND id != ?",
          [userId, result.insertId],
          (err) => {
            if (err) console.error("Failed to update other payment methods:", err);
          }
        );
      }

      res.json({ 
        message: 'Payment method added successfully',
        paymentMethodId: result.insertId
      });
    }
  );
});

// Get user's payment methods
app.get("/api/payment-methods", checkAuth, (req, res) => {
  db.query(
    "SELECT id, type, details, is_default, created_at FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC",
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch payment methods' });
      }
      
      // Parse details JSON for each method
      const parsedResults = results.map(method => ({
        ...method,
        details: JSON.parse(method.details)
      }));
      
      res.json(parsedResults);
    }
  );
});

// ===== PRICING POOL API ENDPOINTS =====

// Get all available pricing pools
app.get("/api/pricing-pools", (req, res) => {
  db.query(
    "SELECT id, pool_name, entry_fee, is_active FROM pricing_pools WHERE is_active = 1 ORDER BY entry_fee ASC",
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch pricing pools' });
      }
      res.json(results);
    }
  );
});

// Get pricing pool details with current competition stats
app.get("/api/pricing-pools/:poolId", (req, res) => {
  const { poolId } = req.params;
  const today = new Date().toISOString().split('T')[0];
  
  db.query(
    `SELECT 
      pp.*,
      dc.id as competition_id,
      dc.total_participants,
      dc.total_prize_pool,
      dc.status as competition_status
     FROM pricing_pools pp
     LEFT JOIN daily_competitions dc ON pp.id = dc.pool_id AND dc.competition_date = ?
     WHERE pp.id = ? AND pp.is_active = 1`,
    [today, poolId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch pool details' });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      
      const pool = results[0];
      pool.estimated_winners = Math.floor(pool.total_participants / 2);
      pool.prize_per_winner = pool.total_participants > 0 ? 
        (pool.total_prize_pool / Math.max(1, Math.floor(pool.total_participants / 2))).toFixed(2) : 0;
      
      res.json(pool);
    }
  );
});

// Join a pricing pool (pay entry fee)
app.post("/api/pricing-pools/:poolId/join", checkAuth, async (req, res) => {
  const { poolId } = req.params;
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    // Start transaction
    await new Promise((resolve, reject) => {
      db.query("START TRANSACTION", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get pool information
    const pool = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM pricing_pools WHERE id = ? AND is_active = 1",
        [poolId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (!pool) {
      await new Promise((resolve) => db.query("ROLLBACK", resolve));
      return res.status(404).json({ error: 'Pool not found or inactive' });
    }

    // Check user's wallet balance
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT wallet_balance FROM users WHERE id = ?",
        [userId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (user.wallet_balance < pool.entry_fee) {
      await new Promise((resolve) => db.query("ROLLBACK", resolve));
      return res.status(400).json({ 
        error: `Insufficient balance. Required: $${pool.entry_fee}, Available: $${user.wallet_balance}` 
      });
    }

    // Get or create today's competition for this pool
    let competition = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM daily_competitions WHERE pool_id = ? AND competition_date = ?",
        [poolId, today],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (!competition) {
      // Create new daily competition
      const competitionResult = await new Promise((resolve, reject) => {
        db.query(
          "INSERT INTO daily_competitions (pool_id, competition_date, total_participants, total_prize_pool, status) VALUES (?, ?, 0, 0.00, 'active')",
          [poolId, today],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
      
      competition = {
        id: competitionResult.insertId,
        pool_id: poolId,
        competition_date: today,
        total_participants: 0,
        total_prize_pool: 0,
        status: 'active'
      };
    }

    // Check if user already joined this competition
    const existingParticipation = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM pool_participations WHERE user_id = ? AND competition_id = ?",
        [userId, competition.id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (existingParticipation) {
      await new Promise((resolve) => db.query("ROLLBACK", resolve));
      return res.status(400).json({ error: 'You have already joined this pool today' });
    }

    // Deduct entry fee from user's wallet
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?",
        [pool.entry_fee, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Record wallet transaction
    await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_before, balance_after, pool_id, status, notes) VALUES (?, 'pool_entry', ?, ?, ?, ?, 'completed', ?)",
        [userId, pool.entry_fee, user.wallet_balance, user.wallet_balance - pool.entry_fee, poolId, `Entry fee for ${pool.pool_name}`],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Create pool participation record
    const participationResult = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO pool_participations (user_id, pool_id, competition_id, entry_fee_paid, joined_at) VALUES (?, ?, ?, ?, NOW())",
        [userId, poolId, competition.id, pool.entry_fee],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    // Update daily competition totals
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE daily_competitions SET total_participants = total_participants + 1, total_prize_pool = total_prize_pool + ? WHERE id = ?",
        [pool.entry_fee, competition.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Commit transaction
    await new Promise((resolve, reject) => {
      db.query("COMMIT", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ 
      success: true,
      message: `Successfully joined ${pool.pool_name}!`,
      participationId: participationResult.insertId,
      competitionId: competition.id,
      remainingBalance: user.wallet_balance - pool.entry_fee
    });

  } catch (error) {
    console.error("Error joining pool:", error);
    await new Promise((resolve) => db.query("ROLLBACK", resolve));
    res.status(500).json({ error: 'Failed to join pool' });
  }
});

// Get user's current pool participations for today
app.get("/api/my-pools", checkAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  db.query(
    `SELECT 
      pp.*, 
      dc.competition_date,
      pr.pool_name,
      pr.entry_fee,
      pp.rank,
      pp.is_winner,
      pp.prize_amount
     FROM pool_participations pp
     JOIN daily_competitions dc ON pp.competition_id = dc.id
     JOIN pricing_pools pr ON dc.pool_id = pr.id
     WHERE pp.user_id = ? AND dc.competition_date = ?
     ORDER BY pr.entry_fee DESC`,
    [req.user.id, today],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch participations' });
      }
      res.json(results);
    }
  );
});

// Get leaderboard for a specific pool competition
app.get("/api/pricing-pools/:poolId/leaderboard", (req, res) => {
  const { poolId } = req.params;
  const today = new Date().toISOString().split('T')[0];
  
  db.query(
    `SELECT 
      pp.user_id,
      u.username,
      pp.best_score,
      pp.rank,
      pp.is_winner,
      pp.prize_amount,
      pp.joined_at
     FROM pool_participations pp
     JOIN users u ON pp.user_id = u.id
     JOIN daily_competitions dc ON pp.competition_id = dc.id
     WHERE dc.pool_id = ? AND dc.competition_date = ?
     ORDER BY pp.best_score DESC, pp.joined_at ASC
     LIMIT 50`,
    [poolId, today],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
      res.json(results);
    }
  );
});

// Deposit money to wallet
app.post("/api/wallet/deposit", checkAuth, async (req, res) => {
  const { amount, paymentMethod, paymentReference } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (amount < 5) {
    return res.status(400).json({ error: 'Minimum deposit amount is $5' });
  }

  try {
    // Start transaction
    await new Promise((resolve, reject) => {
      db.query("START TRANSACTION", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get current balance
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT wallet_balance, total_deposited FROM users WHERE id = ?",
        [userId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    // Update user balance and deposit total
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE users SET wallet_balance = wallet_balance + ?, total_deposited = total_deposited + ? WHERE id = ?",
        [amount, amount, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Record transaction
    await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_before, balance_after, payment_method, payment_reference, status, notes) VALUES (?, 'deposit', ?, ?, ?, ?, ?, 'completed', 'Wallet deposit')",
        [userId, amount, user.wallet_balance, user.wallet_balance + amount, paymentMethod || 'manual', paymentReference || null],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Commit transaction
    await new Promise((resolve, reject) => {
      db.query("COMMIT", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ 
      success: true,
      message: 'Deposit successful',
      newBalance: user.wallet_balance + amount,
      depositAmount: amount
    });

  } catch (error) {
    console.error("Error processing deposit:", error);
    await new Promise((resolve) => db.query("ROLLBACK", resolve));
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

// Request withdrawal
app.post("/api/wallet/withdraw", checkAuth, async (req, res) => {
  const { amount, withdrawalMethod, withdrawalDetails } = req.body;
  const userId = req.user.id;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (amount < 10) {
    return res.status(400).json({ error: 'Minimum withdrawal amount is $10' });
  }

  if (!withdrawalMethod || !withdrawalDetails) {
    return res.status(400).json({ error: 'Withdrawal method and details are required' });
  }

  try {
    // Check user's balance
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT wallet_balance FROM users WHERE id = ?",
        [userId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results[0]);
        }
      );
    });

    if (user.wallet_balance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. Available: $${user.wallet_balance}` 
      });
    }

    // Create withdrawal request (pending admin approval)
    const withdrawalResult = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO withdrawal_requests (user_id, amount, withdrawal_method, withdrawal_details, status) VALUES (?, ?, ?, ?, 'pending')",
        [userId, amount, withdrawalMethod, withdrawalDetails],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.json({ 
      success: true,
      message: 'Withdrawal request submitted successfully. It will be processed within 24 hours.',
      withdrawalId: withdrawalResult.insertId,
      requestedAmount: amount
    });

  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ error: 'Failed to process withdrawal request' });
  }
});

// Get wallet balance and transaction history
app.get("/api/wallet", checkAuth, (req, res) => {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  // Get wallet balance
  db.query(
    "SELECT wallet_balance, total_deposited, total_withdrawn, total_winnings FROM users WHERE id = ?",
    [userId],
    (err, balanceResults) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch balance' });
      }

      if (balanceResults.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get transaction history
      db.query(
        `SELECT * FROM wallet_transactions 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
        (err, transactions) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
          }

          res.json({
            balance: balanceResults[0],
            transactions: transactions
          });
        }
      );
    }
  );
});

// Daily Winner Calculation System - Calculate daily winners at midnight
app.post("/api/admin/calculate-winners", async (req, res) => {
  const targetDate = req.body.date || new Date().toISOString().split('T')[0];
  
  try {
    console.log(`Starting winner calculation for date: ${targetDate}`);
    
    // Get all active competitions for the target date
    const competitions = await new Promise((resolve, reject) => {
      db.query(
        `SELECT dc.*, pp.pool_name 
         FROM daily_competitions dc
         JOIN pricing_pools pp ON dc.pool_id = pp.id
         WHERE dc.competition_date = ? AND dc.status = 'active' AND dc.total_participants > 0
         ORDER BY pp.entry_fee DESC`,
        [targetDate],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    const results = [];

    for (const competition of competitions) {
      console.log(`Processing competition: ${competition.pool_name} (${competition.total_participants} participants)`);
      
      // Start transaction for this competition
      await new Promise((resolve, reject) => {
        db.query("START TRANSACTION", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      try {
        // Get all participants ordered by their best score
        const participants = await new Promise((resolve, reject) => {
          db.query(
            `SELECT pp.*, u.username
             FROM pool_participations pp
             JOIN users u ON pp.user_id = u.id
             WHERE pp.competition_id = ?
             ORDER BY pp.best_score DESC, pp.joined_at ASC`,
            [competition.id],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        // Calculate winners (top 50%)
        const totalParticipants = participants.length;
        const winnersCount = Math.floor(totalParticipants / 2);
        const totalPrizePool = competition.total_prize_pool;
        const prizePerWinner = winnersCount > 0 ? totalPrizePool / winnersCount : 0;

        console.log(`  - Total participants: ${totalParticipants}`);
        console.log(`  - Winners: ${winnersCount}`);
        console.log(`  - Prize pool: $${totalPrizePool}`);
        console.log(`  - Prize per winner: $${prizePerWinner.toFixed(2)}`);

        // Update winners
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          const isWinner = i < winnersCount;
          const rank = i + 1;
          const prizeAmount = isWinner ? prizePerWinner : 0;

          // Update participant record
          await new Promise((resolve, reject) => {
            db.query(
              "UPDATE pool_participations SET rank = ?, is_winner = ?, prize_amount = ?, prize_paid = ? WHERE id = ?",
              [rank, isWinner, prizeAmount, isWinner, participant.id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          if (isWinner && prizeAmount > 0) {
            // Get current user balance
            const user = await new Promise((resolve, reject) => {
              db.query(
                "SELECT wallet_balance, total_winnings FROM users WHERE id = ?",
                [participant.user_id],
                (err, results) => {
                  if (err) reject(err);
                  else resolve(results[0]);
                }
              );
            });

            // Add prize to user's wallet
            await new Promise((resolve, reject) => {
              db.query(
                "UPDATE users SET wallet_balance = wallet_balance + ?, total_winnings = total_winnings + ? WHERE id = ?",
                [prizeAmount, prizeAmount, participant.user_id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            // Record prize transaction
            await new Promise((resolve, reject) => {
              db.query(
                "INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_before, balance_after, pool_id, pool_participation_id, status, notes) VALUES (?, 'prize_credit', ?, ?, ?, ?, ?, 'completed', ?)",
                [participant.user_id, prizeAmount, user.wallet_balance, user.wallet_balance + prizeAmount, competition.pool_id, participant.id, `Prize from ${competition.pool_name} - Rank ${rank}`],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }

        // Save leaderboard snapshot before completing competition
        for (let i = 0; i < participants.length; i++) {
          const participant = participants[i];
          const isWinner = i < winnersCount;
          const rank = i + 1;
          const prizeAmount = isWinner ? prizePerWinner : 0;

          await new Promise((resolve, reject) => {
            db.query(
              "INSERT INTO leaderboard_snapshots (competition_id, user_id, username, final_rank, best_score, is_winner, prize_amount, snapshot_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [competition.id, participant.user_id, participant.username, rank, participant.best_score, isWinner, prizeAmount, targetDate],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Update competition status
        await new Promise((resolve, reject) => {
          db.query(
            "UPDATE daily_competitions SET status = 'completed', winners_count = ?, total_prize_distributed = ?, winners_calculated_at = NOW() WHERE id = ?",
            [winnersCount, winnersCount * prizePerWinner, competition.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        // Commit transaction
        await new Promise((resolve, reject) => {
          db.query("COMMIT", (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        results.push({
          competitionId: competition.id,
          poolName: competition.pool_name,
          totalParticipants,
          winnersCount,
          prizePool: totalPrizePool,
          prizePerWinner: prizePerWinner.toFixed(2),
          status: 'completed'
        });

      } catch (error) {
        console.error(`Error processing competition ${competition.id}:`, error);
        await new Promise((resolve) => db.query("ROLLBACK", resolve));
        
        results.push({
          competitionId: competition.id,
          poolName: competition.pool_name,
          status: 'failed',
          error: error.message
        });
      }
    }

    console.log('Winner calculation completed');
    res.json({
      success: true,
      message: `Winner calculation completed for ${targetDate}`,
      processedCompetitions: results.length,
      results: results
    });

  } catch (error) {
    console.error("Error calculating winners:", error);
    res.status(500).json({ error: 'Failed to calculate winners' });
  }
});

// Get competition results for a specific date
app.get("/api/competitions/:date/results", (req, res) => {
  const { date } = req.params;
  
  db.query(
    `SELECT 
      dc.*,
      pp.pool_name,
      pp.entry_fee,
      COUNT(part.id) as total_participants,
      SUM(CASE WHEN part.is_winner = 1 THEN 1 ELSE 0 END) as actual_winners
     FROM daily_competitions dc
     JOIN pricing_pools pp ON dc.pool_id = pp.id
     LEFT JOIN pool_participations part ON dc.id = part.competition_id
     WHERE dc.competition_date = ?
     GROUP BY dc.id
     ORDER BY pp.entry_fee DESC`,
    [date],
    (err, competitions) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: 'Failed to fetch competition results' });
      }

      // Get detailed results for each competition
      const detailedResults = competitions.map(comp => {
        return new Promise((resolve, reject) => {
          db.query(
            `SELECT 
              part.rank,
              part.best_score,
              part.is_winner,
              part.prize_amount,
              u.username
             FROM pool_participations part
             JOIN users u ON part.user_id = u.id
             WHERE part.competition_id = ?
             ORDER BY part.rank ASC
             LIMIT 10`,
            [comp.id],
            (err, participants) => {
              if (err) reject(err);
              else resolve({
                ...comp,
                top_participants: participants
              });
            }
          );
        });
      });

      Promise.all(detailedResults)
        .then(results => res.json(results))
        .catch(error => {
          console.error("Error fetching detailed results:", error);
          res.status(500).json({ error: 'Failed to fetch detailed results' });
        });
    }
  );
});

// Get historical leaderboard snapshots for a specific date (all pools)
app.get("/api/leaderboard-snapshots/:date", (req, res) => {
  const { date } = req.params;
  
  let query = `
    SELECT 
      ls.*,
      pp.pool_name,
      pp.entry_fee,
      dc.total_participants,
      dc.total_prize_distributed
    FROM leaderboard_snapshots ls
    JOIN daily_competitions dc ON ls.competition_id = dc.id
    JOIN pricing_pools pp ON dc.pool_id = pp.id
    WHERE ls.snapshot_date = ?
    ORDER BY pp.entry_fee DESC, ls.final_rank ASC
  `;
  
  db.query(query, [date], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: 'Failed to fetch leaderboard snapshots' });
    }
    
    // Group results by pool
    const groupedResults = results.reduce((acc, row) => {
      const poolKey = `${row.pool_name} ($${row.entry_fee})`;
      if (!acc[poolKey]) {
        acc[poolKey] = {
          pool_info: {
            pool_name: row.pool_name,
            entry_fee: row.entry_fee,
            total_participants: row.total_participants,
            total_prize_distributed: row.total_prize_distributed
          },
          participants: []
        };
      }
      acc[poolKey].participants.push({
        username: row.username,
        final_rank: row.final_rank,
        best_score: row.best_score,
        is_winner: row.is_winner,
        prize_amount: row.prize_amount
      });
      return acc;
    }, {});
    
    res.json(groupedResults);
  });
});

// Get historical leaderboard snapshots for a specific date and pool
app.get("/api/leaderboard-snapshots/:date/:poolId", (req, res) => {
  const { date, poolId } = req.params;
  
  let query = `
    SELECT 
      ls.*,
      pp.pool_name,
      pp.entry_fee,
      dc.total_participants,
      dc.total_prize_distributed
    FROM leaderboard_snapshots ls
    JOIN daily_competitions dc ON ls.competition_id = dc.id
    JOIN pricing_pools pp ON dc.pool_id = pp.id
    WHERE ls.snapshot_date = ? AND dc.pool_id = ?
    ORDER BY ls.final_rank ASC
  `;
  
  db.query(query, [date, poolId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: 'Failed to fetch leaderboard snapshots' });
    }
    
    res.json(results);
  });
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
app.get("/leaderboard", checkAuth, async (req, res) => {
  const poolId = req.query.pool; // Optional pool filter
  
  try {
    // Get available pools for the dropdown
    const pools = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM pricing_pools ORDER BY entry_fee ASC", (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // First get guest mapping
    const guestMappings = await new Promise((resolve, reject) => {
      db.query(
        `SELECT guest_username, 
                ROW_NUMBER() OVER (ORDER BY MIN(created_at)) as guest_number
         FROM game_sessions 
         WHERE guest_username IS NOT NULL 
         GROUP BY guest_username`,
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });
    
    // Create a mapping object
    const guestMap = {};
    guestMappings.forEach(mapping => {
      guestMap[mapping.guest_username] = mapping.guest_number;
    });

    // Build leaderboard query with optional pool filter
    let leaderboardQuery;
    let queryParams;

    if (poolId) {
      // Filter by specific pool
      leaderboardQuery = `
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
          ranked_sessions.guest_username,
          ranked_sessions.pool_name,
          ranked_sessions.entry_fee
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
            pr.pool_name as pool_name,
            pr.entry_fee,
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
          LEFT JOIN pool_participations pp ON gs.pool_participation_id = pp.id
          LEFT JOIN daily_competitions dc ON pp.competition_id = dc.id
          LEFT JOIN pricing_pools pr ON dc.pool_id = pr.id
          WHERE gs.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            AND dc.pool_id = ?
        ) ranked_sessions
        WHERE ranked_sessions.rn = 1
        ORDER BY ranked_sessions.score DESC 
        LIMIT 20`;
      queryParams = [poolId];
    } else {
      // Show free games (sessions without pool participation)
      leaderboardQuery = `
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
          ranked_sessions.guest_username,
          'Free Play' as pool_name,
          0 as entry_fee
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
            AND gs.pool_participation_id IS NULL
        ) ranked_sessions
        WHERE ranked_sessions.rn = 1
        ORDER BY ranked_sessions.score DESC 
        LIMIT 20`;
      queryParams = [];
    }

    const results = await new Promise((resolve, reject) => {
      db.query(leaderboardQuery, queryParams, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Transform guest usernames to friendly format
    const transformedResults = results.map(result => {
      if (result.guest_username) {
        result.username = `Guest ${result.guest_username}`;
      }
      return result;
    });

    const selectedPool = poolId ? pools.find(p => p.id == poolId) : null;

    res.render('leaderboard', {
      title: 'Game Leaderboard',
      scores: transformedResults,
      user: req.user,
      pools: pools,
      selectedPool: selectedPool,
      currentPoolId: poolId
    });

  } catch (error) {
    console.error("Database error:", error);
    res.render('leaderboard', {
      title: 'Game Leaderboard',
      scores: [],
      user: req.user,
      pools: [],
      selectedPool: null,
      currentPoolId: null
    });
  }
});

// Winners route - Shows top 3 users of yesterday after Sri Lankan midnight
app.get("/winners", checkAuth, async (req, res) => {
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

  try {
    // Get completed competitions from yesterday
    const competitions = await new Promise((resolve, reject) => {
      db.query(
        `SELECT dc.*, pr.pool_name as pool_name, pr.entry_fee
         FROM daily_competitions dc
         JOIN pricing_pools pr ON dc.pool_id = pr.id
         WHERE dc.competition_date = ? AND dc.status = 'completed'
         ORDER BY pr.entry_fee DESC`,
        [targetDate],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    // Get winners for each completed competition
    const winnersData = await Promise.all(
      competitions.map(async (competition) => {
        const winners = await new Promise((resolve, reject) => {
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
                    ranked_sessions.winnings
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
                    pp.prize_amount as winnings,
                    gs.id,
                    ROW_NUMBER() OVER (
                      PARTITION BY pp.user_id
                      ORDER BY gs.final_score DESC, gs.created_at DESC
                    ) as rn
               FROM game_sessions gs
               JOIN pool_participations pp ON gs.pool_participation_id = pp.id
               JOIN users u ON pp.user_id = u.id
               WHERE pp.competition_id = ? AND pp.prize_amount > 0
             ) ranked_sessions
             WHERE ranked_sessions.rn = 1
             ORDER BY ranked_sessions.score DESC`,
            [competition.id],
            (err, results) => {
              if (err) reject(err);
              else resolve(results);
            }
          );
        });

        return {
          competition: competition,
          winners: winners
        };
      })
    );

    // Also get free game winners (non-pool games)
    const freeGameWinners = await new Promise((resolve, reject) => {
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
                  PARTITION BY gs.user_id
                  ORDER BY gs.final_score DESC, gs.created_at DESC
                ) as rn
           FROM game_sessions gs
           LEFT JOIN users u ON gs.user_id = u.id AND gs.user_id IS NOT NULL
           WHERE DATE(gs.created_at) = ?
             AND gs.user_id IS NOT NULL
             AND gs.pool_participation_id IS NULL
         ) ranked_sessions
         WHERE ranked_sessions.rn = 1
         ORDER BY ranked_sessions.score DESC 
         LIMIT 3`,
        [targetDate],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    res.render('winners', {
      title: 'Game Winners',
      competitionWinners: winnersData,
      freeGameWinners: freeGameWinners,
      winners: freeGameWinners, // Add this for template compatibility
      targetDate: targetDate,
      user: req.user,
      error: null
    });

  } catch (error) {
    console.error("Database error:", error);
    res.render('winners', {
      title: 'Game Winners',
      competitionWinners: [],
      freeGameWinners: [],
      winners: [], // Add this for template compatibility
      targetDate: targetDate,
      user: req.user,
      error: 'Failed to load winners data'
    });
  }
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
// History route - Shows game history for the logged-in user
app.get("/history", checkAuth, async (req, res) => {
  // If user is not logged in, redirect to login
  if (!req.user) {
    return res.redirect('/login');
  }

  try {
    // Fetch game history for the logged-in user with additional details
    const gameHistory = await new Promise((resolve, reject) => {
      db.query(
        `SELECT 
          gs.id,
          gs.session_id,
          gs.final_score,
          gs.duration_seconds,
          gs.coins_collected,
          gs.obstacles_hit,
          gs.powerups_collected,
          gs.distance_traveled,
          gs.game_result,
          gs.created_at,
          COALESCE(pr.pool_name, 'Free Play') as pool_name,
          COALESCE(pr.entry_fee, 0) as entry_fee
         FROM game_sessions gs
         LEFT JOIN pool_participations pp ON gs.pool_participation_id = pp.id
         LEFT JOIN daily_competitions dc ON pp.competition_id = dc.id
         LEFT JOIN pricing_pools pr ON dc.pool_id = pr.id
         WHERE gs.user_id = ?
         ORDER BY gs.created_at DESC
         LIMIT 50`,
        [req.user.id],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    res.render('history', {
      title: `Game History - ${req.user.username}`,
      history: gameHistory,
      user: req.user,
      error: null
    });

  } catch (error) {
    console.error("Database error in history route:", error);
    res.render('history', {
      title: 'Game History',
      history: [],
      user: req.user,
      error: 'Failed to load history data'
    });
  }
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

// Add a new session (allows guest sessions)
app.post("/api/sessions", async (req, res) => {
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
    gameResult,
    poolParticipationId,
    tamperingDetected
  } = req.body;

  // Check for tampering detection
  if (tamperingDetected) {
    console.log("Tampering detected in client-side code - rejecting session");
    return res.status(400).json({ 
      message: "Session rejected: Client-side tampering detected. Please refresh the page and play legitimately.",
      error: "tampering_detected"
    });
  }

  // Always generate a new 7-digit session ID
  const sessionId = generateSessionId();

  // Validation temporarily disabled
  /*
  // Enhanced validation to prevent cheating
  const validationErrors = [];

  // Basic validation
  if (typeof finalScore !== 'number' || finalScore < 0 || finalScore > 100000) {
    validationErrors.push('Invalid score: must be a number between 0 and 100,000');
  }

  if (typeof coinsCollected !== 'number' || coinsCollected < 0 || coinsCollected > 10000) {
    validationErrors.push('Invalid coins collected: must be between 0 and 10,000');
  }

  if (typeof durationSeconds !== 'number' || durationSeconds < 0 || durationSeconds > 3600) {
    validationErrors.push('Invalid duration: must be between 0 and 3,600 seconds');
  }

  if (typeof distanceTraveled !== 'number' || distanceTraveled < 0 || distanceTraveled > 1000000) {
    validationErrors.push('Invalid distance: must be between 0 and 1,000,000');
  }

  // Score validation: score should equal coins collected (or up to 2x with power-ups)
  const maxPossibleScore = (coinsCollected || 0) * 2;
  if (finalScore > maxPossibleScore) {
    validationErrors.push(`Score (${finalScore}) exceeds maximum possible (${maxPossibleScore}) based on coins collected`);
  }

  // Minimum score validation: score should be at least coins collected
  if (finalScore < (coinsCollected || 0)) {
    validationErrors.push(`Score (${finalScore}) cannot be less than coins collected (${coinsCollected || 0})`);
  }

  // Distance validation: distance should be proportional to duration (game speed ~7 pixels/frame, 60 FPS)
  const minExpectedDistance = durationSeconds * 200; // Minimum reasonable distance
  const maxExpectedDistance = durationSeconds * 600; // Maximum reasonable distance (with speed boosts)
  if (distanceTraveled < minExpectedDistance && durationSeconds > 10) {
    validationErrors.push(`Distance traveled (${distanceTraveled}) is too low for duration (${durationSeconds}s)`);
  }
  if (distanceTraveled > maxExpectedDistance) {
    validationErrors.push(`Distance traveled (${distanceTraveled}) exceeds maximum reasonable distance (${maxExpectedDistance}) for duration`);
  }

  // Score progression validation: score should be proportional to distance
  const expectedScoreFromDistance = Math.floor(distanceTraveled / 10); // Roughly 1 point per 10 pixels
  if (finalScore > expectedScoreFromDistance * 3) { // Allow 3x multiplier for power-ups
    validationErrors.push(`Score (${finalScore}) is unreasonably high for distance traveled (${distanceTraveled})`);
  }

  // Duration validation: prevent instant completion with high scores
  if (durationSeconds < 30 && finalScore > 500) {
    validationErrors.push(`Score (${finalScore}) is too high for short game duration (${durationSeconds}s)`);
  }

  // Coins per second validation
  const coinsPerSecond = durationSeconds > 0 ? (coinsCollected || 0) / durationSeconds : 0;
  if (coinsPerSecond > 8) { // Maximum 8 coins per second (very generous)
    validationErrors.push(`Coin collection rate (${coinsPerSecond.toFixed(2)}/s) exceeds maximum reasonable rate`);
  }

  // Obstacles hit validation: shouldn't be too many for short games
  const obstaclesPerSecond = durationSeconds > 0 ? (obstaclesHit || 0) / durationSeconds : 0;
  if (obstaclesPerSecond > 3) { // Maximum 3 obstacles per second
    validationErrors.push(`Obstacle hit rate (${obstaclesPerSecond.toFixed(2)}/s) exceeds maximum reasonable rate`);
  }

  // Power-ups validation: shouldn't be too many
  if ((powerupsCollected || 0) > 20) {
    validationErrors.push('Power-ups collected exceeds maximum reasonable amount');
  }

  // Cross-validation: if many obstacles hit, score should be lower
  if ((obstaclesHit || 0) > 10 && finalScore > 1000) {
    validationErrors.push('Score is suspiciously high given the number of obstacles hit');
  }

  // Check for suspicious patterns (all metrics at maximum)
  const suspiciousFlags = [
    finalScore > 50000,
    coinsCollected > 5000,
    distanceTraveled > 500000,
    durationSeconds < 60 && finalScore > 2000
  ].filter(Boolean).length;

  if (suspiciousFlags >= 3) {
    validationErrors.push('Multiple suspicious metrics detected - possible cheating');
  }

  if (validationErrors.length > 0) {
    console.log("Session validation failed:", validationErrors);
    return res.status(400).json({ 
      message: "Invalid session data: " + validationErrors.join(', '),
      errors: validationErrors
    });
  }
  */

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
    "INSERT INTO game_sessions (user_id, guest_username, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result, pool_participation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [dbUserId, dbGuestUsername, sessionId, durationSeconds, finalScore, dbCoinsCollected, dbObstaclesHit, dbPowerupsCollected, dbDistanceTraveled, dbGameResult, poolParticipationId || null],
    async (err, result) => {
      if (err) {
        console.error("Database error saving session:", err);
        console.error("Error details:", err.message);
        return res.status(500).json({ message: "Failed to save session: " + err.message });
      }
      
      console.log("Session saved successfully with ID:", result.insertId);
      
      // If this session is linked to a pool participation, update the best score if this is better
      if (poolParticipationId && dbUserId && finalScore > 0) {
        try {
          await new Promise((resolve, reject) => {
            db.query(
              "UPDATE pool_participations SET best_score = GREATEST(best_score, ?), last_played_at = NOW(), best_session_id = CASE WHEN ? > best_score THEN ? ELSE best_session_id END WHERE id = ?",
              [finalScore, finalScore, result.insertId, poolParticipationId],
              (updateErr) => {
                if (updateErr) {
                  console.error("Error updating pool participation best score:", updateErr);
                  reject(updateErr);
                } else {
                  console.log(`Updated pool participation ${poolParticipationId} - new best score check: ${finalScore}`);
                  resolve();
                }
              }
            );
          });
        } catch (updateError) {
          console.error("Failed to update pool participation:", updateError);
          // Don't fail the session save if pool update fails
        }
      }
      
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

import EndlessRunnerGame from './game-engine.js';
const activeUsers = new Map(); // socket.id -> { id, username, isGuest }
const games = new Map(); // socket.id -> EndlessRunnerGame instance

const io = new Server(server);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new game instance for this user
  const game = new EndlessRunnerGame();
  games.set(socket.id, game);

  // When user joins the game
  socket.on('join-game', (userData) => {
    activeUsers.set(socket.id, {
      id: userData.id || 0,
      username: userData.username,
      isGuest: userData.isGuest || false,
      connectedAt: new Date()
    });
    const game = games.get(socket.id);
    if (game && userData.height) {
      game.ground = userData.height * 0.8;
      game.player.y = game.ground - game.player.height;
    }
    console.log('User joined game:', userData.username);
    // Broadcast updated active users count
    io.emit('active-users-update', Array.from(activeUsers.values()));
  });

  // Receive input from client
  socket.on('input', (input) => {
    const game = games.get(socket.id);
    if (game) {
      game.processInput(input);
    }
  });

  // Handle game control events
  socket.on('start', () => {
    const game = games.get(socket.id);
    if (game) {
      game.start();
    }
  });

  socket.on('pause', () => {
    const game = games.get(socket.id);
    if (game) {
      game.pause();
    }
  });

  socket.on('resume', () => {
    const game = games.get(socket.id);
    if (game) {
      game.resume();
    }
  });

  socket.on('restart', () => {
    const game = games.get(socket.id);
    if (game) {
      game.restartGame();
    }
  });

  // Game loop: send updated game state to client
  const interval = setInterval(() => {
    const game = games.get(socket.id);
    if (game) {
      const state = game.update();
      socket.emit('gameState', state);
    }
  }, 1000 / 60); // 60 FPS

  // When user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeUsers.delete(socket.id);
    games.delete(socket.id);
    clearInterval(interval);
    // Broadcast updated active users count
    io.emit('active-users-update', Array.from(activeUsers.values()));
  });
});

// Serve static files
app.use(express.static('.'));

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));