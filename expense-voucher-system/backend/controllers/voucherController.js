const Voucher = require("../models/Voucher");

const statuses = ["Draft", "Submitted", "Approved", "Rejected"];
const signatureLimitBytes = 400 * 1024;
const editableFields = [
  "voucherDate",
  "expenseDate",
  "department",
  "title",
  "category",
  "description",
  "amount",
];
const sortableFields = new Set([
  "voucherNumber",
  "voucherDate",
  "expenseDate",
  "employeeName",
  "department",
  "category",
  "amount",
  "status",
  "createdAt",
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidSignature(signature) {
  if (typeof signature !== "string" || signature.length > 550_000) {
    return false;
  }

  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    signature
  );

  if (!match) {
    return false;
  }

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > signatureLimitBytes) {
    return false;
  }

  if (match[1] === "png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
  }

  if (match[1] === "jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function parseFilters(query) {
  const filter = {};
  const conditions = [];

  if (query.status) {
    if (!statuses.includes(query.status)) {
      return { error: "Invalid voucher status filter." };
    }
    filter.status = query.status;
  }

  if (query.sort && !sortableFields.has(String(query.sort))) {
    return { error: "Unsupported sort field." };
  }
  if (query.order && !["asc", "desc"].includes(String(query.order))) {
    return { error: "Sort order must be asc or desc." };
  }

  for (const field of ["department", "category"]) {
    if (query[field]) {
      filter[field] = new RegExp(`^${escapeRegex(String(query[field]).trim())}$`, "i");
    }
  }

  if (query.employee) {
    const employeePattern = new RegExp(
      escapeRegex(String(query.employee).trim()),
      "i"
    );
    conditions.push({
      $or: [
        { employeeName: employeePattern },
        { employeeId: employeePattern },
      ],
    });
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegex(String(query.search).trim()), "i");
    conditions.push({
      $or: [
        { voucherNumber: pattern },
        { title: pattern },
        { employeeName: pattern },
        { employeeId: pattern },
        { department: pattern },
        { category: pattern },
        { description: pattern },
      ],
    });
  }

  if (query.from || query.to) {
    const dateFilter = {};
    if (query.from) {
      if (!isValidDateOnly(query.from)) {
        return { error: "Invalid start date filter." };
      }
      const from = new Date(`${query.from}T00:00:00.000Z`);
      dateFilter.$gte = from;
    }
    if (query.to) {
      if (!isValidDateOnly(query.to)) {
        return { error: "Invalid end date filter." };
      }
      const to = new Date(`${query.to}T23:59:59.999Z`);
      dateFilter.$lte = to;
    }
    if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
      return { error: "Start date must not be after end date." };
    }
    filter.expenseDate = dateFilter;
  }

  const amountFilter = {};
  for (const [queryField, mongoOperator] of [
    ["minAmount", "$gte"],
    ["maxAmount", "$lte"],
  ]) {
    if (query[queryField] !== undefined && query[queryField] !== "") {
      const value = Number(query[queryField]);
      if (!Number.isFinite(value) || value < 0) {
        return { error: `Invalid ${queryField} filter.` };
      }
      amountFilter[mongoOperator] = value;
    }
  }
  if (
    amountFilter.$gte !== undefined &&
    amountFilter.$lte !== undefined &&
    amountFilter.$gte > amountFilter.$lte
  ) {
    return { error: "Minimum amount must not exceed maximum amount." };
  }
  if (Object.keys(amountFilter).length) {
    filter.amount = amountFilter;
  }

  if (conditions.length) {
    filter.$and = conditions;
  }

  const requestedSort = String(query.sort || "createdAt");
  const sortBy = requestedSort;
  const sortOrder = query.order === "asc" ? 1 : -1;
  const pageInput = query.page === undefined ? "1" : String(query.page);
  const limitInput = query.limit === undefined ? "100" : String(query.limit);
  if (!/^[1-9]\d*$/.test(pageInput) || !/^[1-9]\d*$/.test(limitInput)) {
    return { error: "Page and limit must be positive whole numbers." };
  }
  const page = Number(pageInput);
  const requestedLimit = Number(limitInput);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(requestedLimit)) {
    return { error: "Page and limit are outside the supported range." };
  }
  const limit = Math.min(100, requestedLimit);

  return {
    filter,
    sort: { [sortBy]: sortOrder },
    page,
    limit,
  };
}

