import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./db.js";
import authRoutes, { authenticateToken } from "./auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Game Backend is Running!");
});

// Get all scores (public)
app.get("/api/scores", (req, res) => {
  db.query(
    "SELECT s.id, s.username, s.score, s.game_type, s.created_at FROM scores s ORDER BY s.score DESC LIMIT 50",
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
  const { score, game_type = "default" } = req.body;
  
  if (!score || score < 0) {
    return res.status(400).json({ message: "Valid score is required" });
  }

  db.query(
    "INSERT INTO scores (user_id, username, score, game_type) VALUES (?, ?, ?, ?)",
    [req.user.id, req.user.username, score, game_type],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Failed to save score" });
      }
      res.json({ 
        message: "Score saved successfully!",
        scoreId: result.insertId
      });
    }
  );
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
