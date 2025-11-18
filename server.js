import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
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

// Trust proxy to get real IP addresses
app.set("trust proxy", true);

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));

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
  res.render("login", {
    title: "Login",
    error: null,
  });
});

// Register page
app.get("/register", (req, res) => {
  res.render("register", {
    title: "Register",
    error: null,
  });
});

// Handle login form submission
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render("login", {
      title: "Login",
      error: "Email and password are required",
    });
  }

  try {
    // Find user by email
    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          console.error("Database error:", err);
          return res.render("login", {
            title: "Login",
            error: "Database error occurred",
          });
        }

        if (results.length === 0) {
          return res.render("login", {
            title: "Login",
            error: "Invalid email or password",
          });
        }

        const user = results[0];

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          return res.render("login", {
            title: "Login",
            error: "Invalid email or password",
          });
        }

        // Generate JWT token
        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            email: user.email,
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
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });

        // Redirect to home page
        res.redirect("/");
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", {
      title: "Login",
      error: "Server error occurred",
    });
  }
});

// Handle register form submission
app.post("/auth/register", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  // Validation
  if (!username || !email || !password || !confirmPassword) {
    return res.render("register", {
      title: "Register",
      error: "All fields are required",
    });
  }

  if (password !== confirmPassword) {
    return res.render("register", {
      title: "Register",
      error: "Passwords do not match",
    });
  }

  if (password.length < 6) {
    return res.render("register", {
      title: "Register",
      error: "Password must be at least 6 characters",
    });
  }

  try {
    // Check if user already exists
    const existingUsers = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM users WHERE email = ? OR username = ?",
        [email, username],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    if (existingUsers.length > 0) {
      return res.render("register", {
        title: "Register",
        error: "User already exists with this email or username",
      });
    }

    // Get user's IP address (improved for hosted environments)
    console.log("========== IP DETECTION DEBUG ==========");
    console.log("All request headers:", JSON.stringify(req.headers, null, 2));
    console.log("req.ip:", req.ip);
    console.log("req.connection.remoteAddress:", req.connection?.remoteAddress);
    console.log("req.socket.remoteAddress:", req.socket?.remoteAddress);
    
    let userIP =
      req.headers['x-real-ip'] || // Nginx
      req.headers['cf-connecting-ip'] || // Cloudflare
      req.headers['x-forwarded-for']?.split(',')[0].trim() || // Load balancers
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);

    console.log("🔍 Raw IP detected:", userIP);
    console.log("IP source breakdown:");
    console.log("  - x-real-ip:", req.headers['x-real-ip']);
    console.log("  - cf-connecting-ip:", req.headers['cf-connecting-ip']);
    console.log("  - x-forwarded-for:", req.headers['x-forwarded-for']);
    console.log("========================================");

    // Clean IPv6-mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    if (userIP && userIP.startsWith("::ffff:")) {
      userIP = userIP.substring(7);
      console.log("🔧 Cleaned IPv6-mapped address to:", userIP);
    }

    console.log("✅ Final cleaned IP:", userIP);

    // Initialize country
    let country = "Unknown";

    // Check if it's a local/private IP
    console.log("\n========== LOCAL IP CHECK ==========");
    const isIPv6Localhost = userIP === "::1";
    const isIPv4Localhost = userIP === "127.0.0.1";
    const is192Network = userIP?.startsWith("192.168.");
    const is10Network = userIP?.startsWith("10.");
    const is172Network = /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(userIP || "");
    const isNoIP = !userIP;
    
    console.log("IP checks:");
    console.log("  - No IP:", isNoIP);
    console.log("  - IPv6 localhost (::1):", isIPv6Localhost);
    console.log("  - IPv4 localhost (127.0.0.1):", isIPv4Localhost);
    console.log("  - 192.168.x.x network:", is192Network);
    console.log("  - 10.x.x.x network:", is10Network);
    console.log("  - 172.16-31.x.x network:", is172Network);
    
    const isLocalIP = isNoIP || isIPv6Localhost || isIPv4Localhost || is192Network || is10Network || is172Network;
    console.log("🏠 Is Local/Private IP:", isLocalIP);
    console.log("====================================\n");

    if (isLocalIP) {
      console.log("❌ Local/Private IP detected - Blocking registration");
      console.log("Reason: Cannot register from local network");
      return res.render("register", {
        title: "Register",
        error: "Registration is not available from local networks. Please use a public internet connection.",
      });
    } else {
      // Get country from IP using API with timeout
      console.log("\n========== COUNTRY API CALL ==========");
      try {
        const apiURL = `http://ip-api.com/json/${userIP}?fields=status,message,country`;
        console.log("📡 Calling IP-API with URL:", apiURL);
        console.log("IP being queried:", userIP);
        
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          console.log("⏱️ Request timeout after 5 seconds");
          controller.abort();
        }, 5000); // 5 second timeout
        
        console.log("⏳ Fetching country data...");
        const fetchStartTime = Date.now();
        
        const response = await fetch(apiURL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        
        const fetchEndTime = Date.now();
        console.log(`✅ Fetch completed in ${fetchEndTime - fetchStartTime}ms`);
        
        clearTimeout(timeout);
        
        console.log("Response status:", response.status);
        console.log("Response ok:", response.ok);
        console.log("Response headers:", JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
        
        if (!response.ok) {
          console.error("❌ IP-API HTTP error:", response.status, response.statusText);
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const responseText = await response.text();
        console.log("Raw response body:", responseText);
        
        const data = JSON.parse(responseText);
        console.log("✅ Parsed JSON response:", JSON.stringify(data, null, 2));
        
        if (data.status === "success" && data.country) {
          country = data.country;
          console.log("🎉 SUCCESS - Country detected:", country);
        } else {
          console.log("❌ IP-API returned failure status");
          console.log("Status:", data.status);
          console.log("Message:", data.message || "No message provided");
          console.log("Country field:", data.country);
          throw new Error(data.message || "Country detection failed");
        }
      } catch (error) {
        console.log("====================================\n");
        console.error("❌❌❌ COUNTRY DETECTION ERROR ❌❌❌");
        console.error("Error type:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.log("=====================================");
        
        // Don't allow registration if country cannot be determined
        return res.render("register", {
          title: "Register",
          error: "Unable to verify your location. Please try again later or contact support.",
        });
      }
      console.log("====================================\n");
    }

    console.log("📍 Final country value for user:", country);

    // Final validation - ensure country is not null or empty
    console.log("\n========== FINAL VALIDATION ==========");
    console.log("Country value:", country);
    console.log("Country type:", typeof country);
    console.log("Is 'Unknown':", country === "Unknown");
    console.log("Is null:", country === null);
    console.log("Is undefined:", country === undefined);
    console.log("Is empty string:", country === "");
    console.log("Is falsy:", !country);
    
    if (!country || country === "Unknown") {
      console.error("❌ Registration blocked - country could not be determined");
      console.log("====================================\n");
      return res.render("register", {
        title: "Register",
        error: "Unable to verify your location. Please try again later.",
      });
    }
    console.log("✅ Country validation passed");
    console.log("====================================\n");

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Final safety check before database insertion - prevent null country
    console.log("\n========== PRE-DATABASE INSERT CHECK ==========");
    console.log("Username:", username);
    console.log("Email:", email);
    console.log("Country:", country);
    console.log("Country is valid:", country && country !== "Unknown" && country.trim() !== "");
    
    if (!country || country === null || country === "Unknown" || country.trim() === "") {
      console.error("❌ CRITICAL: Attempted to register user with invalid country:", country);
      console.log("===============================================\n");
      return res.render("register", {
        title: "Register",
        error: "Unable to verify your location. Registration cannot be completed.",
      });
    }

    // Insert new user
    console.log("📝 Executing INSERT query with country:", country);
    const result = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO users (username, email, password, country, created_at) VALUES (?, ?, ?, ?, NOW())",
        [username, email, hashedPassword, country],
        (err, result) => {
          if (err) {
            console.error("❌ Database insert error:", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);
            console.error("SQL State:", err.sqlState);
            reject(err);
          } else {
            console.log("✅ User inserted successfully with ID:", result.insertId);
            console.log("Country value in insert:", country);
            resolve(result);
          }
        }
      );
    });
    console.log("===============================================\n");

    console.log("Registration successful for user:", username, "with country:", country);
    console.log("🎉🎉🎉 REGISTRATION COMPLETED SUCCESSFULLY 🎉🎉🎉\n");
    res.redirect("/login");
  } catch (error) {
    console.error("\n========== REGISTRATION ERROR ==========");
    console.error("❌ Registration error:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.log("========================================\n");
    res.render("register", {
      title: "Register",
      error: "Server error occurred",
    });
  }
});

