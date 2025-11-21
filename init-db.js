import mysql from "mysql2";
import dotenv from "dotenv";
dotenv.config();

// Create connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Function to create database tables
const createTables = () => {
  console.log("Creating database tables...");

  let completed = 0;
  const total = 2; // Only users and game_sessions tables now

  const checkComplete = () => {
    completed++;
    if (completed === total) {
      console.log("Database initialization completed!");
      db.end(); // Close connection
      process.exit(0);
    }
  };

  // Drop existing tables first (for schema updates)
  const dropTables = () => {
    console.log("Dropping existing tables...");
    db.query("DROP TABLE IF EXISTS game_sessions", (err) => {
      if (err) console.error("Error dropping game_sessions table:", err);
    });
    db.query("DROP TABLE IF EXISTS scores", (err) => {
      if (err) console.error("Error dropping scores table:", err);
    });
    db.query("DROP TABLE IF EXISTS users", (err) => {
      if (err) console.error("Error dropping users table:", err);
    });
  };

  // Create users table
  const createUsersTable = `
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      country VARCHAR(100),
      ip_address VARCHAR(45),
      payout_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      INDEX idx_email (email),
      INDEX idx_username (username)
    )
  `;

  // Create game_sessions table
  const createGameSessionsTable = `
    CREATE TABLE game_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      guest_username VARCHAR(255) NULL,
      session_id VARCHAR(255) NOT NULL,
      game_type VARCHAR(50) DEFAULT 'default',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      duration_seconds INT DEFAULT 0,
      final_score INT DEFAULT 0,
      coins_collected INT DEFAULT 0,
      obstacles_hit INT DEFAULT 0,
      powerups_collected INT DEFAULT 0,
      distance_traveled INT DEFAULT 0,
      game_result ENUM('completed', 'died', 'quit', 'timeout') DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_session (user_id, is_active),
      INDEX idx_guest_username (guest_username),
      INDEX idx_session_id (session_id),
      INDEX idx_started_at (started_at),
      INDEX idx_final_score (final_score DESC)
    )
  `;

  // Drop tables first, then create them
  dropTables();

  // Execute table creation (with slight delay to ensure drops complete)
  setTimeout(() => {
    db.query(createUsersTable, (err) => {
      if (err) {
        console.error("Error creating users table:", err);
      } else {
        console.log("✅ Users table created");
      }
      checkComplete();
    });

    db.query(createGameSessionsTable, (err) => {
      if (err) {
        console.error("Error creating game_sessions table:", err);
      } else {
        console.log("✅ Game sessions table created");
      }
      checkComplete();
    });
  }, 100);
};// Connect and create tables
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  } else {
    console.log("✅ Connected to MySQL");
    createTables();
  }
});