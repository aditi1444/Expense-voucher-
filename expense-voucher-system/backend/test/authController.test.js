const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const controller = require("../controllers/authController");

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("login returns a token and safe user data for an active account", async (t) => {
  const originalFindOne = User.findOne;
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    User.findOne = originalFindOne;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-signing";
  User.findOne = () => ({
    select: async () => ({
      _id: "employee-id",
      name: "Test Employee",
      email: "employee@example.test",
      employeeId: "EMP-1",
      department: "IT",
      role: "employee",
      isActive: true,
      comparePassword: async (password) => password === "CorrectPass123",
      password: "password-hash",
    }),
  });

  const res = makeResponse();
  await controller.login(
    {
      body: {
        email: " EMPLOYEE@example.test ",
        password: "CorrectPass123",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, "string");
  assert.equal(res.body.user.role, "employee");
  assert.equal("password" in res.body.user, false);
});

test("public registration forces Employee role regardless of supplied fields", async (t) => {
  const originals = {
    findOne: User.findOne,
    create: User.create,
  };
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    Object.assign(User, originals);
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-signing";
  User.findOne = async () => null;
  let createdUser;
  User.create = async (userData) => {
    createdUser = userData;
    return {
      ...userData,
      _id: "employee-id",
      email: userData.email.toLowerCase(),
      role: userData.role,
    };
  };

  const res = makeResponse();
  await controller.register(
    {
      body: {
        name: "Test Employee",
        email: "EMPLOYEE@example.test",
        password: "CorrectPass123",
        role: "director",
        isActive: false,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdUser.role, "employee");
  assert.equal("isActive" in createdUser, false);
  assert.equal(res.body.user.role, "employee");
  assert.equal("password" in res.body.user, false);
});

test("login rejects inactive accounts and incorrect passwords", async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  for (const [account, expectedStatus] of [
    [
      {
        isActive: false,
        comparePassword: async () => true,
      },
      403,
    ],
    [
      {
        isActive: true,
        comparePassword: async () => false,
      },
      401,
    ],
  ]) {
    User.findOne = () => ({
      select: async () => account,
    });
    const res = makeResponse();
    await controller.login(
      { body: { email: "employee@example.test", password: "bad-password" } },
      res
    );
    assert.equal(res.statusCode, expectedStatus);
  }
});
