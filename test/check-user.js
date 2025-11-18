import db from "../db.js";

async function checkUsers() {
  try {
    const users = await new Promise((resolve, reject) => {
      db.query("SELECT id, username, email, country, created_at FROM users ORDER BY id DESC", (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    console.log("All users:");
    users.forEach(user => {
      console.log(`ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Country: ${user.country}, Created: ${user.created_at}`);
    });

    db.end();
  } catch (error) {
    console.error("Check failed:", error);
    db.end();
  }
}

checkUsers();