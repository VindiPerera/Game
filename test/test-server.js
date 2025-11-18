import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/test", (req, res) => {
  res.json({ message: "Server is working" });
});

app.post("/test-register", async (req, res) => {
  console.log("Registration request received:", req.body);
  res.json({ message: "Registration endpoint works" });
});

const PORT = 5001;
app.listen(PORT, () => console.log(`Test server running on port ${PORT}`));