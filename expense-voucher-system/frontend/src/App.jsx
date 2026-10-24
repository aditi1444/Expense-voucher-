import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const API_CONNECTION_ERROR =
  `Cannot reach the API at ${API_URL}. Start the backend and check its CLIENT_URL CORS setting.`;
const initialStats = {
  total: 0,
  drafts: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  approvedAmount: 0,
};

async function fetchApi(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(API_CONNECTION_ERROR);
  }
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN");
}

function SignaturePad({ value, onChange, label }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  function point(event) {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  function startDrawing(event) {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const position = point(event);
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#172033";
  }

  function draw(event) {
    if (!drawing.current) return;
    const context = canvasRef.current.getContext("2d");
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function finishDrawing() {
    if (!drawing.current) return;
    drawing.current = false;
    const context = canvasRef.current.getContext("2d");
    const pixels = context.getImageData(
      0,
      0,
      canvasRef.current.width,
      canvasRef.current.height
    ).data;
    let hasInk = false;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) {
        hasInk = true;
        break;
      }
    }
    if (!hasInk) return;
    onChange(canvasRef.current.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-field">
      <div className="signature-label-row">
        <label>{label}</label>
        <button className="text-button" type="button" onClick={clearSignature}>
          Clear signature
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        width="700"
        height="160"
        aria-label={`${label}, draw your signature here`}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      />
      <small className="muted">Draw using a mouse, stylus, or touch screen.</small>
    </div>
  );
}

function SignatureImage({ source, label }) {
  if (!source) return <span className="signature-unavailable">Not available</span>;
  return <img className="signature-image" src={source} alt={label} />;
}

function DashboardIcon({ name }) {
  const paths = {
    draft: <><path d="M8 3h8l5 5v13H8z" /><path d="M16 3v5h5M11 13h7M11 17h5" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    approved: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    rejected: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    amount: <><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function EmployeeDashboardOverview({
  stats,
  recentVouchers,
  loading,
  activeStatus,
  onSelectStatus,
  onOpenVoucher,
}) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
    };
  });
  const monthlyAmounts = new Map(
    (stats.monthlyExpenses || []).map((month) => [month.month, month.amount])
  );
  const chartData = months.map((month) => ({
    ...month,
    amount: Number(monthlyAmounts.get(month.key)) || 0,
  }));
  const maxAmount = Math.max(...chartData.map((month) => month.amount), 0);
  const hasMonthlyData = chartData.some((month) => month.amount > 0);
  const statCards = [
    { label: "Drafts", value: stats.drafts, detail: "Saved for later", status: "Draft", icon: "draft", tone: "lavender" },
    { label: "Pending approval", value: stats.submitted, detail: "With your approver", status: "Submitted", icon: "pending", tone: "amber" },
    { label: "Approved", value: stats.approved, detail: "Ready for records", status: "Approved", icon: "approved", tone: "green" },
    { label: "Rejected", value: stats.rejected, detail: "Review the feedback", status: "Rejected", icon: "rejected", tone: "rose" },
    { label: "Approved expenses", value: currency(stats.approvedAmount), detail: "Approved vouchers only", status: "Approved", icon: "amount", tone: "purple", emphasis: true },
  ];

  return (
    <>
      <section className="employee-stats-grid" aria-label="Your voucher statistics">
        {statCards.map((card) => (
          <button
            className={`employee-stat-card ${card.tone}${card.emphasis ? " expense-stat-card" : ""}`}
            key={card.label}
            type="button"
            aria-pressed={activeStatus === card.status}
            onClick={() => onSelectStatus(card.status)}
          >
            <span className="employee-stat-icon"><DashboardIcon name={card.icon} /></span>
            <span className="employee-stat-copy">
              <span className="employee-stat-label">{card.label}</span>
              <strong>{card.value}</strong>
              <span className="employee-stat-detail">{card.detail}</span>
            </span>
            <span className="employee-stat-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </section>

      <section className="employee-insights-grid">
        <article className="employee-panel employee-chart-panel">
          <div className="employee-panel-heading">
            <div>
              <span className="employee-section-kicker">YOUR SPENDING</span>
              <h2>Monthly voucher amounts</h2>
              <p>Expense dates · all voucher statuses · last 6 months</p>
            </div>
            <span className="chart-period">6 months</span>
          </div>
          {loading && stats.total === 0 ? (
            <p className="employee-chart-empty" role="status">Loading your monthly expenses…</p>
          ) : hasMonthlyData ? (
            <div
              className="employee-chart"
              role="img"
              aria-label={`Monthly voucher amounts for the last six months: ${chartData.map((month) => `${month.label} ${currency(month.amount)}`).join(", ")}`}
            >
              {chartData.map((month) => {
                const height = maxAmount ? (month.amount / maxAmount) * 100 : 0;
                return (
                  <div className="employee-chart-column" key={month.key}
                    aria-label={`${month.label}: ${currency(month.amount)}`}>
                    <span className="employee-chart-value">{month.amount ? currency(month.amount) : ""}</span>
                    <div className="employee-chart-track">
                      <span className="employee-chart-bar" style={{ height: `${height}%` }} />
                    </div>
                    <span className="employee-chart-month">{month.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="employee-chart-empty">No voucher expenses recorded in the last six months.</p>
          )}
        </article>

        <article className="employee-panel employee-workflow-panel">
          <div className="employee-panel-heading">
            <div>
              <span className="employee-section-kicker">VOUCHER JOURNEY</span>
              <h2>Track your workflow</h2>
              <p>{stats.total} voucher{stats.total === 1 ? "" : "s"} across your account</p>
            </div>
          </div>
          <div className="employee-workflow">
            <div className="workflow-step">
              <span className="workflow-step-dot draft-dot"><DashboardIcon name="draft" /></span>
              <span><strong>Draft</strong><small>{stats.drafts} saved</small></span>
            </div>
            <span className="workflow-connector" aria-hidden="true" />
            <div className="workflow-step">
              <span className="workflow-step-dot pending-dot"><DashboardIcon name="pending" /></span>
              <span><strong>Submitted</strong><small>{stats.submitted} in review</small></span>
            </div>
            <span className="workflow-connector" aria-hidden="true" />
            <div className="workflow-outcomes">
              <div className="workflow-step">
                <span className="workflow-step-dot approved-dot"><DashboardIcon name="approved" /></span>
                <span><strong>Approved</strong><small>{stats.approved} complete</small></span>
              </div>
              <div className="workflow-step">
                <span className="workflow-step-dot rejected-dot"><DashboardIcon name="rejected" /></span>
                <span><strong>Rejected</strong><small>{stats.rejected} to review</small></span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="employee-panel employee-recent-panel">
        <div className="employee-panel-heading">
          <div>
            <span className="employee-section-kicker">LATEST ACTIVITY</span>
            <h2>Recently created vouchers</h2>
            <p>Your most recently saved vouchers, newest first.</p>
          </div>
        </div>
        {loading && recentVouchers.length === 0 ? (
          <p className="employee-recent-empty" role="status">Loading your recent vouchers…</p>
        ) : recentVouchers.length > 0 ? (
          <div className="employee-recent-grid">
            {recentVouchers.map((voucher) => (
              <article
                className={`employee-recent-card${voucher.status === "Rejected" ? " rejected-recent-card" : ""}`}
                key={voucher._id}
              >
                <div className="employee-recent-topline">
                  <span className={`status-badge ${voucher.status.toLowerCase()}`}>
                    {voucher.status === "Submitted" ? "Pending approval" : voucher.status}
                  </span>
                  <span>{formatDate(voucher.createdAt)}</span>
                </div>
                <h3>{voucher.title}</h3>
                <p className="employee-recent-number">{voucher.voucherNumber}</p>
                <div className="employee-recent-bottom">
                  <strong>{currency(voucher.amount)}</strong>
                  <button type="button" className="employee-view-link" onClick={() => onOpenVoucher(voucher)}>
                    View details <span aria-hidden="true">→</span>
                  </button>
                </div>
                {voucher.status === "Rejected" && (
                  <div className="employee-rejection-reason">
                    <strong>Reason for rejection</strong>
                    <p>{voucher.rejectionReason?.trim() || "No rejection reason was provided."}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="employee-recent-empty">No vouchers yet. Create a voucher to get started.</p>
        )}
      </section>
    </>
  );
}

function VoucherTable({
  vouchers,
  isEmployee,
  isDirector,
  loading,
  openVoucher,
  editVoucher,
  deleteVoucher,
  submitVoucher,
}) {
  if (vouchers.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">EV</div>
        <h3>No vouchers found</h3>
        <p>
          {isEmployee
            ? "Create your first voucher or change the filters."
            : "Try changing the filters or check back later."}
        </p>
      </div>
    );
  }

  return (
    <div className={`table-wrapper${isDirector ? " director-table" : ""}`} aria-busy={loading}>
      <table>
        <thead>
          <tr>
            <th>Voucher number</th>
            {!isEmployee && <th>Employee</th>}
            <th>Title</th>
            <th>Expense date</th>
            <th>Department</th>
            {isDirector && <th>Category</th>}
            <th>Amount</th>
            {isDirector && <th>Submitted</th>}
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((voucher) => (
            <tr
              key={voucher._id}
              className={isDirector && voucher.status === "Submitted" ? "submitted-row" : ""}
            >
              <td className="voucher-number">{voucher.voucherNumber}</td>
              {!isEmployee && (
                <td>
                  {voucher.employeeName}
                  <small className="table-subtext">{voucher.employeeId || "ID not provided"}</small>
                </td>
              )}
              <td><strong>{voucher.title}</strong></td>
              <td>{formatDate(voucher.expenseDate)}</td>
              <td>{voucher.department}</td>
              {isDirector && <td>{voucher.category}</td>}
              <td className="amount-cell">{currency(voucher.amount)}</td>
              {isDirector && <td>{voucher.submittedAt ? formatDate(voucher.submittedAt) : "Not recorded"}</td>}
              <td>
                <span className={`status-badge ${voucher.status.toLowerCase()}`}>
                  {voucher.status === "Submitted" ? "Pending approval" : voucher.status}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className={isDirector && voucher.status === "Submitted" ? "primary-button compact-button" : "text-button"}
                    disabled={loading}
                    onClick={() => openVoucher(voucher)}
                  >
                    {isDirector && voucher.status === "Submitted" ? "Review" : "View"}
                  </button>
                  {isEmployee && voucher.status === "Draft" && (
                    <>
                      <button className="text-button" disabled={loading} onClick={() => editVoucher(voucher)}>Edit</button>
                      <button className="text-button danger-text" disabled={loading} onClick={() => deleteVoucher(voucher)}>Delete</button>
                      <button className="text-button" disabled={loading} onClick={() => submitVoucher(voucher)}>Submit</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(
    () => localStorage.getItem("expenseVoucherToken") || ""
  );
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(Boolean(token));
  const [vouchers, setVouchers] = useState([]);
  const [recentVouchers, setRecentVouchers] = useState([]);
  const [pendingVouchers, setPendingVouchers] = useState([]);
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ total: 0, pages: 0 });
  const [pendingPageInfo, setPendingPageInfo] = useState({ total: 0, pages: 0 });
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [directorSignature, setDirectorSignature] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const directorActionInFlight = useRef(false);
  const voucherDocumentRef = useRef(null);
  const [filterDraft, setFilterDraft] = useState({
    search: "",
    status: "",
    employee: "",
    department: "",
    category: "",
    from: "",
    to: "",
    minAmount: "",
    maxAmount: "",
    sort: "createdAt",
    order: "desc",
  });
  const [filters, setFilters] = useState(filterDraft);
  const [form, setForm] = useState({
    voucherDate: today(),
    expenseDate: "",
    department: "",
    title: "",
    category: "",
    description: "",
    amount: "",
    employeeSignature: "",
  });

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const response = await fetchApi(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        const requestError = new Error(data.message || "Request failed.");
        requestError.status = response.status;
        throw requestError;
      }
      return data;
    },
    [token]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("expenseVoucherToken");
    localStorage.removeItem("expenseVoucherUser");
    setUser(null);
    setToken("");
    setVouchers([]);
    setRecentVouchers([]);
    setPendingVouchers([]);
    setPage(1);
    setPendingPage(1);
    setPageInfo({ total: 0, pages: 0 });
    setPendingPageInfo({ total: 0, pages: 0 });
    setStats(initialStats);
    setFilterDraft({ ...initialFilters });
    setFilters({ ...initialFilters });
    setShowForm(false);
    setSelectedVoucher(null);
    setForm({
      voucherDate: today(),
      expenseDate: "",
      department: "",
      title: "",
      category: "",
      description: "",
      amount: "",
      employeeSignature: "",
    });
    setError("");
    setSuccess("");
    setPassword("");
    setAuthChecking(false);
  }, []);

  const filterQuery = useCallback(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(page));
    params.set("limit", "25");
    return params.toString();
  }, [filters, page]);

  const loadDashboard = useCallback(async () => {
    if (!user || !token) return;
    setLoading(true);
    setError("");

    try {
      const suffix = filterQuery();
      const listPath = user.role === "employee" ? "/vouchers/my-vouchers" : "/vouchers";
      const query = suffix ? `?${suffix}` : "";
      const pendingParams = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (key !== "status" && value) pendingParams.set(key, value);
      }
      pendingParams.set("page", String(pendingPage));
      pendingParams.set("limit", "25");
      const [voucherData, statsData, pendingData, recentData] = await Promise.all([
        apiRequest(`${listPath}${query}`),
        apiRequest("/vouchers/dashboard/stats"),
        user.role === "director"
          ? apiRequest(`/vouchers/pending?${pendingParams.toString()}`)
          : Promise.resolve(null),
        user.role === "employee"
          ? apiRequest("/vouchers/my-vouchers?sort=createdAt&order=desc&page=1&limit=4")
          : Promise.resolve(null),
      ]);
      setVouchers(voucherData.vouchers || []);
      setRecentVouchers(recentData?.vouchers || []);
      setPageInfo({
        total: voucherData.total || 0,
        pages: voucherData.pages || 0,
      });
      if (page > Math.max(1, voucherData.pages || 0)) {
        setPage(Math.max(1, voucherData.pages || 0));
      }
      setStats({ ...initialStats, ...(statsData.stats || {}) });
      if (user.role === "director") {
        setPendingVouchers(pendingData?.vouchers || []);
        setPendingPageInfo({
          total: pendingData?.total || 0,
          pages: pendingData?.pages || 0,
        });
        if (pendingPage > Math.max(1, pendingData.pages || 0)) {
          setPendingPage(Math.max(1, pendingData.pages || 0));
        }
      } else {
        setPendingVouchers([]);
        setPendingPageInfo({ total: 0, pages: 0 });
      }
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [apiRequest, filterQuery, filters, logout, page, pendingPage, token, user]);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    apiRequest("/auth/me")
      .then((data) => {
        if (!active) return;
        setUser(data.user);
        localStorage.setItem("expenseVoucherUser", JSON.stringify(data.user));
      })
      .catch((requestError) => {
        if (!active) return;
        logout();
        setError(requestError.message);
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });

    return () => {
      active = false;
    };
  }, [apiRequest, logout, token]);

  useEffect(() => {
    if (!user || !token) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) loadDashboard();
    });
    return () => {
      active = false;
    };
  }, [loadDashboard, token, user]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await fetchApi(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) {
          const requestError = new Error(result.message || "Login failed.");
          requestError.status = response.status;
          throw requestError;
        }
        return result;
      });

      localStorage.setItem("expenseVoucherToken", data.token);
      localStorage.setItem("expenseVoucherUser", JSON.stringify(data.user));
      setToken(data.token);
      setPassword("");
      setAuthChecking(true);
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function setFormField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm({
      voucherDate: today(),
      expenseDate: "",
      department: user?.department || "",
      title: "",
      category: "",
      description: "",
      amount: "",
      employeeSignature: "",
    });
    setEditingId("");
  }

  function handleSignatureUpload(event, signatureField = "employeeSignature") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 400 * 1024
    ) {
      setError("Choose a PNG, JPEG, or WebP signature image smaller than 400 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("The signature image could not be read.");
    reader.onload = () => {
      if (typeof reader.result === "string") {
        if (signatureField === "directorSignature") {
          setDirectorSignature(reader.result);
        } else {
          setForm((current) => ({
            ...current,
            employeeSignature: reader.result,
          }));
        }
        setError("");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveDraft(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest(
        editingId ? `/vouchers/${editingId}` : "/vouchers",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            amount: Number(form.amount),
          }),
        }
      );
      setSuccess(data.message);
      setShowForm(false);
      resetForm();
      await loadDashboard();
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function editVoucher(voucher) {
    setForm({
      voucherDate: voucher.voucherDate ? voucher.voucherDate.slice(0, 10) : today(),
      expenseDate: voucher.expenseDate ? voucher.expenseDate.slice(0, 10) : "",
      department: voucher.department || "",
      title: voucher.title || "",
      category: voucher.category || "",
      description: voucher.description || "",
      amount: String(voucher.amount || ""),
      employeeSignature: voucher.employeeSignature || "",
    });
    setEditingId(voucher._id);
    setShowForm(true);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitVoucher(voucher) {
    if (!window.confirm(`Submit ${voucher.voucherNumber} for Director approval?`)) {
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest(`/vouchers/${voucher._id}/submit`, {
        method: "PATCH",
      });
      setSuccess(data.message);
      await loadDashboard();
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteVoucher(voucher) {
    if (!window.confirm(`Delete draft ${voucher.voucherNumber}? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest(`/vouchers/${voucher._id}`, {
        method: "DELETE",
      });
      setSuccess(data.message);
      await loadDashboard();
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function openVoucher(voucher) {
    setError("");
    setSelectedVoucher(voucher);
    setDetailLoading(true);
    try {
      const path =
        user.role === "employee"
          ? `/vouchers/my-vouchers/${voucher._id}`
          : `/vouchers/${voucher._id}`;
      const data = await apiRequest(path);
      setSelectedVoucher(data.voucher);
      setDirectorSignature("");
      setRejectionReason("");
    } catch (requestError) {
      setSelectedVoucher(null);
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function printVoucher() {
    if (!selectedVoucher || detailLoading) return;
    const images = Array.from(
      voucherDocumentRef.current?.querySelectorAll("img") || []
    );
    await Promise.all(
      images.map(async (image) => {
        try {
          if (typeof image.decode === "function") {
            await image.decode();
          } else if (!image.complete) {
            await new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          }
        } catch {
          return;
        }
      })
    );
    window.print();
  }

  async function processDirectorAction(action) {
    if (!selectedVoucher || directorActionInFlight.current) return;
    if (action === "approve" && !directorSignature) {
      setError("Add your Director signature before approving.");
      return;
    }
    if (action === "reject" && rejectionReason.trim().length < 5) {
      setError("Enter a rejection reason of at least 5 characters.");
      return;
    }
    const verb = action === "approve" ? "approve" : "reject";
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} voucher ${selectedVoucher.voucherNumber}?`)) {
      return;
    }

    directorActionInFlight.current = true;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const body =
        action === "approve"
          ? { directorSignature }
          : { rejectionReason: rejectionReason.trim() };
      const data = await apiRequest(
        `/vouchers/${selectedVoucher._id}/${action}`,
        { method: "PATCH", body: JSON.stringify(body) }
      );
      setSelectedVoucher(null);
      setSuccess(data.message);
      await loadDashboard();
    } catch (requestError) {
      if (requestError.status === 401) {
        logout();
      }
      setError(requestError.message);
    } finally {
      directorActionInFlight.current = false;
      setLoading(false);
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setPendingPage(1);
    setFilters({ ...filterDraft });
  }

  function selectEmployeeVoucherStatus(status) {
    const nextFilters = { ...filterDraft, status };
    setFilterDraft(nextFilters);
    setFilters(nextFilters);
    setPage(1);
    document.getElementById("employee-voucher-list")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (authChecking) {
    return <main className="auth-loading">Checking your account…</main>;
  }

  if (!user || !token) {
    return (
      <div className="app">
        <header className="navbar">
          <div className="brand">
            <span className="brand-icon">EV</span>
            <div>
              <h2>ExpenseFlow</h2>
              <p>Expense Voucher Management</p>
            </div>
          </div>
          <span className="company">PSPL</span>
        </header>
        <main className="main-container">
          <section className="welcome">
            <span className="eyebrow">Prachay Securities Private Limited</span>
            <h1>Expense Voucher Management</h1>
            <p>Manage expenses and track voucher approvals.</p>
          </section>
          <section className="login-card">
            <div className="card-heading">
              <div className="icon-box">EV</div>
              <div>
                <h2>Welcome back</h2>
                <p>Sign in using your assigned account.</p>
              </div>
            </div>
            <form onSubmit={handleLogin}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your work email"
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
              <button className="login-button" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            {error && <p className="error-message">{error}</p>}
            <p className="security-note">
              Accounts are provisioned by an authorized administrator.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const isEmployee = user.role === "employee";
  const isDirector = user.role === "director";
  const dashboardTitle = isEmployee
    ? "Employee Dashboard"
    : isDirector
      ? "Director Dashboard"
      : "Accounts Dashboard";

  return (
    <div className={`app${isEmployee ? " employee-app" : ""}`}>
      <header className="navbar">
        <div className="brand">
          <span className="brand-icon">EV</span>
          <div>
            <h2>ExpenseFlow</h2>
            <p>{dashboardTitle}</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="user-label">{user.name} · {user.role}</span>
          <button className="logout-button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className={`${isEmployee ? "employee-dashboard" : "dashboard"}${isDirector ? " director-dashboard" : ""}`}>
        <section className={`dashboard-heading${isEmployee ? " employee-welcome-banner" : ""}`}>
          <div>
            <span className="eyebrow">{dashboardTitle.toUpperCase()}</span>
            <h1>Hello, {user.name}</h1>
            <p>
              {isEmployee
                ? "Create vouchers and track their approval progress."
                : isDirector
                  ? "Review submitted expense vouchers and record your decision."
                  : "Review voucher records and approval details."}
            </p>
          </div>
          {isEmployee && (
            <button
              className={`primary-button${isEmployee ? " employee-create-button" : ""}`}
              onClick={() => {
                resetForm();
                setShowForm((visible) => !visible);
                setError("");
                setSuccess("");
              }}
            >
              {showForm ? "Close form" : "+ Create New Voucher"}
            </button>
          )}
        </section>

        {error && <p className="error-message" role="alert">{error}</p>}
        {success && <p className="success-message" role="status">{success}</p>}

        {isEmployee ? (
          <EmployeeDashboardOverview
            stats={stats}
            recentVouchers={recentVouchers}
            loading={loading}
            activeStatus={filters.status}
            onSelectStatus={selectEmployeeVoucherStatus}
            onOpenVoucher={openVoucher}
          />
        ) : (
          <section className="stats-grid">
            <article className={`stat-card${isDirector ? " director-stat" : ""}`}><p>Total vouchers</p><h2>{stats.total}</h2><span>All records in your access</span></article>
            <article className="stat-card"><p>Drafts</p><h2>{stats.drafts}</h2><span>Not submitted</span></article>
            <article className={`stat-card pending-stat${isDirector ? " director-stat" : ""}`}><p>Pending approval</p><h2>{stats.submitted}</h2><span>Submitted vouchers awaiting review</span></article>
            <article className="stat-card"><p>Approved</p><h2>{stats.approved}</h2><span>Processed vouchers</span></article>
            <article className="stat-card"><p>Rejected</p><h2>{stats.rejected}</h2><span>Returned with reason</span></article>
            <article className="stat-card"><p>Approved expenditure</p><h2>{currency(stats.approvedAmount)}</h2><span>Approved vouchers only</span></article>
          </section>
        )}

        {isDirector && (
          <section className="panel pending-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ACTION REQUIRED</span>
                <h2>Pending approval</h2>
                <p className="muted">
                  {pendingPageInfo.total} submitted voucher{pendingPageInfo.total === 1 ? "" : "s"} awaiting your decision.
                  {" "}Other active filters apply; the status filter is excluded from this review queue.
                </p>
              </div>
              <span className="pending-count">{stats.submitted} pending</span>
            </div>
            {loading && pendingVouchers.length === 0 ? (
              <p className="muted loading-state" role="status">Loading pending approvals…</p>
            ) : (
              <VoucherTable
                vouchers={pendingVouchers}
                isEmployee={false}
                isDirector
                loading={loading}
                openVoucher={openVoucher}
                editVoucher={editVoucher}
                deleteVoucher={deleteVoucher}
                submitVoucher={submitVoucher}
              />
            )}
            <div className="pagination-bar">
              <span className="muted">
                {pendingPageInfo.total === 0
                  ? "No pending vouchers match these filters"
                  : `Showing ${(pendingPage - 1) * 25 + 1}–${Math.min(pendingPage * 25, pendingPageInfo.total)} of ${pendingPageInfo.total} pending`}
              </span>
              <div className="form-actions">
                <button className="secondary-button" disabled={loading || pendingPage <= 1} onClick={() => setPendingPage((current) => current - 1)}>Previous</button>
                <span className="muted">Page {pendingPageInfo.total ? pendingPage : 0} of {pendingPageInfo.pages}</span>
                <button className="secondary-button" disabled={loading || pendingPageInfo.pages === 0 || pendingPage >= pendingPageInfo.pages} onClick={() => setPendingPage((current) => current + 1)}>Next</button>
              </div>
            </div>
          </section>
        )}

        {isEmployee && showForm && (
          <section className="panel voucher-form-panel">
            <h2>{editingId ? "Edit draft voucher" : "Create expense voucher"}</h2>
            <p className="muted">
              Save as Draft first. Submission is a separate action and requires your signature.
            </p>
            <form onSubmit={handleSaveDraft} className="voucher-form">
              <div className="form-grid">
                <div>
                  <label htmlFor="voucherDate">Voucher date *</label>
                  <input id="voucherDate" name="voucherDate" type="date" value={form.voucherDate} onChange={setFormField} required />
                </div>
                <div>
                  <label htmlFor="expenseDate">Expense date *</label>
                  <input id="expenseDate" name="expenseDate" type="date" value={form.expenseDate} onChange={setFormField} required />
                </div>
                <div>
                  <label htmlFor="department">Department *</label>
                  <input id="department" name="department" value={form.department} onChange={setFormField} maxLength="100" required />
                </div>
                <div>
                  <label htmlFor="title">Voucher title *</label>
                  <input id="title" name="title" value={form.title} onChange={setFormField} placeholder="e.g. Client meeting travel" maxLength="150" required />
                </div>
                <div>
                  <label htmlFor="category">Expense category *</label>
                  <input id="category" name="category" value={form.category} onChange={setFormField} placeholder="e.g. Travel" maxLength="100" required />
                </div>
                <div>
                  <label htmlFor="amount">Amount (₹) *</label>
                  <input id="amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={setFormField} required />
                </div>
                <div className="full-width">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" name="description" value={form.description} onChange={setFormField} rows="3" maxLength="2000" placeholder="Describe the business expense" />
                </div>
              </div>
              <SignaturePad
                key={editingId || "new-voucher-signature"}
                label="Employee signature"
                value={form.employeeSignature}
                onChange={(employeeSignature) =>
                  setForm((current) => ({ ...current, employeeSignature }))
                }
              />
              <div className="upload-row">
                <label htmlFor="signatureUpload">Or upload signature image (PNG, JPEG, WebP; up to 400 KB)</label>
                <input id="signatureUpload" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleSignatureUpload} />
                {form.employeeSignature && <span className="success-inline">Signature ready</span>}
              </div>
              <div className="form-actions">
                <button className="primary-button" disabled={loading}>
                  {loading ? "Saving…" : "Save as Draft"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section className={`panel${isEmployee ? " employee-voucher-list" : ""}`} id={isEmployee ? "employee-voucher-list" : undefined}>
          <div className="panel-heading">
            <div>
              <h2>{isEmployee ? "My vouchers" : "All vouchers"}</h2>
              <p className="muted">
                {isEmployee
                  ? "Only vouchers belonging to your employee account are shown."
                  : isDirector
                    ? "Open a submitted voucher to review and approve or reject it."
                    : "Read-only access to voucher records and approval information."}
              </p>
            </div>
            <div className="panel-actions">
              <button className="secondary-button" onClick={loadDashboard} disabled={loading}>
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>

          <form className="filters-grid" onSubmit={applyFilters}>
            <div>
              <label htmlFor="filterSearch">Search</label>
              <input id="filterSearch" value={filterDraft.search} onChange={(event) => setFilterDraft({ ...filterDraft, search: event.target.value })} placeholder="Voucher, title, employee…" />
            </div>
            <div>
              <label htmlFor="filterStatus">Status</label>
              <select id="filterStatus" value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value })}>
                <option value="">All statuses</option>
                {["Draft", "Submitted", "Approved", "Rejected"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            {!isEmployee && (
              <div>
                <label htmlFor="filterEmployee">Employee name or ID</label>
                <input id="filterEmployee" value={filterDraft.employee} onChange={(event) => setFilterDraft({ ...filterDraft, employee: event.target.value })} />
              </div>
            )}
            <div>
              <label htmlFor="filterDepartment">Department</label>
              <input id="filterDepartment" value={filterDraft.department} onChange={(event) => setFilterDraft({ ...filterDraft, department: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterCategory">Category</label>
              <input id="filterCategory" value={filterDraft.category} onChange={(event) => setFilterDraft({ ...filterDraft, category: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterFrom">Expense date from</label>
              <input id="filterFrom" type="date" value={filterDraft.from} onChange={(event) => setFilterDraft({ ...filterDraft, from: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterTo">Expense date to</label>
              <input id="filterTo" type="date" value={filterDraft.to} onChange={(event) => setFilterDraft({ ...filterDraft, to: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterMin">Min amount (₹)</label>
              <input id="filterMin" type="number" min="0" value={filterDraft.minAmount} onChange={(event) => setFilterDraft({ ...filterDraft, minAmount: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterMax">Max amount (₹)</label>
              <input id="filterMax" type="number" min="0" value={filterDraft.maxAmount} onChange={(event) => setFilterDraft({ ...filterDraft, maxAmount: event.target.value })} />
            </div>
            <div>
              <label htmlFor="filterSort">Sort by</label>
              <select id="filterSort" value={filterDraft.sort} onChange={(event) => setFilterDraft({ ...filterDraft, sort: event.target.value })}>
                <option value="createdAt">Recently created</option>
                <option value="voucherNumber">Voucher number</option>
                <option value="voucherDate">Voucher date</option>
                <option value="expenseDate">Expense date</option>
                <option value="employeeName">Employee</option>
                <option value="department">Department</option>
                <option value="category">Category</option>
                <option value="amount">Amount</option>
                <option value="status">Status</option>
              </select>
            </div>
            <div>
              <label htmlFor="filterOrder">Order</label>
              <select id="filterOrder" value={filterDraft.order} onChange={(event) => setFilterDraft({ ...filterDraft, order: event.target.value })}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
            <div className="filter-buttons">
              <button className="primary-button" type="submit">Apply filters</button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const cleared = { ...initialFilters };
                  setFilterDraft(cleared);
                  setPage(1);
                  setPendingPage(1);
                  setFilters(cleared);
                }}
              >
                Clear
              </button>
            </div>
          </form>

          {loading && vouchers.length === 0 ? (
            <p className="muted loading-state" role="status">Loading vouchers…</p>
          ) : (
            <VoucherTable
              vouchers={vouchers}
              isEmployee={isEmployee}
              isDirector={isDirector}
              loading={loading}
              openVoucher={openVoucher}
              editVoucher={editVoucher}
              deleteVoucher={deleteVoucher}
              submitVoucher={submitVoucher}
            />
          )}
          <div className="pagination-bar">
            <span className="muted">
              {pageInfo.total === 0
                ? "No matching vouchers"
                : `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, pageInfo.total)} of ${pageInfo.total}`}
            </span>
            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span className="muted">
                Page {pageInfo.total ? page : 0} of {pageInfo.pages}
              </span>
              <button
                className="secondary-button"
                disabled={loading || pageInfo.pages === 0 || page >= pageInfo.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer>© 2026 Prachay Securities Private Limited · ExpenseFlow</footer>

      {selectedVoucher && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedVoucher(null);
        }}>
          <section className="voucher-modal" role="dialog" aria-modal="true" aria-labelledby="voucher-modal-title">
            <div className="voucher-document" ref={voucherDocumentRef}>
              <header className="print-company-header">
                <strong>Prachay Securities Private Limited</strong>
                <span>ExpenseFlow</span>
                <h1>Expense Voucher</h1>
              </header>
              <div className="modal-heading">
                <div>
                  <span className="eyebrow">{selectedVoucher.voucherNumber}</span>
                  <h2 id="voucher-modal-title">{selectedVoucher.title || "Expense voucher"}</h2>
                </div>
                <button className="secondary-button" onClick={() => setSelectedVoucher(null)}>Close</button>
              </div>
              {error && <p className="error-message non-printable" role="alert">{error}</p>}
              {detailLoading && <p className="muted loading-state non-printable" role="status">Loading complete voucher details…</p>}
              <div className="detail-grid">
                <Detail label="Voucher number" value={selectedVoucher.voucherNumber || "Not available"} />
                <Detail label="Status" value={selectedVoucher.status || "Not available"} />
                <Detail label="Voucher date" value={selectedVoucher.voucherDate ? formatDate(selectedVoucher.voucherDate) : "Not recorded"} />
                <Detail label="Expense date" value={selectedVoucher.expenseDate ? formatDate(selectedVoucher.expenseDate) : "Not recorded"} />
                <Detail label="Employee" value={selectedVoucher.employeeName || "Not available"} />
                <Detail label="Employee ID" value={selectedVoucher.employeeId || "Not available"} />
                <Detail label="Department" value={selectedVoucher.department || "Not available"} />
                <Detail label="Category" value={selectedVoucher.category || "Not available"} />
                <Detail label="Amount" value={currency(selectedVoucher.amount)} />
                <Detail label="Submission date" value={selectedVoucher.submittedAt ? formatDate(selectedVoucher.submittedAt) : "Not recorded"} />
                <Detail label="Description" value={selectedVoucher.description?.trim() || "Not provided"} wide />
                {selectedVoucher.status === "Approved" && (
                  <Detail label="Approval date" value={selectedVoucher.approvalDate ? formatDate(selectedVoucher.approvalDate) : "Not recorded"} />
                )}
                {selectedVoucher.status === "Rejected" && (
                  <Detail label="Rejection reason" value={selectedVoucher.rejectionReason?.trim() || "Not provided"} wide />
                )}
                <Detail label="Created" value={selectedVoucher.createdAt ? formatDate(selectedVoucher.createdAt) : "Not recorded"} />
                <Detail label="Last updated" value={selectedVoucher.updatedAt ? formatDate(selectedVoucher.updatedAt) : "Not recorded"} />
                {isDirector && selectedVoucher.director && (
                  <Detail
                    label="Processed by"
                    value={
                      typeof selectedVoucher.director === "object"
                        ? `${selectedVoucher.director.name} (${selectedVoucher.director.role})`
                        : "Director identity recorded"
                    }
                  />
                )}
              </div>
              <div className="signature-details">
                <div>
                  <h3>Employee signature</h3>
                  <SignatureImage source={selectedVoucher.employeeSignature} label="Employee signature" />
                </div>
                <div>
                  <h3>Director signature</h3>
                  <SignatureImage source={selectedVoucher.directorSignature} label="Director signature" />
                </div>
              </div>
            </div>

            {isDirector && !detailLoading && selectedVoucher.status === "Submitted" && (
              <div className="approval-panel">
                <h3>Director decision</h3>
                <SignaturePad label="Director signature (required to approve)" value={directorSignature} onChange={setDirectorSignature} />
                <div className="upload-row">
                  <label htmlFor="directorSignatureUpload">Or upload signature image (PNG, JPEG, WebP; up to 400 KB)</label>
                  <input id="directorSignatureUpload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleSignatureUpload(event, "directorSignature")} />
                  {directorSignature && <span className="success-inline">Signature ready</span>}
                </div>
                <label htmlFor="rejectionReason">Rejection reason (required to reject)</label>
                <textarea id="rejectionReason" rows="3" maxLength="1000" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain why this voucher is being rejected" />
                <div className="form-actions">
                  <button className="primary-button" disabled={loading} onClick={() => processDirectorAction("approve")}>Approve voucher</button>
                  <button className="danger-button" disabled={loading} onClick={() => processDirectorAction("reject")}>Reject voucher</button>
                </div>
              </div>
            )}

            {!isDirector && user.role === "accounts" && (
              <div className="form-actions print-actions">
                <button className="secondary-button" disabled={detailLoading} onClick={printVoucher}>Print voucher</button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const initialFilters = {
  search: "",
  status: "",
  employee: "",
  department: "",
  category: "",
  from: "",
  to: "",
  minAmount: "",
  maxAmount: "",
  sort: "createdAt",
  order: "desc",
};

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? "detail-item detail-wide" : "detail-item"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
