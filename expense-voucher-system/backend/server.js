
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const voucherRoutes = require("./routes/voucherRoutes");

const app = express();

// Security middleware
app.use(helmet());

// Allow requests from the React frontend
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  ...(process.env.CLIENT_URL || "").split(","),
]
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Logging middleware
app.use(morgan("dev"));

// Parse incoming JSON request bodies
app.use(express.json({ limit: "1mb" }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Reject malformed JSON with a clear error
app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body. Please check your JSON format.",
    });
  }

  next(err);
});

// Health-check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Expense Voucher API is running",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Voucher routes
app.use("/api/vouchers", voucherRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      err.status && err.status < 500
        ? err.message
        : "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from the .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