async function sendVoucherList(req, res, baseFilter = {}) {
  const parsed = parseFilters(req.query);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  const filter = { ...parsed.filter, ...baseFilter };
  const [vouchers, total] = await Promise.all([
    Voucher.find(filter)
      .sort(parsed.sort)
      .skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit),
    Voucher.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    count: vouchers.length,
    total,
    page: parsed.page,
    pages: Math.ceil(total / parsed.limit),
    vouchers,
  });
}

async function getDashboardStats(req, res) {
  const filter = req.user.role === "employee"
    ? { employee: req.user._id }
    : {};
  const currentMonth = new Date();
  const chartStart = new Date(
    Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5, 1)
  );
  const [[summary = {}], monthlyExpenses] = await Promise.all([
    Voucher.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          drafts: { $sum: { $cond: [{ $eq: ["$status", "Draft"] }, 1, 0] } },
          submitted: {
            $sum: { $cond: [{ $eq: ["$status", "Submitted"] }, 1, 0] },
          },
          approved: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] } },
          approvedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "Approved"] }, "$amount", 0],
            },
          },
        },
      },
    ]),
    Voucher.aggregate([
      {
        $match: {
          ...filter,
          expenseDate: { $gte: chartStart, $lt: new Date(Date.UTC(
            currentMonth.getUTCFullYear(),
            currentMonth.getUTCMonth() + 1,
            1
          )) },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m",
              date: "$expenseDate",
              timezone: "UTC",
            },
          },
          amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return res.status(200).json({
    success: true,
    stats: {
      total: summary.total || 0,
      drafts: summary.drafts || 0,
      submitted: summary.submitted || 0,
      approved: summary.approved || 0,
      rejected: summary.rejected || 0,
      approvedAmount: summary.approvedAmount || 0,
      monthlyExpenses: monthlyExpenses.map((month) => ({
        month: month._id,
        amount: month.amount,
        count: month.count,
      })),
    },
  });
}

const createVoucher = async (req, res) => {
  try {
    const {
      voucherDate,
      expenseDate,
      department,
      title,
      category,
      description,
      amount,
      employeeSignature,
    } = req.body || {};

    if (
      typeof department !== "string" ||
      typeof title !== "string" ||
      typeof category !== "string" ||
      (description !== undefined && typeof description !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Department, title, category, and description must be text.",
      });
    }

    if (
      !isValidDateOnly(expenseDate) ||
      !department.trim() ||
      !title.trim() ||
      !category.trim() ||
      amount === undefined ||
      amount === null ||
      amount === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Expense date, department, title, category, and amount are required.",
      });
    }

    if (voucherDate !== undefined && !isValidDateOnly(voucherDate)) {
      return res.status(400).json({
        success: false,
        message: "Voucher date must be a valid calendar date.",
      });
    }

    const numericAmount =
      typeof amount === "number"
        ? amount
        : typeof amount === "string" && amount.trim()
          ? Number(amount)
          : Number.NaN;
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number greater than zero.",
      });
    }

    if (
      employeeSignature &&
      !isValidSignature(employeeSignature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Signature must be a PNG, JPEG, or WebP image no larger than 400 KB.",
      });
    }

    const voucher = await Voucher.create({
      employee: req.user._id,
      employeeName: req.user.name,
      employeeId: req.user.employeeId || "",
      voucherDate: voucherDate || new Date(),
      expenseDate,
      department: department.trim(),
      title: title.trim(),
      category: category.trim(),
      description: String(description || "").trim(),
      amount: numericAmount,
      employeeSignature: employeeSignature || "",
      status: "Draft",
    });

    return res.status(201).json({
      success: true,
      message: "Voucher saved as draft successfully.",
      voucher,
    });
  } catch (error) {
    console.error("Create voucher error:", error.message);
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to create voucher.",
    });
  }
};

