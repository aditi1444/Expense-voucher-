const test = require("node:test");
const assert = require("node:assert/strict");
const Voucher = require("../models/Voucher");
const controller = require("../controllers/voucherController");
const testSignature = "data:image/png;base64,iVBORw0KGgo=";
const expectedStats = {
  total: 3,
  drafts: 1,
  submitted: 2,
  approved: 0,
  rejected: 0,
  approvedAmount: 0,
  monthlyExpenses: [{ month: "2026-10", amount: 75, count: 2 }],
};

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

function mockListQuery() {
  const query = {
    sortValue: null,
    skipValue: null,
    limitValue: null,
    sort(value) {
      this.sortValue = value;
      return this;
    },
    skip(value) {
      this.skipValue = value;
      return this;
    },
    limit(value) {
      this.limitValue = value;
      return Promise.resolve([]);
    },
  };
  return query;
}

test("creates drafts from authenticated identity and ignores protected body fields", async (t) => {
  const originalCreate = Voucher.create;
  t.after(() => {
    Voucher.create = originalCreate;
  });

  let created;
  Voucher.create = async (data) => {
    created = data;
    return { ...data, _id: "voucher-id", voucherNumber: "EV-test" };
  };

  const req = {
    user: {
      _id: "employee-id",
      name: "Test Employee",
      employeeId: "EMP-7",
    },
    body: {
      voucherDate: "2026-10-22",
      expenseDate: "2026-10-21",
      department: "IT",
      title: "Travel",
      category: "Travel",
      description: "Taxi fare",
      amount: 125,
      employee: "attacker-id",
      employeeId: "attacker-employee-id",
      employeeName: "Attacker",
      status: "Approved",
      approvalDate: "2026-10-22",
      director: "attacker-director",
    },
  };
  const res = makeResponse();

  await controller.createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.employee, "employee-id");
  assert.equal(created.employeeId, "EMP-7");
  assert.equal(created.employeeName, "Test Employee");
  assert.equal(created.status, "Draft");
  assert.equal("approvalDate" in created, false);
  assert.equal("director" in created, false);
});

test("rejects invalid calendar dates when creating drafts", async (t) => {
  const originalCreate = Voucher.create;
  t.after(() => {
    Voucher.create = originalCreate;
  });
  Voucher.create = async () => {
    throw new Error("Should not write an invalid date");
  };

  const res = makeResponse();
  await controller.createVoucher(
    {
      user: { _id: "employee-id", name: "Test Employee" },
      body: {
        expenseDate: "2026-02-31",
        department: "IT",
        title: "Travel",
        category: "Travel",
        amount: 125,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Expense date/);
});

test("updates only Draft vouchers with an atomic status condition", async (t) => {
  const originals = {
    findOneAndUpdate: Voucher.findOneAndUpdate,
    findOne: Voucher.findOne,
  };
  t.after(() => Object.assign(Voucher, originals));

  let updateFilter;
  let updateDocument;
  Voucher.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    updateDocument = update;
    return { _id: "voucher-id", title: "Updated title", status: "Draft" };
  };

  const res = makeResponse();
  await controller.updateDraftVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
      body: {
        title: "Updated title",
        status: "Approved",
        director: "attacker-id",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateFilter, {
    _id: "voucher-id",
    employee: "employee-id",
    status: "Draft",
  });
  assert.deepEqual(updateDocument, { $set: { title: "Updated title" } });
});

test("does not update a voucher after it leaves Draft", async (t) => {
  const originals = {
    findOneAndUpdate: Voucher.findOneAndUpdate,
    findOne: Voucher.findOne,
  };
  t.after(() => Object.assign(Voucher, originals));

  Voucher.findOneAndUpdate = async () => null;
  Voucher.findOne = () => ({
    select: async () => ({ status: "Submitted" }),
  });

  const res = makeResponse();
  await controller.updateDraftVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
      body: { title: "Late edit" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Only draft/);
});

test("deletes only a Draft owned by the current employee", async (t) => {
  const originals = {
    deleteOne: Voucher.deleteOne,
    findOne: Voucher.findOne,
  };
  t.after(() => Object.assign(Voucher, originals));

  let deleteFilter;
  Voucher.deleteOne = async (filter) => {
    deleteFilter = filter;
    return { deletedCount: 1 };
  };
  const res = makeResponse();
  await controller.deleteDraftVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleteFilter, {
    _id: "voucher-id",
    employee: "employee-id",
    status: "Draft",
  });
});

