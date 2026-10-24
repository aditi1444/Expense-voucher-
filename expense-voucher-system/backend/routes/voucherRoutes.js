const express = require("express");

const {
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
} = require("../controllers/voucherController");

const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/dashboard/stats", getDashboardStats);

router.get("/pending", authorize("director"), getPendingVouchers);
router.get("/my-vouchers", authorize("employee"), getMyVouchers);
router.get("/my-vouchers/:id", authorize("employee"), getVoucherById);

router.get("/", authorize("director", "accounts"), getAllVouchers);
router.get("/:id", authorize("director", "accounts"), getVoucherById);

router.post("/", authorize("employee"), createVoucher);
router.patch("/:id", authorize("employee"), updateDraftVoucher);
router.delete("/:id", authorize("employee"), deleteDraftVoucher);
router.patch("/:id/submit", authorize("employee"), submitVoucher);

router.patch("/:id/approve", authorize("director"), approveVoucher);
router.patch("/:id/reject", authorize("director"), rejectVoucher);

module.exports = router;
