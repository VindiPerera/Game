import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }

  console.log('✅ Connected to database');

  db.query('SELECT COUNT(*) as session_count FROM game_sessions', (err, results) => {
    if (err) {
      console.error('Query error:', err);
    } else {
      console.log('Current session count:', results[0].session_count);

      // Also show recent sessions
      db.query('SELECT * FROM game_sessions ORDER BY created_at DESC LIMIT 5', (err, sessions) => {
        if (err) {
          console.error('Query error:', err);
        } else {
          console.log('Recent sessions:');
          sessions.forEach(session => {
            console.log(`- Session ID: ${session.session_id}, Score: ${session.final_score}, Duration: ${session.duration_seconds}s, Result: ${session.game_result}`);
          });
        }
        db.end();
      });
    }
  });
});