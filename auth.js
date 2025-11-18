import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./db.js";

const router = express.Router();

// Middleware to verify JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  // Also check for token in cookies (for web clients)
  const cookieToken = req.cookies?.token;

  const finalToken = token || cookieToken;

  if (!finalToken) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(finalToken, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Register/Signup Route
router.post("/register", async (req, res) => {
  console.log("[DEBUG] Registration attempt - Full request body:", req.body);
  const { username, email, password, country } = req.body;
  console.log("[DEBUG] Extracted values - Username:", username, "| Email:", email, "| Country:", country, "| Country type:", typeof country);

  // Validation
  if (!username || !email || !password || !country) {
    console.log("[DEBUG] Validation failed - Missing fields:", {
      username: !username,
      email: !email,
      password: !password,
      country: !country
    });
    return res.status(400).json({ message: "All fields are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    // Check if user already exists
    db.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [email, username],
      async (err, results) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (results.length > 0) {
          return res.status(400).json({ message: "User already exists with this email or username" });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        console.log("[DEBUG] About to insert user - Country value:", country, "| Type:", typeof country, "| Is null:", country === null, "| Is undefined:", country === undefined);
        
        // Insert new user
        db.query(
          "INSERT INTO users (username, email, password, country, created_at) VALUES (?, ?, ?, ?, NOW())",
          [username, email, hashedPassword, country],
          (err, result) => {
            console.log("[DEBUG] Database insert result - Error:", err ? err.message : 'none', "| Result ID:", result ? result.insertId : 'none');
            if (err) {
              console.error("Database error:", err);
              return res.status(500).json({ message: "Failed to create user" });
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

            console.log("[DEBUG] User registered successfully - ID:", result.insertId, "| Username:", username, "| Country was:", country);
            
            res.status(201).json({
              message: "User registered successfully",
              token: token,
              user: {
                id: result.insertId,
                username: username,
                email: email
              }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login Route
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  // Find user by email
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = results[0];

    try {
      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
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

      res.json({
        message: "Login successful",
        token: token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
});

// Get user profile (protected route)
router.get("/profile", authenticateToken, (req, res) => {
  db.query(
    "SELECT id, username, email, created_at, last_login FROM users WHERE id = ?",
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        message: "Profile retrieved successfully",
        user: results[0]
      });
    }
  );
});

// Logout route (client-side token removal, but we can track it server-side if needed)
router.post("/logout", authenticateToken, (req, res) => {
  // In a more advanced setup, you might want to blacklist the token
  res.json({ message: "Logout successful" });
});

export default router;