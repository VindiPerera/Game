-- Database schema for gaming app authentication

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    INDEX idx_username (username)
);

-- Game scores table (updated to reference users)
CREATE TABLE IF NOT EXISTS scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    level INT DEFAULT 1,
    distance INT DEFAULT 0,
    game_type VARCHAR(50) DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_score (score DESC)
);

-- Game sessions table (supports both authenticated users and guests)
CREATE TABLE IF NOT EXISTS game_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL, -- NULL for guest players, foreign key for authenticated users
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
    -- Foreign key constraint only applies when user_id is not NULL
    INDEX idx_user_session (user_id, is_active),
    INDEX idx_started_at (started_at),
    INDEX idx_final_score (final_score DESC)
);

-- Add foreign key constraint that allows NULL values
ALTER TABLE game_sessions 
ADD CONSTRAINT fk_user_sessions 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add country column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100);

<<<<<<< Updated upstream
-- Add ip_address column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
-- Add payout_details column to users table for storing bank/crypto details
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_details TEXT;
=======
-- Add payout_details column to users table for storing bank/crypto details
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_details TEXT;
>>>>>>> Stashed changes