test("scopes Employee voucher details to the authenticated owner", async (t) => {
  const originalFindOne = Voucher.findOne;
  t.after(() => {
    Voucher.findOne = originalFindOne;
  });

  let appliedFilter;
  Voucher.findOne = async (filter) => {
    appliedFilter = filter;
    return null;
  };

  const res = makeResponse();
  await controller.getVoucherById(
    {
      params: { id: "other-employee-voucher" },
      user: { _id: "employee-a-id", role: "employee" },
    },
    res
  );

  assert.deepEqual(appliedFilter, {
    _id: "other-employee-voucher",
    employee: "employee-a-id",
  });
  assert.equal(res.statusCode, 404);
});

test("returns submitted voucher details including the employee signature", async (t) => {
  const originalFindOne = Voucher.findOne;
  t.after(() => {
    Voucher.findOne = originalFindOne;
  });

  const submittedVoucher = {
    _id: "submitted-voucher-id",
    status: "Submitted",
    employeeName: "Test Employee",
    employeeId: "EMP-7",
    employeeSignature: testSignature,
    department: "IT",
    title: "Travel",
    category: "Travel",
    amount: 125,
  };
  Voucher.findOne = async () => submittedVoucher;

  const res = makeResponse();
  await controller.getVoucherById(
    {
      params: { id: "submitted-voucher-id" },
      user: { _id: "director-id", role: "director" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.voucher.status, "Submitted");
  assert.equal(res.body.voucher.employeeSignature, testSignature);
  assert.equal(res.body.voucher.employeeName, "Test Employee");
});

test("populates Director identity in voucher details", async (t) => {
  const originalFindOne = Voucher.findOne;
  t.after(() => {
    Voucher.findOne = originalFindOne;
  });

  const voucher = {
    _id: "processed-voucher-id",
    director: "director-id",
    status: "Rejected",
    populate: async (path, select) => {
      assert.equal(path, "director");
      assert.equal(select, "name role");
      voucher.director = { name: "Test Director", role: "director" };
      return voucher;
    },
  };
  Voucher.findOne = async () => voucher;

  const res = makeResponse();
  await controller.getVoucherById(
    {
      params: { id: "processed-voucher-id" },
      user: { _id: "director-id", role: "director" },
    },
    res
  );

  assert.deepEqual(res.body.voucher.director, {
    name: "Test Director",
    role: "director",
  });
});

test("returns rejection details to the owning Employee", async (t) => {
  const originalFindOne = Voucher.findOne;
  t.after(() => {
    Voucher.findOne = originalFindOne;
  });

  const rejectedVoucher = {
    _id: "rejected-voucher-id",
    employee: "employee-a-id",
    status: "Rejected",
    employeeSignature: testSignature,
    rejectionReason: "Receipt is missing",
  };
  let appliedFilter;
  Voucher.findOne = async (filter) => {
    appliedFilter = filter;
    return rejectedVoucher;
  };

  const res = makeResponse();
  await controller.getVoucherById(
    {
      params: { id: "rejected-voucher-id" },
      user: { _id: "employee-a-id", role: "employee" },
    },
    res
  );

  assert.deepEqual(appliedFilter, {
    _id: "rejected-voucher-id",
    employee: "employee-a-id",
  });
  assert.equal(res.body.voucher.status, "Rejected");
  assert.equal(res.body.voucher.rejectionReason, "Receipt is missing");
  assert.equal(res.body.voucher.employeeSignature, testSignature);
});

test("requires a saved employee signature before submission", async (t) => {
  const originalFindOne = Voucher.findOne;
  t.after(() => {
    Voucher.findOne = originalFindOne;
  });
  Voucher.findOne = async () => ({
    _id: "voucher-id",
    status: "Draft",
    employeeSignature: "",
  });

  const res = makeResponse();
  await controller.submitVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /signature/i);
});

test("rejects a signed draft with incomplete required data", async (t) => {
  const originals = {
    findOne: Voucher.findOne,
    findOneAndUpdate: Voucher.findOneAndUpdate,
  };
  t.after(() => Object.assign(Voucher, originals));

  Voucher.findOne = async () => ({
    _id: "voucher-id",
    status: "Draft",
    employeeSignature: testSignature,
    expenseDate: new Date("2026-10-21T00:00:00.000Z"),
    department: "IT",
    title: "Travel",
    category: "",
    amount: 125,
  });
  Voucher.findOneAndUpdate = async () => {
    throw new Error("Incomplete vouchers must not be submitted");
  };

  const res = makeResponse();
  await controller.submitVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /category/i);
});

