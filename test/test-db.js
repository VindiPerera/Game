import db from "../db.js";
import bcrypt from 'bcryptjs';

async function testRegistration() {
  try {
    // Test country insertion
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('123456', saltRounds);

    const result = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO users (username, email, password, country, created_at) VALUES (?, ?, ?, ?, NOW())",
        ['testuser6', 'test6@example.com', hashedPassword, 'United States'],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    console.log("User inserted successfully with ID:", result.insertId);

    // Check if country was inserted
    const user = await new Promise((resolve, reject) => {
      db.query("SELECT * FROM users WHERE id = ?", [result.insertId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0]);
      });
    });

    console.log("User data:", user);
    console.log("Country value:", user.country);

    db.end();
  } catch (error) {
    console.error("Test failed:", error);
    db.end();
  }
}

testRegistration();