// Logout route
app.post("/auth/logout", (req, res) => {
  // Clear the token cookie
  res.clearCookie("token");
  res.redirect("/");
});

// Game route (allows guest access)
app.get("/game", checkAuth, (req, res) => {
  // Allow guest access if guest=true parameter is present
  const isGuest = req.query.guest === "true";

  if (!req.user && !isGuest) {
    return res.redirect("/login");
  }

  // For guest users, create a guest user object with unique ID
  let user;
  if (isGuest) {
    const guestId =
      "GUEST_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    user = {
      id: 0,
      username: guestId,
      email: "guest@example.com",
      isGuest: true,
      guestId: guestId,
    };
  } else {
    user = req.user;
  }

  res.render("game", {
    title: "Endless Runner - Play",
    user: user,
  });
});

// Home route
app.get("/", checkAuth, (req, res) => {
  res.render("index", {
    title: "Endless Runner Game",
    user: req.user,
  });
});

// Leaderboard route
app.get("/leaderboard", checkAuth, (req, res) => {
  // Query to get highest score per user from last 24 hours
  // Using game_sessions table to get all players including guests
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
            ranked_sessions.country
     FROM (
       SELECT 
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
            gs.user_id,
            gs.id,
            COALESCE(u.country, 'Unknown') as country,
            ROW_NUMBER() OVER (
              PARTITION BY 
                CASE 
                  WHEN gs.user_id IS NOT NULL THEN gs.user_id 
                  ELSE CONCAT('guest_', gs.id) 
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
        return res.render("leaderboard", {
          title: "Leaderboard",
          scores: [],
          user: req.user,
          error: "Failed to load leaderboard",
        });
      }
      res.render("leaderboard", {
        title: "Leaderboard",
        scores: results,
        user: req.user,
        error: null,
      });
    }
  );
});

