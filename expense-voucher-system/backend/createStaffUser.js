require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

function readHiddenPassword() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("Run this command in an interactive terminal to enter the password safely."));
      return;
    }

    process.stdout.write("Password (at least 12 characters): ");
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    let password = "";

    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };

    const onData = (character) => {
      if (character === "\u0003") {
        finish(new Error("Password entry cancelled."));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u0008" || character === "\u007f") {
        password = password.slice(0, -1);
      } else {
        password += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function createStaffUser() {
  const [role, name, email] = process.argv.slice(2);
  if (!["director", "accounts"].includes(role) || !name?.trim() || !email?.trim()) {
    throw new Error(
      'Usage: node createStaffUser.js <director|accounts> "<full name>" <email>'
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error("Enter a valid email address.");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in backend/.env.");
  }

  const password = await readHiddenPassword();
  if (password.length < 12) {
    throw new Error("Choose a password with at least 12 characters.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const normalizedEmail = email.toLowerCase().trim();
  const existcoingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new Error("An account with this email already exists; no changes were made.");
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    role,
    isActive: true,
  });
  console.log(`Created ${role} account for ${user.email}. Set up access through your secure login channel.`);
}

createStaffUser()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