test("submits a signed Draft only through an atomic Draft-to-Submitted transition", async (t) => {
  const originals = {
    findOne: Voucher.findOne,
    findOneAndUpdate: Voucher.findOneAndUpdate,
  };
  t.after(() => Object.assign(Voucher, originals));

  let transitionFilter;
  let transitionUpdate;
  let lookupFilter;
  Voucher.findOne = async (filter) => {
    lookupFilter = filter;
    return {
      _id: "voucher-id",
      status: "Draft",
      employeeSignature: testSignature,
      expenseDate: new Date("2026-10-21T00:00:00.000Z"),
      department: "IT",
      title: "Travel",
      category: "Travel",
      amount: 125,
    };
  };
  Voucher.findOneAndUpdate = async (filter, update) => {
    transitionFilter = filter;
    transitionUpdate = update;
    return { _id: "voucher-id", status: "Submitted" };
  };

  const res = makeResponse();
  await controller.submitVoucher(
    {
      params: { id: "voucher-id" },
      user: { _id: "employee-id" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(lookupFilter, {
    _id: "voucher-id",
    employee: "employee-id",
  });
  assert.equal(transitionFilter._id, "voucher-id");
  assert.equal(transitionFilter.employee, "employee-id");
  assert.equal(transitionFilter.status, "Draft");
  assert.equal(transitionFilter.employeeSignature, testSignature);
  assert.equal(transitionFilter.department, "IT");
  assert.equal(transitionFilter.title, "Travel");
  assert.equal(transitionFilter.category, "Travel");
  assert.equal(transitionFilter.amount, 125);
  assert.equal(transitionUpdate.$set.status, "Submitted");
  assert.ok(transitionUpdate.$set.submittedAt instanceof Date);
  assert.deepEqual(Object.keys(transitionUpdate.$set).sort(), [
    "status",
    "submittedAt",
  ]);
});

test("requires a Director signature and a meaningful rejection reason", async () => {
  const approvalResponse = makeResponse();
  await controller.approveVoucher(
    { params: { id: "voucher-id" }, body: {}, user: { _id: "director-id" } },
    approvalResponse
  );
  assert.equal(approvalResponse.statusCode, 400);
  assert.match(approvalResponse.body.message, /signature/i);

  const invalidSignatureResponse = makeResponse();
  await controller.approveVoucher(
    {
      params: { id: "voucher-id" },
      body: { directorSignature: "not-an-image" },
      user: { _id: "director-id" },
    },
    invalidSignatureResponse
  );
  assert.equal(invalidSignatureResponse.statusCode, 400);

  const rejectionResponse = makeResponse();
  await controller.rejectVoucher(
    {
      params: { id: "voucher-id" },
      body: { rejectionReason: " no " },
      user: { _id: "director-id" },
    },
    rejectionResponse
  );
  assert.equal(rejectionResponse.statusCode, 400);
  assert.match(rejectionResponse.body.message, /reason/i);

  const blankRejectionResponse = makeResponse();
  await controller.rejectVoucher(
    {
      params: { id: "voucher-id" },
      body: { rejectionReason: "    " },
      user: { _id: "director-id" },
    },
    blankRejectionResponse
  );
  assert.equal(blankRejectionResponse.statusCode, 400);
});

test("approves only Submitted vouchers and records Director and approval date", async (t) => {
  const originalFindOneAndUpdate = Voucher.findOneAndUpdate;
  t.after(() => {
    Voucher.findOneAndUpdate = originalFindOneAndUpdate;
  });

  let transitionFilter;
  let transitionUpdate;
  Voucher.findOneAndUpdate = async (filter, update) => {
    transitionFilter = filter;
    transitionUpdate = update;
    return { _id: "voucher-id", status: "Approved" };
  };

  const res = makeResponse();
  await controller.approveVoucher(
    {
      params: { id: "voucher-id" },
      body: { directorSignature: testSignature },
      user: { _id: "director-id" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(transitionFilter, { _id: "voucher-id", status: "Submitted" });
  assert.equal(transitionUpdate.$set.status, "Approved");
  assert.equal(transitionUpdate.$set.director, "director-id");
  assert.equal(transitionUpdate.$set.directorSignature, testSignature);
  assert.ok(transitionUpdate.$set.approvalDate instanceof Date);
  assert.deepEqual(Object.keys(transitionUpdate.$set).sort(), [
    "approvalDate",
    "director",
    "directorSignature",
    "status",
  ]);
});

test("rejects repeated approval and records a meaningful rejection reason", async (t) => {
  const originalFindOneAndUpdate = Voucher.findOneAndUpdate;
  t.after(() => {
    Voucher.findOneAndUpdate = originalFindOneAndUpdate;
  });

  let transitionUpdate;
  Voucher.findOneAndUpdate = async (_filter, update) => {
    transitionUpdate = update;
    return null;
  };

  const repeatedApprovalResponse = makeResponse();
  await controller.approveVoucher(
    {
      params: { id: "voucher-id" },
      body: { directorSignature: testSignature },
      user: { _id: "director-id" },
    },
    repeatedApprovalResponse
  );
  assert.equal(repeatedApprovalResponse.statusCode, 409);

  Voucher.findOneAndUpdate = async (_filter, update) => {
    transitionUpdate = update;
    return { _id: "voucher-id", status: "Rejected" };
  };
  const rejectionResponse = makeResponse();
  await controller.rejectVoucher(
    {
      params: { id: "voucher-id" },
      body: { rejectionReason: "Receipt is missing" },
      user: { _id: "director-id" },
    },
    rejectionResponse
  );

  assert.equal(rejectionResponse.statusCode, 200);
  assert.equal(transitionUpdate.$set.status, "Rejected");
  assert.equal(transitionUpdate.$set.director, "director-id");
  assert.equal(transitionUpdate.$set.rejectionReason, "Receipt is missing");
  assert.deepEqual(Object.keys(transitionUpdate.$set).sort(), [
    "director",
    "rejectionReason",
    "status",
  ]);
});

test("rejects approval and rejection when a voucher is not Submitted", async (t) => {
  const originalFindOneAndUpdate = Voucher.findOneAndUpdate;
  t.after(() => {
    Voucher.findOneAndUpdate = originalFindOneAndUpdate;
  });

  const transitionFilters = [];
  Voucher.findOneAndUpdate = async (filter) => {
    transitionFilters.push(filter);
    return null;
  };

  const approvalResponse = makeResponse();
  await controller.approveVoucher(
    {
      params: { id: "draft-or-processed-voucher" },
      body: { directorSignature: testSignature },
      user: { _id: "director-id" },
    },
    approvalResponse
  );
  assert.equal(approvalResponse.statusCode, 409);

  const rejectionResponse = makeResponse();
  await controller.rejectVoucher(
    {
      params: { id: "draft-or-processed-voucher" },
      body: { rejectionReason: "Valid rejection reason" },
      user: { _id: "director-id" },
    },
    rejectionResponse
  );
  assert.equal(rejectionResponse.statusCode, 409);
  assert.deepEqual(transitionFilters, [
    { _id: "draft-or-processed-voucher", status: "Submitted" },
    { _id: "draft-or-processed-voucher", status: "Submitted" },
  ]);
});

test("applies safe employee-scoped filters and pagination", async (t) => {
  const originals = {
    find: Voucher.find,
    countDocuments: Voucher.countDocuments,
  };
  t.after(() => Object.assign(Voucher, originals));

  const query = mockListQuery();
  let appliedFilter;
  Voucher.find = (filter) => {
    appliedFilter = filter;
    return query;
  };
  Voucher.countDocuments = async () => 0;

  const res = makeResponse();
  await controller.getMyVouchers(
    {
      user: { _id: "employee-id" },
      query: {
        search: "EV.*",
        status: "Draft",
        department: "Research",
        minAmount: "10",
        maxAmount: "500",
        from: "2026-10-01",
        to: "2026-10-31",
        sort: "amount",
        order: "asc",
        page: "2",
        limit: "25",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(appliedFilter.employee, "employee-id");
  assert.equal(appliedFilter.status, "Draft");
  assert.equal(String(appliedFilter.department), "/^Research$/i");
  assert.equal(appliedFilter.$and[0].$or[0].voucherNumber.source, "EV\\.\\*");
  assert.equal(query.sortValue.amount, 1);
  assert.equal(query.skipValue, 25);
  assert.equal(query.limitValue, 25);
});

test("rejects unsupported statuses and malformed amount filters", async () => {
  for (const query of [
    { status: "ApprovedByClient" },
    { minAmount: "NaN" },
    { minAmount: "100", maxAmount: "10" },
    { from: "2026-02-31" },
    { to: "not-a-date" },
  ]) {
    const res = makeResponse();
    await controller.getAllVouchers({ query }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }
});

test("returns role-scoped dashboard statistics and counts expenditure only when Approved", async (t) => {
  const originalAggregate = Voucher.aggregate;
  t.after(() => {
    Voucher.aggregate = originalAggregate;
  });

  const pipelines = [];
  Voucher.aggregate = async (value) => {
    pipelines.push(value);
    return value.some((stage) => stage.$group?.total)
      ? [expectedStats]
      : [{ _id: "2026-10", amount: 75, count: 2 }];
  };

  const directorResponse = makeResponse();
  await controller.getDashboardStats(
    { user: { role: "director", _id: "director-id" } },
    directorResponse
  );

  assert.deepEqual(pipelines[0][0], { $match: {} });
  assert.deepEqual(pipelines[0][1].$group, {
    _id: null,
    total: { $sum: 1 },
    drafts: { $sum: { $cond: [{ $eq: ["$status", "Draft"] }, 1, 0] } },
    submitted: {
      $sum: { $cond: [{ $eq: ["$status", "Submitted"] }, 1, 0] },
    },
    approved: {
      $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] },
    },
    rejected: {
      $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] },
    },
    approvedAmount: {
      $sum: {
        $cond: [{ $eq: ["$status", "Approved"] }, "$amount", 0],
      },
    },
  });
  assert.deepEqual(pipelines[1][0].$match, {
    expenseDate: pipelines[1][0].$match.expenseDate,
  });
  assert.ok(pipelines[1][0].$match.expenseDate.$gte instanceof Date);
  assert.ok(pipelines[1][0].$match.expenseDate.$lt instanceof Date);
  assert.deepEqual(pipelines[1][1].$group, {
    _id: {
      $dateToString: {
        format: "%Y-%m",
        date: "$expenseDate",
        timezone: "UTC",
      },
    },
    amount: { $sum: "$amount" },
    count: { $sum: 1 },
  });
  assert.deepEqual(directorResponse.body.stats, expectedStats);

  pipelines.length = 0;
  const employeeResponse = makeResponse();
  await controller.getDashboardStats(
    { user: { role: "employee", _id: "employee-id" } },
    employeeResponse
  );
  assert.deepEqual(pipelines[0][0], { $match: { employee: "employee-id" } });
  assert.deepEqual(pipelines[1][0].$match.employee, "employee-id");
  assert.deepEqual(employeeResponse.body.stats, expectedStats);
});
