import db from "./db.js";

// Function to create database tables
const createTables = () => {
  console.log("Creating database tables...");

  // Create users table
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      INDEX idx_email (email),
      INDEX idx_username (username)
    )
  `;

  // Create scores table
  const createScoresTable = `
    CREATE TABLE IF NOT EXISTS scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(50) NOT NULL,
      score INT NOT NULL,
      game_type VARCHAR(50) DEFAULT 'default',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_score (score DESC)
    )
  `;

  // Create game_sessions table
  const createGameSessionsTable = `
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      session_token VARCHAR(255) NOT NULL,
      game_type VARCHAR(50) DEFAULT 'default',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_session (user_id, is_active)
    )
  `;

  // Execute table creation
  db.query(createUsersTable, (err) => {
    if (err) {
      console.error("Error creating users table:", err);
    } else {
      console.log("✅ Users table created/verified");
    }
  });

  db.query(createScoresTable, (err) => {
    if (err) {
      console.error("Error creating scores table:", err);
    } else {
      console.log("✅ Scores table created/verified");
    }
  });

  db.query(createGameSessionsTable, (err) => {
    if (err) {
      console.error("Error creating game_sessions table:", err);
    } else {
      console.log("✅ Game sessions table created/verified");
    }
  });

  console.log("Database initialization completed!");
  process.exit(0);
};

// Run the table creation
createTables();