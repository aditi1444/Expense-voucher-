const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { authorize, protect } = require("../middleware/authMiddleware");

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

test("enforces each role without relying on frontend controls", () => {
  for (const [role, allowed, expectedStatus] of [
    ["employee", ["employee"], null],
    ["employee", ["director"], 403],
    ["employee", ["accounts"], 403],
    ["director", ["employee"], 403],
    ["director", ["director"], null],
    ["director", ["accounts"], 403],
    ["accounts", ["director"], 403],
    ["accounts", ["accounts"], null],
    ["accounts", ["employee"], 403],
  ]) {
    const middleware = authorize(...allowed);
    const req = { user: { role } };
    const res = makeResponse();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    if (expectedStatus === null) {
      assert.equal(nextCalled, true, `${role} should be allowed`);
    } else {
      assert.equal(res.statusCode, expectedStatus);
      assert.equal(res.body.success, false);
    }
  }
});

test("rejects missing authenticated users", () => {
  const res = makeResponse();
  let nextCalled = false;

  authorize("employee")({}, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("rejects a correctly signed expired JWT", async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-jwt-secret";
  t.after(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  const token = jwt.sign(
    { userId: "employee-id" },
    process.env.JWT_SECRET,
    { expiresIn: -1 }
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeResponse();
  let nextCalled = false;

  await protect(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /expired/i);
});