const getMyVouchers = async (req, res) => {
  try {
    return await sendVoucherList(req, res, { employee: req.user._id });
  } catch (error) {
    console.error("Get my vouchers error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your vouchers.",
    });
  }
};

const getAllVouchers = async (req, res) => {
  try {
    return await sendVoucherList(req, res);
  } catch (error) {
    console.error("Get vouchers error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve vouchers.",
    });
  }
};

const getPendingVouchers = async (req, res) => {
  try {
    return await sendVoucherList(req, res, { status: "Submitted" });
  } catch (error) {
    console.error("Get pending vouchers error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve pending vouchers.",
    });
  }
};

const getVoucherById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "employee") {
      filter.employee = req.user._id;
    }
    const voucher = await Voucher.findOne(filter);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found.",
      });
    }
    if (voucher.director && typeof voucher.populate === "function") {
      await voucher.populate("director", "name role");
    }

    return res.status(200).json({ success: true, voucher });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid voucher ID.",
      });
    }
    console.error("Get voucher details error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve voucher details.",
    });
  }
};

const updateDraftVoucher = async (req, res) => {
  try {
    if (
      (req.body?.department !== undefined &&
        typeof req.body.department !== "string") ||
      (req.body?.title !== undefined && typeof req.body.title !== "string") ||
      (req.body?.category !== undefined &&
        typeof req.body.category !== "string") ||
      (req.body?.description !== undefined &&
        typeof req.body.description !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Department, title, category, and description must be text.",
      });
    }
    for (const field of ["voucherDate", "expenseDate"]) {
      if (
        req.body?.[field] !== undefined &&
        !isValidDateOnly(req.body[field])
      ) {
        return res.status(400).json({
          success: false,
          message: `${field === "voucherDate" ? "Voucher" : "Expense"} date must be a valid calendar date.`,
        });
      }
    }
    if (
      req.body?.amount !== undefined &&
      typeof req.body.amount !== "number" &&
      (typeof req.body.amount !== "string" || !req.body.amount.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number greater than zero.",
      });
    }
    if (req.body?.amount !== undefined) {
      const amount =
        typeof req.body.amount === "number"
          ? req.body.amount
          : Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount must be a valid number greater than zero.",
        });
      }
      req.body.amount = amount;
    }

    const updates = {};
    for (const field of editableFields) {
      if (req.body?.[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (req.body?.employeeSignature !== undefined) {
      if (
        req.body.employeeSignature &&
        !isValidSignature(req.body.employeeSignature)
      ) {
        return res.status(400).json({
          success: false,
          message: "Signature must be a PNG, JPEG, or WebP image no larger than 400 KB.",
        });
      }
      updates.employeeSignature = req.body.employeeSignature || "";
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one editable voucher field.",
      });
    }

    const voucher = await Voucher.findOneAndUpdate(
      {
        _id: req.params.id,
        employee: req.user._id,
        status: "Draft",
      },
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );

    if (!voucher) {
      const existingVoucher = await Voucher.findOne({
        _id: req.params.id,
        employee: req.user._id,
      }).select("status");

      if (!existingVoucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found.",
        });
      }
      return res.status(403).json({
        success: false,
        message: "Only draft vouchers can be edited.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Draft voucher updated successfully.",
      voucher,
    });
  } catch (error) {
    console.error("Update draft voucher error:", error.message);
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.name === "CastError" ? "Invalid voucher ID or field value." : error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Unable to update draft voucher.",
    });
  }
};

