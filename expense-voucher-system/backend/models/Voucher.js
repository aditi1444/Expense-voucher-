const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema(
  {
    // Automatically generated unique voucher number
    voucherNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },

    // Employee who created the voucher
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    employeeName: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    employeeId: {
      type: String,
      trim: true,
      default: "",
      immutable: true,
    },

    // Voucher information
    voucherDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    expenseDate: {
      type: Date,
      required: [true, "Expense date is required"],
    },

    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
      maxlength: 100,
    },

    title: {
      type: String,
      required: [true, "Expense title is required"],
      trim: true,
      maxlength: 150,
    },

    category: {
      type: String,
      required: [true, "Expense category is required"],
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0.01, "Amount must be greater than zero"],
    },

    // Employee signature file reference
    employeeSignature: {
      type: String,
      default: "",
    },

    // Draft -> Submitted -> Approved or Rejected
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Draft",
      required: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    // Director approval information
    director: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    directorSignature: {
      type: String,
      default: "",
    },

    approvalDate: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Generate a voucher number automatically before saving a new voucher
voucherSchema.pre("validate", async function () {
  if (!this.isNew || this.voucherNumber) {
    return;
  }

  this.voucherNumber =
    `EV-${Date.now()}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`;
});

// Validate fields required for submission
voucherSchema.pre("validate", function () {
  if (this.status !== "Draft" && !this.employeeSignature) {
    this.invalidate(
      "employeeSignature",
      "Employee signature is required before submission."
    );
  }

  if (this.status === "Rejected" && !this.rejectionReason?.trim()) {
    this.invalidate(
      "rejectionReason",
      "A rejection reason is required."
    );
  }

  if (this.status === "Approved" && !this.directorSignature) {
    this.invalidate(
      "directorSignature",
      "Director signature is required before approval."
    );
  }

  if (
    (this.status === "Approved" || this.status === "Rejected") &&
    !this.director
  ) {
    this.invalidate("director", "Director identity is required to process a voucher.");
  }

  if (this.status === "Approved" && !this.approvalDate) {
    this.approvalDate = new Date();
  }
});

module.exports = mongoose.model("Voucher", voucherSchema);