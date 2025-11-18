import bcrypt from 'bcryptjs';
import db from "../db.js";

async function testRegistrationLogic() {
  const username = 'testuser4';
  const email = 'test4@example.com';
  const password = '123456';

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
      console.log('User already exists');
      db.end();
      return;
    }

    // Simulate IP detection
    let userIP = '127.0.0.1'; // Simulate localhost

    console.log("Detected IP address:", userIP);

    let country = 'Unknown';

    // Handle IPv6 localhost (::1) and IPv4 localhost (127.0.0.1)
    if (userIP === '::1' || userIP === '127.0.0.1' || userIP === '::ffff:127.0.0.1') {
      // For local development, set country to Unknown instead of defaulting to USA
      country = 'Unknown';
    } else {
      // Get country from IP using free API
      try {
        const response = await fetch(`http://ip-api.com/json/${userIP}`);
        const data = await response.json();
        if (data.status === 'success') {
          country = data.country;
        }
      } catch (error) {
        console.error('Error fetching country:', error);
        country = 'Unknown';
      }
    }

    console.log("Using country:", country);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    const result = await new Promise((resolve, reject) => {
      db.query(
        "INSERT INTO users (username, email, password, country, created_at) VALUES (?, ?, ?, ?, NOW())",
        [username, email, hashedPassword, country],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    console.log("Registration successful for user:", username, "with country:", country);

    db.end();
  } catch (error) {
    console.error("Registration error:", error);
    db.end();
  }
}

testRegistrationLogic();