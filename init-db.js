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

  // Drop existing tables first (for schema updates)
  const dropTables = () => {
    console.log("Dropping existing tables...");
    const tablesToDrop = [
      'leaderboard_snapshots',
      'withdrawal_requests', 
      'wallet_transactions',
      'game_sessions',
      'pool_participations',
      'daily_competitions',
      'pricing_pools',
      'payment_methods',
      'scores', // Old table
      'users'
    ];
    
    // Disable foreign key checks
    db.query('SET FOREIGN_KEY_CHECKS = 0', (err) => {
      if (err) console.error('Error disabling foreign key checks:', err);
      
      // Drop tables
      let dropsCompleted = 0;
      tablesToDrop.forEach(table => {
        db.query(`DROP TABLE IF EXISTS ${table}`, (dropErr) => {
          if (dropErr) console.error(`Error dropping ${table} table:`, dropErr);
          dropsCompleted++;
          if (dropsCompleted === tablesToDrop.length) {
            // Re-enable foreign key checks
            db.query('SET FOREIGN_KEY_CHECKS = 1', (enableErr) => {
              if (enableErr) console.error('Error re-enabling foreign key checks:', enableErr);
              // Now proceed to create tables
              createTablesSequentially();
            });
          }
        });
      });
    });
  };

  // Create users table
  const createUsersTable = `
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      country VARCHAR(100) DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT NULL,
      payout_details TEXT DEFAULT NULL,
      wallet_balance DECIMAL(10,2) DEFAULT 0.00,
      total_deposited DECIMAL(10,2) DEFAULT 0.00,
      total_withdrawn DECIMAL(10,2) DEFAULT 0.00,
      total_winnings DECIMAL(10,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL DEFAULT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_verified BOOLEAN DEFAULT FALSE,
      INDEX idx_email (email),
      INDEX idx_username (username),
      INDEX idx_is_active (is_active)
    )
  `;

  // Create pricing_pools table
  const createPricingPoolsTable = `
    CREATE TABLE pricing_pools (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pool_name VARCHAR(100) NOT NULL,
      entry_fee DECIMAL(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_is_active (is_active),
      INDEX idx_entry_fee (entry_fee)
    )
  `;

  // Create daily_competitions table
  const createDailyCompetitionsTable = `
    CREATE TABLE daily_competitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pool_id INT NOT NULL,
      competition_date DATE NOT NULL,
      start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      end_time TIMESTAMP NULL DEFAULT NULL,
      total_participants INT DEFAULT 0,
      total_prize_pool DECIMAL(10,2) DEFAULT 0.00,
      total_prize_distributed DECIMAL(10,2) DEFAULT 0.00,
      winners_count INT DEFAULT 0,
      status ENUM('active','calculating','completed','cancelled') DEFAULT 'active',
      winners_calculated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pool_id) REFERENCES pricing_pools(id) ON DELETE CASCADE,
      UNIQUE KEY unique_pool_date (pool_id, competition_date),
      INDEX idx_competition_date (competition_date),
      INDEX idx_status (status),
      INDEX idx_pool_status (pool_id, status)
    )
  `;

  // Create pool_participations table
  const createPoolParticipationsTable = `
    CREATE TABLE pool_participations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      pool_id INT NOT NULL,
      competition_id INT NOT NULL,
      entry_fee_paid DECIMAL(10,2) NOT NULL,
      best_score INT DEFAULT 0,
      best_session_id INT DEFAULT NULL,
      \`rank\` INT DEFAULT NULL,
      is_winner BOOLEAN DEFAULT FALSE,
      prize_amount DECIMAL(10,2) DEFAULT 0.00,
      prize_paid BOOLEAN DEFAULT FALSE,
      prize_paid_at TIMESTAMP NULL DEFAULT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_played_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (pool_id) REFERENCES pricing_pools(id) ON DELETE CASCADE,
      FOREIGN KEY (competition_id) REFERENCES daily_competitions(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_competition (user_id, competition_id),
      INDEX idx_pool_id (pool_id),
      INDEX idx_competition_id (competition_id),
      INDEX idx_user_pool (user_id, pool_id),
      INDEX idx_rank (\`rank\`),
      INDEX idx_is_winner (is_winner),
      INDEX idx_best_score (best_score),
      INDEX idx_competition_score (competition_id, best_score)
    )
  `;

  // Create game_sessions table
  const createGameSessionsTable = `
    CREATE TABLE game_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      guest_username VARCHAR(255) DEFAULT NULL,
      pool_participation_id INT DEFAULT NULL,
      session_id VARCHAR(255) NOT NULL,
      game_type VARCHAR(50) DEFAULT 'default',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL DEFAULT NULL,
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
      FOREIGN KEY (pool_participation_id) REFERENCES pool_participations(id) ON DELETE SET NULL,
      INDEX idx_user_session (user_id, is_active),
      INDEX idx_guest_username (guest_username),
      INDEX idx_session_id (session_id),
      INDEX idx_started_at (started_at),
      INDEX idx_final_score (final_score),
      INDEX idx_pool_participation_id (pool_participation_id)
    )
  `;

  // Create wallet_transactions table
  const createWalletTransactionsTable = `
    CREATE TABLE wallet_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      transaction_type ENUM('deposit','withdrawal','pool_entry','prize_credit','refund') NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      balance_before DECIMAL(10,2) NOT NULL,
      balance_after DECIMAL(10,2) NOT NULL,
      pool_id INT DEFAULT NULL,
      pool_participation_id INT DEFAULT NULL,
      payment_method VARCHAR(50) DEFAULT NULL,
      payment_reference VARCHAR(255) DEFAULT NULL,
      status ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
      notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (pool_id) REFERENCES pricing_pools(id) ON DELETE SET NULL,
      FOREIGN KEY (pool_participation_id) REFERENCES pool_participations(id) ON DELETE SET NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_transaction_type (transaction_type),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at),
      INDEX idx_pool_id (pool_id),
      INDEX idx_pool_participation_id (pool_participation_id)
    )
  `;

  // Create withdrawal_requests table
  const createWithdrawalRequestsTable = `
    CREATE TABLE withdrawal_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      withdrawal_method VARCHAR(50) NOT NULL,
      withdrawal_details TEXT NOT NULL,
      status ENUM('pending','processing','completed','rejected','cancelled') DEFAULT 'pending',
      transaction_id INT DEFAULT NULL,
      admin_notes TEXT DEFAULT NULL,
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL DEFAULT NULL,
      processed_by INT DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_requested_at (requested_at),
      INDEX idx_transaction_id (transaction_id)
    )
  `;

  // Create payment_methods table
  const createPaymentMethodsTable = `
    CREATE TABLE payment_methods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method_name VARCHAR(50) NOT NULL,
      method_type ENUM('deposit','withdrawal','both') DEFAULT 'both',
      is_active BOOLEAN DEFAULT TRUE,
      min_amount DECIMAL(10,2) DEFAULT 0.00,
      max_amount DECIMAL(10,2) DEFAULT NULL,
      processing_fee_percent DECIMAL(5,2) DEFAULT 0.00,
      processing_fee_fixed DECIMAL(10,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_is_active (is_active)
    )
  `;

  // Create leaderboard_snapshots table
  const createLeaderboardSnapshotsTable = `
    CREATE TABLE leaderboard_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      competition_id INT NOT NULL,
      user_id INT NOT NULL,
      username VARCHAR(50) NOT NULL,
      final_rank INT NOT NULL,
      best_score INT NOT NULL,
      is_winner BOOLEAN NOT NULL,
      prize_amount DECIMAL(10,2) DEFAULT 0.00,
      snapshot_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competition_id) REFERENCES daily_competitions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_competition_id (competition_id),
      INDEX idx_snapshot_date (snapshot_date),
      INDEX idx_final_rank (final_rank),
      INDEX idx_user_id (user_id)
    )
  `;

  // Insert default pricing pools
  const insertDefaultPools = `
    INSERT INTO pricing_pools (pool_name, entry_fee, is_active) VALUES
    ('Bronze Pool', 10.00, 1),
    ('Silver Pool', 50.00, 1),
    ('Gold Pool', 100.00, 1)
  `;

  // Drop tables first, then create them
  dropTables();

  const createTablesSequentially = () => {
    let step = 0;
    const steps = [
      // 0: users
      () => db.query(createUsersTable, (err) => {
        if (err) console.error("Error creating users table:", err);
        else console.log("✅ Users table created");
        nextStep();
      }),
      // 1: pricing_pools
      () => db.query(createPricingPoolsTable, (err) => {
        if (err) console.error("Error creating pricing_pools table:", err);
        else {
          console.log("✅ Pricing pools table created");
          db.query(insertDefaultPools, (insertErr) => {
            if (insertErr) console.error("Error inserting default pools:", insertErr);
            else console.log("✅ Default pricing pools inserted");
            nextStep();
          });
        }
      }),
      // 2: daily_competitions
      () => db.query(createDailyCompetitionsTable, (err) => {
        if (err) console.error("Error creating daily_competitions table:", err);
        else console.log("✅ Daily competitions table created");
        nextStep();
      }),
      // 3: pool_participations
      () => db.query(createPoolParticipationsTable, (err) => {
        if (err) console.error("Error creating pool_participations table:", err);
        else console.log("✅ Pool participations table created");
        nextStep();
      }),
      // 4: game_sessions
      () => db.query(createGameSessionsTable, (err) => {
        if (err) console.error("Error creating game_sessions table:", err);
        else console.log("✅ Game sessions table created");
        nextStep();
      }),
      // 5: wallet_transactions
      () => db.query(createWalletTransactionsTable, (err) => {
        if (err) console.error("Error creating wallet_transactions table:", err);
        else console.log("✅ Wallet transactions table created");
        nextStep();
      }),
      // 6: withdrawal_requests
      () => db.query(createWithdrawalRequestsTable, (err) => {
        if (err) console.error("Error creating withdrawal_requests table:", err);
        else console.log("✅ Withdrawal requests table created");
        nextStep();
      }),
      // 7: payment_methods
      () => db.query(createPaymentMethodsTable, (err) => {
        if (err) console.error("Error creating payment_methods table:", err);
        else console.log("✅ Payment methods table created");
        nextStep();
      }),
      // 8: leaderboard_snapshots
      () => db.query(createLeaderboardSnapshotsTable, (err) => {
        if (err) console.error("Error creating leaderboard_snapshots table:", err);
        else console.log("✅ Leaderboard snapshots table created");
        nextStep();
      })
    ];

    const nextStep = () => {
      step++;
      if (step < steps.length) {
        steps[step]();
      } else {
        console.log("Database initialization completed!");
        db.end();
        process.exit(0);
      }
    };

    // Start with first step
    steps[0]();
  };
};

// Connect and create tables
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  } else {
    console.log("✅ Connected to MySQL");
    createTables();
  }
});