const deleteDraftVoucher = async (req, res) => {
  try {
    const result = await Voucher.deleteOne({
      _id: req.params.id,
      employee: req.user._id,
      status: "Draft",
    });

    if (result.deletedCount === 0) {
      const existingVoucher = await Voucher.findOne({
        _id: req.params.id,
        employee: req.user._id,
      }).select("status");

      if (!existingVoucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found.",
        });
      }
      return res.status(403).json({
        success: false,
        message: "Only draft vouchers can be deleted.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Draft voucher deleted successfully.",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid voucher ID.",
      });
    }
    console.error("Delete draft voucher error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to delete draft voucher.",
    });
  }
};

const submitVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findOne({
      _id: req.params.id,
      employee: req.user._id,
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found.",
      });
    }
    if (voucher.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message: "Only draft vouchers can be submitted.",
      });
    }
    if (!voucher.employeeSignature || !isValidSignature(voucher.employeeSignature)) {
      return res.status(400).json({
        success: false,
        message: "A valid employee signature is required before submitting.",
      });
    }
    if (
      !voucher.expenseDate ||
      Number.isNaN(new Date(voucher.expenseDate).getTime()) ||
      !voucher.department?.trim() ||
      !voucher.title?.trim() ||
      !voucher.category?.trim() ||
      !Number.isFinite(Number(voucher.amount)) ||
      Number(voucher.amount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete the expense date, department, title, category, and positive amount before submitting.",
      });
    }

    const submittedAt = new Date();
    const updated = await Voucher.findOneAndUpdate(
      {
        _id: voucher._id,
        employee: req.user._id,
        status: "Draft",
        employeeSignature: voucher.employeeSignature,
        expenseDate: voucher.expenseDate,
        department: voucher.department,
        title: voucher.title,
        category: voucher.category,
        amount: voucher.amount,
      },
      { $set: { status: "Submitted", submittedAt } },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Voucher status changed. Refresh and try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Voucher submitted for Director approval.",
      voucher: updated,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid voucher ID.",
      });
    }
    console.error("Submit voucher error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to submit voucher.",
    });
  }
};

const approveVoucher = async (req, res) => {
  const { directorSignature } = req.body || {};
  if (!isValidSignature(directorSignature)) {
    return res.status(400).json({
      success: false,
      message: "A valid Director signature is required to approve this voucher.",
    });
  }

  try {
    const voucher = await Voucher.findOneAndUpdate(
      { _id: req.params.id, status: "Submitted" },
      {
        $set: {
          status: "Approved",
          director: req.user._id,
          directorSignature,
          approvalDate: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!voucher) {
      return res.status(409).json({
        success: false,
        message: "Only a submitted voucher can be approved. Refresh the list.",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Voucher approved successfully.",
      voucher,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid voucher ID.",
      });
    }
    console.error("Approve voucher error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to approve voucher.",
    });
  }
};

const rejectVoucher = async (req, res) => {
  const submittedReason = req.body?.rejectionReason;
  if (typeof submittedReason !== "string") {
    return res.status(400).json({
      success: false,
      message: "A rejection reason is required.",
    });
  }
  const reason = submittedReason.trim();
  if (reason.length < 5 || reason.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Enter a rejection reason between 5 and 1000 characters.",
    });
  }

  try {
    const voucher = await Voucher.findOneAndUpdate(
      { _id: req.params.id, status: "Submitted" },
      {
        $set: {
          status: "Rejected",
          director: req.user._id,
          rejectionReason: reason,
        },
      },
      { returnDocument: "after", runValidators: true }
    );
    if (!voucher) {
      return res.status(409).json({
        success: false,
        message: "Only a submitted voucher can be rejected. Refresh the list.",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Voucher rejected successfully.",
      voucher,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid voucher ID.",
      });
    }
    console.error("Reject voucher error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to reject voucher.",
    });
  }
};

module.exports = {
  createVoucher,
  getMyVouchers,
  getAllVouchers,
  getPendingVouchers,
  getVoucherById,
  getDashboardStats,
  updateDraftVoucher,
  deleteDraftVoucher,
  submitVoucher,
  approveVoucher,
  rejectVoucher,
};
