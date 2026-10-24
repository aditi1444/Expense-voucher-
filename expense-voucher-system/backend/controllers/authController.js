const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

// Register a new employee
const register = async (req, res) => {
  try {
    // Check whether the request body exists
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        success: false,
        message:
          "Request body is missing. Send JSON using Postman Body > raw > JSON.",
      });
    }

    const { name, email, password, employeeId, department } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }
    if (
      (employeeId !== undefined && typeof employeeId !== "string") ||
      (department !== undefined && typeof department !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and department must be text.",
      });
    }

    // Check whether the email already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Public registration can create employee accounts only
    const user = await User.create({
      name,
      email,
      password,
      employeeId: employeeId?.trim() || undefined,
      department: department?.trim() || "",
      role: "employee",
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: "Employee registered successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This email or employee ID is already registered.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register employee.",
    });
  }
};

// Log in an existing user
const login = async (req, res) => {
  try {
    // Check that the request body exists
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        success: false,
        message: "Request body is missing. Please send JSON.",
      });
    }

    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Retrieve the password hash for comparison
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact the administrator.",
      });
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
};

const getCurrentUser = (req, res) => {
  const { _id, name, email, employeeId, department, role } = req.user;
  return res.status(200).json({
    success: true,
    user: { id: _id, name, email, employeeId, department, role },
  });
};

module.exports = {
  register,
  login,
  getCurrentUser,
};