// Winners route - shows top 3 winners for a selected date
app.get("/winners", checkAuth, (req, res) => {
  // Get date from query parameter or use today
  const selectedDate = req.query.date || new Date().toISOString().split("T")[0];

  // Query to get top 3 scores for the selected date
  const query = `SELECT 
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
            ranked_sessions.country
     FROM (
       SELECT 
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
            gs.user_id,
            gs.id,
            COALESCE(u.country, 'Unknown') as country,
            ROW_NUMBER() OVER (
              PARTITION BY 
                CASE 
                  WHEN gs.user_id IS NOT NULL THEN gs.user_id 
                  ELSE CONCAT('guest_', gs.id) 
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
      return res.render("winners", {
        title: "Game Winners",
        winners: [],
        selectedDate: selectedDate,
        user: req.user,
        error: "Failed to load winners data",
      });
    }
    res.render("winners", {
      title: "Game Winners",
      winners: results,
      selectedDate: selectedDate,
      user: req.user,
      error: null,
    });
  });
});

// Wiki route
app.get("/wiki", checkAuth, (req, res) => {
  res.render("wiki", {
    title: "Game Wiki - Info, Payouts & Terms",
    user: req.user,
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
            ranked_sessions.country
     FROM (
       SELECT 
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
            gs.user_id,
            gs.id,
            COALESCE(u.country, 'Unknown') as country,
            ROW_NUMBER() OVER (
              PARTITION BY 
                CASE 
                  WHEN gs.user_id IS NOT NULL THEN gs.user_id 
                  ELSE CONCAT('guest_', gs.id) 
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
        scores: results,
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
        scores: results,
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
        scoreId: result.insertId,
      });
    }
  );
});

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

  console.log("Session saving request received:", req.body);
  console.log("Authenticated user:", user || "None");

  // Handle guest users - get guest info from request body
  let userId, username;
  if (user) {
    userId = user.id;
    username = user.username;
  } else {
    // For guest users, use NULL for user_id and generate unique guest name
    const { guestId } = req.body;
    userId = null; // Use NULL to avoid foreign key constraint issues
    username =
      guestId || `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    console.log("Guest info from body:", {
      guestId,
      finalUserId: userId,
      finalUsername: username,
    });
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
    gameResult,
  } = req.body;

  if (!sessionId || !durationSeconds || finalScore === undefined) {
    console.log("Invalid session data:", req.body);
    return res.status(400).json({ message: "Valid session data is required" });
  }

  // Ensure all values are properly set
  const dbUserId = userId; // Allow NULL for guests
  const dbUsername = username || "Guest";
  const dbCoinsCollected = coinsCollected || 0;
  const dbObstaclesHit = obstaclesHit || 0;
  const dbPowerupsCollected = powerupsCollected || 0;
  const dbDistanceTraveled = distanceTraveled || 0;
  const dbGameResult = gameResult || "unknown";

  console.log("Inserting session with values:", {
    userId: dbUserId,
    sessionId,
    durationSeconds,
    finalScore,
    coinsCollected: dbCoinsCollected,
    obstaclesHit: dbObstaclesHit,
    powerupsCollected: dbPowerupsCollected,
    distanceTraveled: dbDistanceTraveled,
    gameResult: dbGameResult,
  });

  db.query(
    "INSERT INTO game_sessions (user_id, session_id, duration_seconds, final_score, coins_collected, obstacles_hit, powerups_collected, distance_traveled, game_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      dbUserId,
      sessionId,
      durationSeconds,
      finalScore,
      dbCoinsCollected,
      dbObstaclesHit,
      dbPowerupsCollected,
      dbDistanceTraveled,
      dbGameResult,
    ],
    (err, result) => {
      if (err) {
        console.error("Database error saving session:", err);
        console.error("Error details:", err.message);
        return res
          .status(500)
          .json({ message: "Failed to save session: " + err.message });
      }
      console.log("Session saved successfully with ID:", result.insertId);
      res.json({
        message: "Session saved successfully!",
        sessionId: result.insertId,
      });
    }
  );
});

const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static("."));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
