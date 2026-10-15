// Global State
let currentPage = 1;
let pageSize = 50;
let totalRecords = 0;
let sortCol = "loai_ton";
let sortDir = "desc";

// Default Detailed Table Columns Configuration
const defaultColumnConfig = [
    { id: "item_code", label: "Mã bưu gửi", visible: true, class: "text-bold", style: "font-family: var(--font-mono); font-size: 13.5px; color: #ef4444;" },
    { id: "pos_name", label: "Bưu cục phát", visible: true, class: "", style: "" },
    { id: "loai_ton", label: "Thời gian tồn", visible: true, class: "", style: "" },
    { id: "status_name", label: "Trạng thái", visible: true, class: "", style: "" },
    { id: "nhom_kh", label: "Nhóm KH", visible: true, class: "", style: "" },
    { id: "postman_name", label: "Bưu tá", visible: true, class: "", style: "" },
    { id: "cod_amount", label: "COD (đ)", visible: true, class: "text-right", style: "font-family: var(--font-mono); font-size: 13.5px;" },
    { id: "weight", label: "TL (kg)", visible: true, class: "text-right", style: "font-family: var(--font-mono); font-size: 13.5px;" },
    { id: "updated_at", label: "Cập nhật", visible: true, class: "", style: "font-family: var(--font-mono); font-size: 13.5px;" }
];

let columnConfig = [...defaultColumnConfig];
let cachedDetailedData = null;

function loadColumnConfig() {
    const saved = localStorage.getItem("detailed_table_columns");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const merged = [];
            parsed.forEach(p => {
                const def = defaultColumnConfig.find(d => d.id === p.id);
                if (def) merged.push({ ...def, visible: p.visible });
            });
            defaultColumnConfig.forEach(def => {
                if (!merged.find(m => m.id === def.id)) merged.push(def);
            });
            columnConfig = merged;
        } catch (e) {
            columnConfig = [...defaultColumnConfig];
        }
    }
}

function saveColumnConfig() {
    localStorage.setItem("detailed_table_columns", JSON.stringify(columnConfig.map(c => ({ id: c.id, visible: c.visible }))));
}

function renderColumnConfigUI() {
    const list = document.getElementById("column-config-list");
    if (!list) return;
    list.innerHTML = "";

    columnConfig.forEach((col, index) => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.justifyContent = "space-between";
        item.style.padding = "8px 12px";
        item.style.background = "var(--bg-primary)";
        item.style.border = "1px solid var(--border-color)";
        item.style.borderRadius = "6px";
        item.style.gap = "12px";

        const leftDiv = document.createElement("div");
        leftDiv.style.display = "flex";
        leftDiv.style.alignItems = "center";
        leftDiv.style.gap = "8px";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = col.visible;
        checkbox.style.width = "16px";
        checkbox.style.height = "16px";
        checkbox.style.accentColor = "var(--accent-emerald)";
        checkbox.style.cursor = "pointer";
        checkbox.onchange = () => {
            col.visible = checkbox.checked;
            saveColumnConfig();
            renderDetailedHeader();
            if (cachedDetailedData) renderDetailed(cachedDetailedData);
        };

        const label = document.createElement("span");
        label.textContent = col.label;
        label.style.fontSize = "14px";
        label.style.fontWeight = "500";
        label.style.color = "var(--text-primary)";

        leftDiv.appendChild(checkbox);
        leftDiv.appendChild(label);

        const rightDiv = document.createElement("div");
        rightDiv.style.display = "flex";
        rightDiv.style.gap = "4px";

        const upBtn = document.createElement("button");
        upBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
        upBtn.className = "btn";
        upBtn.style.padding = "4px 8px";
        upBtn.style.background = "var(--bg-secondary)";
        upBtn.style.color = index === 0 ? "var(--text-muted)" : "var(--text-primary)";
        upBtn.disabled = index === 0;
        upBtn.onclick = (e) => {
            e.preventDefault();
            if (index > 0) {
                const temp = columnConfig[index];
                columnConfig[index] = columnConfig[index - 1];
                columnConfig[index - 1] = temp;
                saveColumnConfig();
                renderColumnConfigUI();
                renderDetailedHeader();
                if (cachedDetailedData) renderDetailed(cachedDetailedData);
            }
        };

        const downBtn = document.createElement("button");
        downBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
        downBtn.className = "btn";
        downBtn.style.padding = "4px 8px";
        downBtn.style.background = "var(--bg-secondary)";
        downBtn.style.color = index === columnConfig.length - 1 ? "var(--text-muted)" : "var(--text-primary)";
        downBtn.disabled = index === columnConfig.length - 1;
        downBtn.onclick = (e) => {
            e.preventDefault();
            if (index < columnConfig.length - 1) {
                const temp = columnConfig[index];
                columnConfig[index] = columnConfig[index + 1];
                columnConfig[index + 1] = temp;
                saveColumnConfig();
                renderColumnConfigUI();
                renderDetailedHeader();
                if (cachedDetailedData) renderDetailed(cachedDetailedData);
            }
        };

        rightDiv.appendChild(upBtn);
        rightDiv.appendChild(downBtn);

        item.appendChild(leftDiv);
        item.appendChild(rightDiv);
        list.appendChild(item);
    });
}

function renderDetailedHeader() {
    const theadTr = document.querySelector("#detailed-table thead tr");
    if (!theadTr) return;
    theadTr.innerHTML = "";

    columnConfig.filter(c => c.visible).forEach(col => {
        const th = document.createElement("th");
        th.setAttribute("data-col", col.id);
        th.className = "sortable " + (col.class.includes("text-right") ? "text-right" : "");

        let iconClass = "fa-solid fa-sort";
        if (sortCol === col.id) {
            iconClass = sortDir === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
        }

        th.innerHTML = `${col.label} <i class="${iconClass}"></i>`;

        // Re-attach sort event listener
        th.addEventListener("click", () => {
            if (sortCol === col.id) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortCol = col.id;
                sortDir = (col.id === "loai_ton" || col.id === "cod_amount" || col.id === "weight") ? "desc" : "asc";
            }
            // Update icons
            document.querySelectorAll(".sortable i").forEach(i => i.className = "fa-solid fa-sort");
            th.querySelector("i").className = sortDir === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";

            currentPage = 1;
            loadDetailed();
        });

        theadTr.appendChild(th);
    });
}

// Matrix Sort State
let matrixSortCol = "qty-Total";
let matrixSortDir = "desc";
let cachedSummaryData = null;

let filters = {
    pos_name: "",
    loai_ton: "",
    status_name: "",
    nhom_kh: "",
    search: ""
};

// API Base configuration for Excel exporter
const API_BASE_DINHVI = "";

// Helper to get authorization headers
function getHeaders() {
    const token = localStorage.getItem("vnpost_token");
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

// DOM Elements
const kpiQty = document.getElementById("kpi-qty");
const kpiCod = document.getElementById("kpi-cod");
const kpiWeight = document.getElementById("kpi-weight");

const multiselectPosContainer = document.getElementById("multiselect-pos-container");
const multiselectPosTrigger = document.getElementById("multiselect-pos-trigger");
const multiselectPosDropdown = document.getElementById("multiselect-pos-dropdown");
const multiselectPosList = document.getElementById("multiselect-pos-list");
const multiselectPosLabel = document.getElementById("multiselect-pos-label");
const multiselectPosSelectAll = document.getElementById("multiselect-pos-select-all");
const multiselectPosClear = document.getElementById("multiselect-pos-clear");
const multiselectCategoryContainer = document.getElementById("multiselect-category-container");
const multiselectCategoryTrigger = document.getElementById("multiselect-category-trigger");
const multiselectCategoryDropdown = document.getElementById("multiselect-category-dropdown");
const multiselectCategoryList = document.getElementById("multiselect-category-list");
const multiselectCategoryLabel = document.getElementById("multiselect-category-label");
const multiselectCategorySelectAll = document.getElementById("multiselect-category-select-all");
const multiselectCategoryClear = document.getElementById("multiselect-category-clear");

const multiselectStatusContainer = document.getElementById("multiselect-status-container");
const multiselectStatusTrigger = document.getElementById("multiselect-status-trigger");
const multiselectStatusDropdown = document.getElementById("multiselect-status-dropdown");
const multiselectStatusList = document.getElementById("multiselect-status-list");
const multiselectStatusLabel = document.getElementById("multiselect-status-label");
const multiselectStatusSelectAll = document.getElementById("multiselect-status-select-all");
const multiselectStatusClear = document.getElementById("multiselect-status-clear");

const multiselectNhomKhContainer = document.getElementById("multiselect-nhom-kh-container");
const multiselectNhomKhTrigger = document.getElementById("multiselect-nhom-kh-trigger");
const multiselectNhomKhDropdown = document.getElementById("multiselect-nhom-kh-dropdown");
const multiselectNhomKhList = document.getElementById("multiselect-nhom-kh-list");
const multiselectNhomKhLabel = document.getElementById("multiselect-nhom-kh-label");
const multiselectNhomKhSelectAll = document.getElementById("multiselect-nhom-kh-select-all");
const multiselectNhomKhClear = document.getElementById("multiselect-nhom-kh-clear");

const searchInput = document.getElementById("search-input");

const matrixTbody = document.getElementById("matrix-tbody");
const detailedTbody = document.getElementById("detailed-tbody");

const paginationInfo = document.getElementById("pagination-info");
const selectPageSize = document.getElementById("select-page-size");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");

const btnRefresh = document.getElementById("btn-refresh");
const btnTriggerCrawl = document.getElementById("btn-trigger-crawl");
const btnExportExcel = document.getElementById("btn-export-excel");
const btnLocateExcel = document.getElementById("btn-locate-excel");
const btnOpenColumnConfig = document.getElementById("btn-open-column-config");
const btnCloseColumnConfig = document.getElementById("btn-close-column-config");
const btnSaveColumnConfig = document.getElementById("btn-save-column-config");
const columnConfigModal = document.getElementById("column-config-modal");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const lastUpdateTime = document.getElementById("last-update-time");

// Helper to format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value).replace('₫', 'đ');
}

// Helper to format numbers
function formatNumber(value) {
    return new Intl.NumberFormat('vi-VN').format(value);
}

// Premium Toast Notification Helper
function showToast(message, type = "error") {
    let container = document.querySelector(".toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconHTML = `<i class="fa-solid fa-circle-info toast-icon"></i>`;
    if (type === "success") {
        iconHTML = `<i class="fa-solid fa-circle-check toast-icon"></i>`;
    } else if (type === "error") {
        iconHTML = `<i class="fa-solid fa-circle-xmark toast-icon"></i>`;
    } else if (type === "warning") {
        iconHTML = `<i class="fa-solid fa-triangle-exclamation toast-icon"></i>`;
    }

    toast.innerHTML = `
        ${iconHTML}
        <div class="toast-content">${message}</div>
    `;

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 4000);
}

// Initialize Dropdowns
async function loadFilters() {
    try {
        const response = await fetch("/api/filters");
        const data = await response.json();

        // Populate POS Names into Custom Multiselect
        if (multiselectPosList) {
            multiselectPosList.innerHTML = '';
            data.pos_names.forEach(name => {
                const lbl = document.createElement("label");
                lbl.innerHTML = `<input type="checkbox" class="pos-checkbox" value="${name}"> ${name}`;
                lbl.querySelector("input").addEventListener("change", handlePosSelectionChange);
                multiselectPosList.appendChild(lbl);
            });
        }

        // Populate Categories into Custom Multiselect with all available categories
        const allAvailableLoaiTons = ["<1 ngày", "≥1 ngày", "≥1.5 ngày", "≥2 ngày", "≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
        const loaiTonsToUse = (data.loai_tons && data.loai_tons.length > 0) ? data.loai_tons : allAvailableLoaiTons;
        if (multiselectCategoryList) {
            multiselectCategoryList.innerHTML = '';
            loaiTonsToUse.forEach(cat => {
                const lbl = document.createElement("label");
                lbl.innerHTML = `<input type="checkbox" class="category-checkbox" value="${cat}"> ${cat}`;
                lbl.querySelector("input").addEventListener("change", handleCategorySelectionChange);
                multiselectCategoryList.appendChild(lbl);
            });
        }

        // Populate Statuses into Custom Multiselect
        if (multiselectStatusList) {
            multiselectStatusList.innerHTML = '';
            data.status_names.forEach(status => {
                const lbl = document.createElement("label");
                lbl.innerHTML = `<input type="checkbox" class="status-checkbox" value="${status}"> ${status}`;
                lbl.querySelector("input").addEventListener("change", handleStatusSelectionChange);
                multiselectStatusList.appendChild(lbl);
            });
        }

        // Populate Nhom KH into Custom Multiselect
        const fixedNhomKhs = (data.nhom_khs && data.nhom_khs.length > 0) ? data.nhom_khs : ["KH Mới", "KH Shopee", "KH Thường", "KH Tiktok", "KH Trọng điểm"];
        if (multiselectNhomKhList) {
            multiselectNhomKhList.innerHTML = '';
            fixedNhomKhs.forEach(nhom => {
                const lbl = document.createElement("label");
                lbl.innerHTML = `<input type="checkbox" class="nhom-kh-checkbox" value="${nhom}"> ${nhom}`;
                lbl.querySelector("input").addEventListener("change", handleNhomKhSelectionChange);
                multiselectNhomKhList.appendChild(lbl);
            });
        }
    } catch (e) {
        console.error("Error loading filters:", e);
    }
}

// State tracking for Power BI URL error
let isDashboardUrlError = false;
let isErrorBannerMinimized = false;

function setDashboardUrlError(hasError, message = "") {
    isDashboardUrlError = hasError;
    const overlay = document.getElementById("dashboard-url-error-overlay");
    const viewDashboard = document.getElementById("view-dashboard");
    const viewExport = document.getElementById("view-export");
    const errorDetailContent = document.getElementById("url-error-detail-content");
    const stickyBanner = document.getElementById("sticky-pbi-error-banner");
    const stickyText = document.getElementById("sticky-pbi-error-text");

    const defaultErrMsg = "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ";
    const finalMsg = message || defaultErrMsg;

    if (hasError) {
        if (errorDetailContent) {
            errorDetailContent.textContent = finalMsg;
        }
        if (stickyText) {
            stickyText.textContent = finalMsg;
        }

        if (viewDashboard) viewDashboard.classList.add("dashboard-locked");

        if (!isErrorBannerMinimized) {
            if (overlay) overlay.style.display = "flex";
            if (viewExport) viewExport.classList.add("view-locked");
            if (stickyBanner) stickyBanner.style.display = "none";
        } else {
            if (overlay) overlay.style.display = "none";
            if (viewExport) viewExport.classList.remove("view-locked");
            if (stickyBanner) stickyBanner.style.display = "flex";
        }

        // Lock & disable dashboard controls
        if (btnRefresh) {
            btnRefresh.disabled = true;
            btnRefresh.title = "Dashboard tạm thời bị khóa do lỗi URL Power BI";
        }
        if (btnTriggerCrawl) {
            btnTriggerCrawl.classList.add("disabled");
            btnTriggerCrawl.style.opacity = "0.5";
            btnTriggerCrawl.style.cursor = "not-allowed";
            btnTriggerCrawl.title = "Đồng bộ bị khóa do lỗi URL Power BI";
        }

        // Update status dot & text in sidebar
        if (statusDot) {
            statusDot.className = "dot dot-error";
        }
        if (statusText) {
            statusText.textContent = "Lỗi URL Power BI";
            statusText.style.color = "#ef4444";
        }
    } else {
        isErrorBannerMinimized = false;
        if (overlay) overlay.style.display = "none";
        if (stickyBanner) stickyBanner.style.display = "none";
        if (viewDashboard) viewDashboard.classList.remove("dashboard-locked");
        if (viewExport) viewExport.classList.remove("view-locked");

        if (btnRefresh) {
            btnRefresh.disabled = false;
            btnRefresh.title = "";
        }
        if (btnTriggerCrawl) {
            btnTriggerCrawl.classList.remove("disabled");
            btnTriggerCrawl.style.opacity = "";
            btnTriggerCrawl.style.cursor = "";
            btnTriggerCrawl.title = "";
        }
        if (statusText) {
            statusText.style.color = "";
        }
    }
}

async function retryPbiConnection() {
    const btn = document.getElementById("btn-retry-pbi-url");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...`;
    }
    try {
        const resp = await fetch("/api/check-pbi-url");
        const data = await resp.json();
        if (data.is_valid) {
            showToast("Kết nối URL Power BI thành công!", "success");
            setDashboardUrlError(false);
            await updateStatus();
            await loadSummary();
            await loadDetailed();
        } else {
            showToast(data.error_message || "URL Power BI vẫn chưa thể truy cập.", "error");
            setDashboardUrlError(true, data.error_message);
        }
    } catch (e) {
        showToast("Lỗi kiểm tra kết nối tới máy chủ.", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Kiểm tra lại kết nối`;
        }
    }
}

// Fetch Status & Update Indicator
async function updateStatus() {
    try {
        const response = await fetch("/api/status");
        const data = await response.json();

        // Check for URL Error flag first
        if (data.url_error) {
            setDashboardUrlError(true, data.error_message || "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ");
        } else {
            setDashboardUrlError(false);
            // Update Normal Indicator
            statusDot.className = "dot";
            if (data.is_crawling) {
                statusDot.classList.add("crawling");
                statusText.textContent = "Đang đồng bộ...";
            } else {
                statusDot.classList.add("active");
                statusText.textContent = `Online (Crawl: ${data.last_crawl_status})`;
            }
        }

        if (data.last_crawl_time) {
            const t = data.last_crawl_time.split(" ")[1];
            lastUpdateTime.textContent = `Cập nhật: ${t}`;
        }
    } catch (e) {
        console.error("Error updating status:", e);
        statusDot.className = "dot";
        statusText.textContent = "Offline";
    }
}

// Fetch Summary (KPI Cards & Pivot Matrix)
async function loadSummary() {
    try {
        let url = "/api/summary";
        const matrixNhomKh = document.getElementById("matrix-nhom-kh");
        if (matrixNhomKh && matrixNhomKh.value) {
            url += `?nhom_kh=${encodeURIComponent(matrixNhomKh.value)}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        cachedSummaryData = data;

        kpiQty.textContent = formatNumber(data.total_qty);
        kpiCod.textContent = formatCurrency(data.total_cod);
        kpiWeight.textContent = `${formatNumber(data.total_weight)} kg`;

        renderSummary(data);

    } catch (e) {
        console.error("Error loading summary:", e);
        matrixTbody.innerHTML = '<tr><td colspan="9" class="text-center text-red">Lỗi tải dữ liệu.</td></tr>';
    }
}

// All Available Categories and Themes
const ALL_CATEGORIES = [
    "<1 ngày",
    "≥1 ngày",
    "≥1.5 ngày",
    "≥2 ngày",
    "≥3 ngày",
    "≥4 ngày",
    "≥5 ngày",
    "≥7 ngày",
    "≥14 ngày"
];

const CATEGORY_STYLES = {
    "<1 ngày": { bg: "rgba(59, 130, 246, 0.15)", color: "#1d4ed8", border: "#3b82f6" },
    "≥1 ngày": { bg: "rgba(59, 130, 246, 0.15)", color: "#1d4ed8", border: "#3b82f6" },
    "≥1.5 ngày": { bg: "rgba(14, 165, 233, 0.15)", color: "#0369a1", border: "#0ea5e9" },
    "≥2 ngày": { bg: "rgba(20, 184, 166, 0.15)", color: "#0f766e", border: "#14b8a6" },
    "≥3 ngày": { bg: "rgba(16, 185, 129, 0.15)", color: "#047857", border: "#10b981" },
    "≥4 ngày": { bg: "rgba(16, 185, 129, 0.15)", color: "#047857", border: "#10b981" },
    "≥5 ngày": { bg: "rgba(245, 158, 11, 0.15)", color: "#b45309", border: "#f59e0b" },
    "≥7 ngày": { bg: "rgba(245, 158, 11, 0.15)", color: "#b45309", border: "#f59e0b" },
    "≥14 ngày": { bg: "rgba(239, 68, 68, 0.15)", color: "#b91c1c", border: "#ef4444" }
};

function getVisibleCategories() {
    const saved = localStorage.getItem("matrix_visible_columns");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const filtered = ALL_CATEGORIES.filter(c => parsed.includes(c));
                if (filtered.length > 0) return filtered;
            }
        } catch (e) { }
    }
    return [...ALL_CATEGORIES];
}

function getTotalCategories() {
    const saved = localStorage.getItem("matrix_total_columns");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const filtered = ALL_CATEGORIES.filter(c => parsed.includes(c));
                if (filtered.length > 0) return filtered;
            }
        } catch (e) { }
    }
    return ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
}

function renderMatrixThead(visibleCats, targetCats) {
    const thead = document.getElementById("matrix-thead");
    if (!thead) return;

    let sublabel = "(Tất cả cột)";
    if (targetCats.length < ALL_CATEGORIES.length) {
        sublabel = `(${targetCats.join(', ')})`;
    }

    let tr1 = `
        <tr>
            <th rowspan="2" style="width: 50px;" class="text-center">STT</th>
            <th rowspan="2" class="sortable-matrix ${matrixSortCol === 'pos_name' ? 'active-sort' : ''}" data-sort="pos_name">
                Bưu cục phát <i class="fa-solid ${matrixSortCol === 'pos_name' ? (matrixSortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}"></i>
            </th>
    `;

    visibleCats.forEach(cat => {
        const style = CATEGORY_STYLES[cat] || { bg: "rgba(16, 185, 129, 0.15)", color: "#047857", border: "#10b981" };
        tr1 += `
            <th colspan="2" class="col-group text-center" style="background: ${style.bg}; color: ${style.color}; font-weight: 700; border-bottom: 2px solid ${style.border};">
                ${cat}
            </th>
        `;
    });

    tr1 += `
            <th colspan="2" class="col-group total-group text-center" id="matrix-header-total" style="cursor: pointer; user-select: none; transition: background 0.2s;" title="Nhấp để cấu hình nhanh cột tính Tổng tồn">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
                    <span style="display: flex; align-items: center; gap: 6px; font-weight: 700;">
                        Toàn tỉnh <i class="fa-solid fa-gear" style="font-size: 11px; color: var(--accent-emerald);"></i>
                    </span>
                    <span id="matrix-header-sublabel" style="font-size: 10px; font-weight: 500; opacity: 0.85; display: block; color: var(--accent-emerald);">${sublabel}</span>
                </div>
            </th>
            <th rowspan="2" class="text-center" style="width: 50px;" title="Xem chi tiết"><i class="fa-solid fa-chevron-down" style="color: var(--accent-emerald);"></i></th>
        </tr>
    `;

    let tr2 = `<tr>`;
    visibleCats.forEach(cat => {
        const sortQty = `qty-${cat}`;
        const sortCod = `cod-${cat}`;
        const isQtyActive = matrixSortCol === sortQty;
        const isCodActive = matrixSortCol === sortCod;
        const qtyIcon = isQtyActive ? (matrixSortDir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
        const codIcon = isCodActive ? (matrixSortDir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";

        tr2 += `
            <th class="sortable-matrix ${isQtyActive ? 'active-sort' : ''}" data-sort="${sortQty}">SL BG <i class="fa-solid ${qtyIcon}"></i></th>
            <th class="sortable-matrix ${isCodActive ? 'active-sort' : ''}" data-sort="${sortCod}">COD (đ) <i class="fa-solid ${codIcon}"></i></th>
        `;
    });

    const isTotalQtyActive = matrixSortCol === "qty-Total";
    const isTotalCodActive = matrixSortCol === "cod-Total";
    const totalQtyIcon = isTotalQtyActive ? (matrixSortDir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";
    const totalCodIcon = isTotalCodActive ? (matrixSortDir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort";

    tr2 += `
            <th class="total-col sortable-matrix ${isTotalQtyActive ? 'active-sort' : ''}" data-sort="qty-Total">SL BG <i class="fa-solid ${totalQtyIcon}"></i></th>
            <th class="total-col sortable-matrix ${isTotalCodActive ? 'active-sort' : ''}" data-sort="cod-Total">COD (đ) <i class="fa-solid ${totalCodIcon}"></i></th>
        </tr>
    `;

    thead.innerHTML = tr1 + tr2;
}

function renderSummary(data) {
    if (!data || !data.matrix) return;

    const visibleCats = getVisibleCategories();
    const targetCats = getTotalCategories();

    // Render Dynamic Table Header
    renderMatrixThead(visibleCats, targetCats);

    const totalColSpan = 3 + visibleCats.length * 2;

    const colTotals = {};
    ALL_CATEGORIES.forEach(cat => {
        colTotals[cat] = { qty: 0, cod: 0.0 };
    });
    colTotals["Total"] = { qty: 0, cod: 0.0 };

    let posList = Object.keys(data.matrix);

    if (posList.length === 0) {
        matrixTbody.innerHTML = `<tr><td colspan="${totalColSpan}" class="text-center text-muted">Không có dữ liệu tổng hợp.</td></tr>`;
        return;
    }

    posList.sort((a, b) => {
        let valA, valB;

        if (matrixSortCol === "pos_name") {
            valA = a;
            valB = b;
        } else {
            const parts = matrixSortCol.split("-");
            const type = parts[0];
            const cat = parts.slice(1).join("-");

            if (cat === "Total") {
                let totalQtyA = 0, totalCodA = 0;
                targetCats.forEach(c => {
                    const cell = (data.matrix[a] && data.matrix[a][c]) || { qty: 0, cod: 0 };
                    totalQtyA += cell.qty;
                    totalCodA += cell.cod;
                });
                valA = type === "qty" ? totalQtyA : totalCodA;

                let totalQtyB = 0, totalCodB = 0;
                targetCats.forEach(c => {
                    const cell = (data.matrix[b] && data.matrix[b][c]) || { qty: 0, cod: 0 };
                    totalQtyB += cell.qty;
                    totalCodB += cell.cod;
                });
                valB = type === "qty" ? totalQtyB : totalCodB;
            } else {
                const cellA = (data.matrix[a] && data.matrix[a][cat]) || { qty: 0, cod: 0 };
                const cellB = (data.matrix[b] && data.matrix[b][cat]) || { qty: 0, cod: 0 };
                valA = type === "qty" ? cellA.qty : cellA.cod;
                valB = type === "qty" ? cellB.qty : cellB.cod;
            }
        }

        if (valA < valB) return matrixSortDir === "asc" ? -1 : 1;
        if (valA > valB) return matrixSortDir === "asc" ? 1 : -1;
        return 0;
    });

    // Compute column totals and row totals across all POS offices
    posList.forEach(pos => {
        let rowTotalQty = 0;
        let rowTotalCod = 0;
        ALL_CATEGORIES.forEach(cat => {
            const cell = (data.matrix[pos] && data.matrix[pos][cat]) || { qty: 0, cod: 0 };
            colTotals[cat].qty += cell.qty;
            colTotals[cat].cod += cell.cod;

            if (targetCats.includes(cat)) {
                rowTotalQty += cell.qty;
                rowTotalCod += cell.cod;
            }
        });
        colTotals["Total"].qty += rowTotalQty;
        colTotals["Total"].cod += rowTotalCod;
    });

    // Update KPI Summary cards to match Total column selection
    if (kpiQty) kpiQty.textContent = formatNumber(colTotals["Total"].qty);
    if (kpiCod) kpiCod.textContent = formatCurrency(colTotals["Total"].cod);

    matrixTbody.innerHTML = "";

    // 1. Render totals row AT THE TOP of the table body
    const totalTrTop = document.createElement("tr");
    totalTrTop.className = "total-row top-total-row";
    let totalRowHtml = `<td></td><td>TOÀN TỈNH</td>`;
    visibleCats.forEach(cat => {
        totalRowHtml += `
            <td class="text-right qty-cell">${formatNumber(colTotals[cat].qty)}</td>
            <td class="text-right">${formatCurrency(colTotals[cat].cod)}</td>
        `;
    });
    totalRowHtml += `
        <td class="text-right text-bold qty-cell total-qty-cell">${formatNumber(colTotals["Total"].qty)}</td>
        <td class="text-right text-bold">${formatCurrency(colTotals["Total"].cod)}</td>
        <td></td>
    `;
    totalTrTop.innerHTML = totalRowHtml;
    matrixTbody.appendChild(totalTrTop);

    // 2. Render each POS office row
    posList.forEach((pos, index) => {
        const tr = document.createElement("tr");
        let rowHtml = `
            <td class="text-center" style="font-family: var(--font-mono); font-size: 13px; font-weight: 500; color: var(--text-secondary);">${index + 1}</td>
            <td class="pos-name-cell">${pos}</td>
        `;
        let rowTotalQty = 0;
        let rowTotalCod = 0;

        ALL_CATEGORIES.forEach(cat => {
            const cell = (data.matrix[pos] && data.matrix[pos][cat]) || { qty: 0, cod: 0 };
            if (targetCats.includes(cat)) {
                rowTotalQty += cell.qty;
                rowTotalCod += cell.cod;
            }
        });

        visibleCats.forEach(cat => {
            const cell = (data.matrix[pos] && data.matrix[pos][cat]) || { qty: 0, cod: 0 };
            rowHtml += `
                <td class="qty-cell text-right" data-cat="${cat}" data-qty="${cell.qty}">${formatNumber(cell.qty)}</td>
                <td class="cod-cell text-right">${formatCurrency(cell.cod)}</td>
            `;
        });

        rowHtml += `
            <td class="qty-cell text-right text-bold total-qty-cell" data-cat="Total" data-qty="${rowTotalQty}">${formatNumber(rowTotalQty)}</td>
            <td class="cod-cell text-right text-bold">${formatCurrency(rowTotalCod)}</td>
            <td class="text-center">
                <button type="button" class="btn-drilldown" data-pos="${pos}" title="Xem chi tiết tồn bưu gửi" style="background: var(--accent-emerald-light); color: var(--accent-emerald); border: none; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-spring);">
                    <i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>
                </button>
            </td>
        `;

        tr.innerHTML = rowHtml;
        matrixTbody.appendChild(tr);
    });

    // 3. Render totals row AT THE BOTTOM of the table body
    const totalTrBottom = totalTrTop.cloneNode(true);
    totalTrBottom.className = "total-row bottom-total-row";
    matrixTbody.appendChild(totalTrBottom);

    applyHighlights();
}

// Fetch Detailed Paginated Table
async function loadDetailed() {
    try {
        const queryParams = new URLSearchParams({
            page: currentPage,
            page_size: pageSize,
            sort_col: sortCol,
            sort_dir: sortDir,
            pos_name: filters.pos_name,
            loai_ton: filters.loai_ton,
            status_name: filters.status_name,
            nhom_kh: filters.nhom_kh,
            search: filters.search
        });

        const response = await fetch(`/api/detailed?${queryParams.toString()}`);
        const data = await response.json();
        cachedDetailedData = data;

        totalRecords = data.total;

        renderDetailed(data);

        // 2. Update Pagination Controls
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalRecords);
        paginationInfo.textContent = totalRecords > 0 ? `Hiển thị từ ${formatNumber(start)} đến ${formatNumber(end)} trong tổng số ${formatNumber(totalRecords)} dòng` : "Hiển thị 0 dòng";

        btnPrevPage.disabled = currentPage === 1;
        btnNextPage.disabled = currentPage * pageSize >= totalRecords;

    } catch (e) {
        console.error("Error loading detailed:", e);
        detailedTbody.innerHTML = `<tr><td colspan="${columnConfig.filter(c => c.visible).length}" class="text-center text-red">Lỗi tải dữ liệu chi tiết.</td></tr>`;
    }
}

function renderDetailed(data) {
    detailedTbody.innerHTML = "";
    const visibleCols = columnConfig.filter(c => c.visible);

    if (!data || !data.rows || data.rows.length === 0) {
        detailedTbody.innerHTML = `<tr><td colspan="${visibleCols.length}" class="text-center text-muted">Không tìm thấy bản ghi nào khớp bộ lọc.</td></tr>`;
    } else {
        data.rows.forEach(r => {
            const tr = document.createElement("tr");

            let ageClass = "age-3";
            if (r.loai_ton === "≥14 ngày") ageClass = "age-14";
            else if (r.loai_ton === "≥7 ngày") ageClass = "age-7";

            const codText = r.cod_amount > 0 ? formatCurrency(r.cod_amount) : "-";

            let trContent = '';
            visibleCols.forEach(col => {
                let cellValue = r[col.id];
                if (cellValue === null || cellValue === undefined) cellValue = '-';

                let cellContent = cellValue;

                if (col.id === 'loai_ton') {
                    cellContent = `<span class="category-badge ${ageClass}">${cellValue}</span>`;
                } else if (col.id === 'status_name') {
                    cellContent = `<span class="status-badge">${cellValue}</span>`;
                } else if (col.id === 'cod_amount') {
                    cellContent = codText;
                } else if (col.id === 'weight') {
                    cellContent = formatNumber(r.weight);
                }

                trContent += `<td class="${col.class}" style="${col.style}">${cellContent}</td>`;
            });

            tr.innerHTML = trContent;
            detailedTbody.appendChild(tr);
        });
    }
}

// Trigger Data Crawling Sync
async function triggerCrawl() {
    try {
        const response = await fetch("/api/trigger-crawl", { method: "POST" });
        const data = await response.json();
        showToast(data.message || "Đã gửi lệnh đồng bộ.", "success");
        updateStatus();
    } catch (e) {
        showToast("Lỗi kết nối đồng bộ.", "error");
    }
}

// Export Detailed excel
async function exportExcel() {
    try {
        const queryParams = new URLSearchParams({
            pos_name: filters.pos_name,
            loai_ton: filters.loai_ton,
            status_name: filters.status_name,
            nhom_kh: filters.nhom_kh,
            search: filters.search,
            sort_col: sortCol,
            sort_dir: sortDir
        });
        window.open(`/api/summary/export?${queryParams.toString()}`);
    } catch (e) {
        showToast("Lỗi tải xuống excel.", "error");
    }
}

// Search timeout handler
let searchTimeout;
function handleSearch(e) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        filters.search = e.target.value;
        currentPage = 1;
        loadDetailed();
    }, 400);
}

// Event Listeners for Dashboard custom multiselect POS filter
if (multiselectPosTrigger && multiselectPosContainer) {
    multiselectPosTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        multiselectPosContainer.classList.toggle("open");
    });
}

document.addEventListener("click", (e) => {
    if (multiselectPosContainer && !multiselectPosContainer.contains(e.target)) {
        multiselectPosContainer.classList.remove("open");
    }
});

function handlePosSelectionChange() {
    const checkedBoxes = Array.from(document.querySelectorAll(".pos-checkbox:checked"));
    const selectedValues = checkedBoxes.map(cb => cb.value);
    filters.pos_name = selectedValues.join(",");

    if (selectedValues.length === 0) {
        multiselectPosLabel.textContent = "-- Tất cả bưu cục --";
    } else if (selectedValues.length === 1) {
        multiselectPosLabel.textContent = selectedValues[0];
    } else {
        multiselectPosLabel.textContent = `Đã chọn ${selectedValues.length} bưu cục`;
    }

    currentPage = 1;
    loadDetailed();
}

if (multiselectPosSelectAll) {
    multiselectPosSelectAll.addEventListener("click", () => {
        document.querySelectorAll(".pos-checkbox").forEach(cb => cb.checked = true);
        handlePosSelectionChange();
    });
}

if (multiselectPosClear) {
    multiselectPosClear.addEventListener("click", () => {
        document.querySelectorAll(".pos-checkbox").forEach(cb => cb.checked = false);
        handlePosSelectionChange();
    });
}

// Event Listeners for Dashboard custom multiselect Category (Thời gian tồn) filter
if (multiselectCategoryTrigger && multiselectCategoryContainer) {
    multiselectCategoryTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        multiselectCategoryContainer.classList.toggle("open");
    });
}

document.addEventListener("click", (e) => {
    if (multiselectCategoryContainer && !multiselectCategoryContainer.contains(e.target)) {
        multiselectCategoryContainer.classList.remove("open");
    }
});

function handleCategorySelectionChange() {
    const checkedBoxes = Array.from(document.querySelectorAll(".category-checkbox:checked"));
    const selectedValues = checkedBoxes.map(cb => cb.value);
    filters.loai_ton = selectedValues.join(",");

    if (selectedValues.length === 0) {
        multiselectCategoryLabel.textContent = "-- Tất cả thời gian --";
    } else if (selectedValues.length === 1) {
        multiselectCategoryLabel.textContent = selectedValues[0];
    } else {
        multiselectCategoryLabel.textContent = `Đã chọn ${selectedValues.length} loại`;
    }

    currentPage = 1;
    loadDetailed();
}

if (multiselectCategorySelectAll) {
    multiselectCategorySelectAll.addEventListener("click", () => {
        document.querySelectorAll(".category-checkbox").forEach(cb => cb.checked = true);
        handleCategorySelectionChange();
    });
}

if (multiselectCategoryClear) {
    multiselectCategoryClear.addEventListener("click", () => {
        document.querySelectorAll(".category-checkbox").forEach(cb => cb.checked = false);
        handleCategorySelectionChange();
    });
}

// Event Listeners for Dashboard custom multiselect Status (Trạng thái) filter
if (multiselectStatusTrigger && multiselectStatusContainer) {
    multiselectStatusTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        multiselectStatusContainer.classList.toggle("open");
    });
}

document.addEventListener("click", (e) => {
    if (multiselectStatusContainer && !multiselectStatusContainer.contains(e.target)) {
        multiselectStatusContainer.classList.remove("open");
    }
});

function handleStatusSelectionChange() {
    const checkedBoxes = Array.from(document.querySelectorAll(".status-checkbox:checked"));
    const selectedValues = checkedBoxes.map(cb => cb.value);
    filters.status_name = selectedValues.join(",");

    if (selectedValues.length === 0) {
        multiselectStatusLabel.textContent = "-- Tất cả trạng thái --";
    } else if (selectedValues.length === 1) {
        multiselectStatusLabel.textContent = selectedValues[0];
    } else {
        multiselectStatusLabel.textContent = `Đã chọn ${selectedValues.length} trạng thái`;
    }

    currentPage = 1;
    loadDetailed();
}

if (multiselectStatusSelectAll) {
    multiselectStatusSelectAll.addEventListener("click", () => {
        document.querySelectorAll(".status-checkbox").forEach(cb => cb.checked = true);
        handleStatusSelectionChange();
    });
}

if (multiselectStatusClear) {
    multiselectStatusClear.addEventListener("click", () => {
        document.querySelectorAll(".status-checkbox").forEach(cb => cb.checked = false);
        handleStatusSelectionChange();
    });
}

// Event Listeners for Dashboard custom multiselect Nhóm KH filter
if (multiselectNhomKhTrigger && multiselectNhomKhContainer) {
    multiselectNhomKhTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        multiselectNhomKhContainer.classList.toggle("open");
    });
}

document.addEventListener("click", (e) => {
    if (multiselectNhomKhContainer && !multiselectNhomKhContainer.contains(e.target)) {
        multiselectNhomKhContainer.classList.remove("open");
    }
});

function handleNhomKhSelectionChange() {
    const checkedBoxes = Array.from(document.querySelectorAll(".nhom-kh-checkbox:checked"));
    const selectedValues = checkedBoxes.map(cb => cb.value);
    filters.nhom_kh = selectedValues.join(",");

    if (selectedValues.length === 0) {
        multiselectNhomKhLabel.textContent = "-- Tất cả Nhóm KH --";
    } else if (selectedValues.length === 1) {
        multiselectNhomKhLabel.textContent = selectedValues[0];
    } else {
        multiselectNhomKhLabel.textContent = `Đã chọn ${selectedValues.length} Nhóm KH`;
    }

    currentPage = 1;
    loadDetailed();
}

if (multiselectNhomKhSelectAll) {
    multiselectNhomKhSelectAll.addEventListener("click", () => {
        document.querySelectorAll(".nhom-kh-checkbox").forEach(cb => cb.checked = true);
        handleNhomKhSelectionChange();
    });
}

if (multiselectNhomKhClear) {
    multiselectNhomKhClear.addEventListener("click", () => {
        document.querySelectorAll(".nhom-kh-checkbox").forEach(cb => cb.checked = false);
        handleNhomKhSelectionChange();
    });
}

searchInput.addEventListener("input", handleSearch);

btnPrevPage.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadDetailed();
    }
});

btnNextPage.addEventListener("click", () => {
    if (currentPage * pageSize < totalRecords) {
        currentPage++;
        loadDetailed();
    }
});

btnRefresh.addEventListener("click", () => {
    if (isDashboardUrlError) {
        showToast("Dashboard tạm thời bị khóa do lỗi URL Power BI. Vui lòng liên hệ bộ phận IT.", "error");
        return;
    }
    loadSummary();
    loadDetailed();
    updateStatus();
});

// 4. Matrix Header Filtering
const matrixNhomKh = document.getElementById("matrix-nhom-kh");
if (matrixNhomKh) {
    matrixNhomKh.addEventListener("change", () => {
        if (isDashboardUrlError) return;
        loadSummary(); // Reload matrix data when group changes
    });
}

selectPageSize.addEventListener("change", (e) => {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    loadDetailed();
});

btnTriggerCrawl.addEventListener("click", (e) => {
    e.preventDefault();
    if (isDashboardUrlError) {
        showToast("Không thể thực hiện đồng bộ do lỗi URL Power BI. Vui lòng liên hệ bộ phận IT.", "error");
        return;
    }
    triggerCrawl();
});

btnExportExcel.addEventListener("click", exportExcel);

if (btnOpenColumnConfig) {
    btnOpenColumnConfig.addEventListener("click", () => {
        renderColumnConfigUI();
        columnConfigModal.style.display = "flex";
    });
}
if (btnCloseColumnConfig) {
    btnCloseColumnConfig.addEventListener("click", () => {
        columnConfigModal.style.display = "none";
    });
}
if (btnSaveColumnConfig) {
    btnSaveColumnConfig.addEventListener("click", () => {
        columnConfigModal.style.display = "none";
    });
}

// Locate all filtered items
if (btnLocateExcel) {
    btnLocateExcel.addEventListener("click", async () => {
        const originalHtml = btnLocateExcel.innerHTML;
        btnLocateExcel.disabled = true;
        btnLocateExcel.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lấy mã...`;

        try {
            // Fetch all records with current filters (without pagination limit)
            const queryParams = new URLSearchParams({
                page: 1,
                page_size: 100000,
                search: filters.search,
                pos_name: filters.pos_name,
                loai_ton: filters.loai_ton,
                status_name: filters.status_name,
                nhom_kh: filters.nhom_kh
            });

            const res = await fetch(`/api/detailed?${queryParams.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const codes = data.rows.map(r => r.item_code).filter(Boolean);

            if (codes.length === 0) {
                showToast("Không tìm thấy bưu gửi nào khớp bộ lọc hiện tại để định vị.", "warning");
                return;
            }

            // Populate textarea of export view
            if (codesInput) {
                codesInput.value = codes.join("\n");
                badgeCodesCount.textContent = `${codes.length} mã`;
            }

            // Switch to export tab
            switchView("export");

            // Highlight sidebar tab
            document.querySelectorAll(".sidebar-nav li").forEach(li => li.classList.remove("active"));
            const menuExport = document.getElementById("menu-export");
            if (menuExport) menuExport.classList.add("active");

            // Trigger start export batch process
            if (btnStartExport) {
                btnStartExport.click();
            }

        } catch (err) {
            console.error("Error fetching codes for localization:", err);
            showToast(`Lỗi lấy danh sách bưu gửi: ${err.message}`, "error");
        } finally {
            btnLocateExcel.disabled = false;
            btnLocateExcel.innerHTML = originalHtml;
        }
    });
}

// Sorting headers
document.querySelectorAll(".sortable").forEach(header => {
    header.addEventListener("click", () => {
        const col = header.getAttribute("data-col");

        if (sortCol === col) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
            sortCol = col;
            sortDir = (col === "loai_ton" || col === "cod_amount" || col === "weight") ? "desc" : "asc";
        }

        document.querySelectorAll(".sortable i").forEach(icon => {
            icon.className = "fa-solid fa-sort";
        });

        const icon = header.querySelector("i");
        icon.className = sortDir === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";

        loadDetailed();
    });
});

// Sorting matrix headers & quick total click via event delegation on #matrix-thead
const matrixTheadEl = document.getElementById("matrix-thead");
if (matrixTheadEl) {
    matrixTheadEl.addEventListener("click", (e) => {
        const header = e.target.closest(".sortable-matrix");
        if (header) {
            const col = header.getAttribute("data-sort");
            if (!col) return;

            if (matrixSortCol === col) {
                matrixSortDir = matrixSortDir === "asc" ? "desc" : "asc";
            } else {
                matrixSortCol = col;
                matrixSortDir = col === "pos_name" ? "asc" : "desc";
            }

            if (cachedSummaryData) {
                renderSummary(cachedSummaryData);
            }
            return;
        }

        const totalHeader = e.target.closest("#matrix-header-total");
        if (totalHeader) {
            openMatrixConfigModal("total");
        }
    });
}

// Drilldown click action on Matrix table row
if (matrixTbody) {
    matrixTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-drilldown");
        if (!btn) return;

        const posName = btn.getAttribute("data-pos");
        if (!posName) return;

        // 1. Check checkbox for this POS and uncheck all others
        const checkboxes = document.querySelectorAll(".pos-checkbox");
        checkboxes.forEach(cb => {
            if (cb.value === posName) {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });

        // 2. Update filters state and label UI
        filters.pos_name = posName;
        if (multiselectPosLabel) {
            multiselectPosLabel.textContent = posName;
        }

        // 3. Reload detailed paginated records
        currentPage = 1;
        loadDetailed();

        // 4. Smooth scroll to detailed section
        const detailedSection = document.getElementById("detailed-report-section");
        if (detailedSection) {
            detailedSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
}

// Highlight Logic
function applyHighlights() {
    const thresh3 = parseInt(document.getElementById("threshold-3").value) || 0;
    const thresh4 = parseInt(document.getElementById("threshold-4")?.value) || 0;
    const thresh5 = parseInt(document.getElementById("threshold-5").value) || 0;
    const thresh7 = parseInt(document.getElementById("threshold-7").value) || 0;
    const thresh14 = parseInt(document.getElementById("threshold-14").value) || 0;
    const threshTotal = parseInt(document.getElementById("threshold-total").value) || 0;

    const rows = document.querySelectorAll("#matrix-tbody tr:not(.total-row)");

    rows.forEach(row => {
        const posCell = row.querySelector(".pos-name-cell");
        if (!posCell) return;

        let shouldHighlightRow = false;

        const qtyCells = row.querySelectorAll(".qty-cell");
        qtyCells.forEach(cell => {
            const cat = cell.getAttribute("data-cat");
            const qty = parseInt(cell.getAttribute("data-qty")) || 0;

            let isHighlighted = false;
            if (cat === "≥3 ngày" && thresh3 > 0 && qty >= thresh3) isHighlighted = true;
            else if (cat === "≥4 ngày" && thresh4 > 0 && qty >= thresh4) isHighlighted = true;
            else if (cat === "≥5 ngày" && thresh5 > 0 && qty >= thresh5) isHighlighted = true;
            else if (cat === "≥7 ngày" && thresh7 > 0 && qty >= thresh7) isHighlighted = true;
            else if (cat === "≥14 ngày" && thresh14 > 0 && qty >= thresh14) isHighlighted = true;
            else if (cat === "Total" && threshTotal > 0 && qty >= threshTotal) isHighlighted = true;

            if (isHighlighted) {
                cell.classList.add("highlighted-cell");
                shouldHighlightRow = true;
            } else {
                cell.classList.remove("highlighted-cell");
            }
        });

        if (shouldHighlightRow) {
            row.classList.add("highlighted-row");
        } else {
            row.classList.remove("highlighted-row");
        }
    });
}

// Function to update active style for all filters/threshold inputs
function checkFilterActive(element) {
    if (!element) return;
    if (element.value && element.value.trim() !== "") {
        element.classList.add("filter-active");
    } else {
        element.classList.remove("filter-active");
    }
}

// Add general active check listeners to all input/select elements
document.querySelectorAll(".threshold-inputs input, .filters-container select, .filters-container input").forEach(el => {
    el.addEventListener("input", () => checkFilterActive(el));
    el.addEventListener("change", () => checkFilterActive(el));
});

// Add threshold input event listeners
if (document.getElementById("threshold-3")) document.getElementById("threshold-3").addEventListener("input", applyHighlights);
if (document.getElementById("threshold-4")) document.getElementById("threshold-4").addEventListener("input", applyHighlights);
if (document.getElementById("threshold-5")) document.getElementById("threshold-5").addEventListener("input", applyHighlights);
if (document.getElementById("threshold-7")) document.getElementById("threshold-7").addEventListener("input", applyHighlights);
if (document.getElementById("threshold-14")) document.getElementById("threshold-14").addEventListener("input", applyHighlights);
if (document.getElementById("threshold-total")) document.getElementById("threshold-total").addEventListener("input", applyHighlights);

// Reset all filters and highlights
document.getElementById("btn-reset-filters").addEventListener("click", () => {
    if (document.getElementById("threshold-3")) document.getElementById("threshold-3").value = "";
    if (document.getElementById("threshold-4")) document.getElementById("threshold-4").value = "";
    if (document.getElementById("threshold-5")) document.getElementById("threshold-5").value = "";
    if (document.getElementById("threshold-7")) document.getElementById("threshold-7").value = "";
    if (document.getElementById("threshold-14")) document.getElementById("threshold-14").value = "";
    if (document.getElementById("threshold-total")) document.getElementById("threshold-total").value = "";

    document.querySelectorAll(".pos-checkbox").forEach(cb => cb.checked = false);
    if (multiselectPosLabel) multiselectPosLabel.textContent = "-- Tất cả bưu cục --";
    document.querySelectorAll(".category-checkbox").forEach(cb => cb.checked = false);
    if (multiselectCategoryLabel) multiselectCategoryLabel.textContent = "-- Tất cả thời gian --";
    document.querySelectorAll(".status-checkbox").forEach(cb => cb.checked = false);
    if (multiselectStatusLabel) multiselectStatusLabel.textContent = "-- Tất cả trạng thái --";
    searchInput.value = "";

    filters.pos_name = "";
    filters.loai_ton = "";
    filters.status_name = "";
    filters.search = "";

    document.querySelectorAll(".threshold-inputs input, .filters-container select, .filters-container input").forEach(el => {
        checkFilterActive(el);
    });

    currentPage = 1;
    pageSize = 50;
    selectPageSize.value = "50";

    applyHighlights();
    sortCol = "loai_ton";
    sortDir = "desc";

    document.querySelectorAll(".sortable i").forEach(icon => {
        const parentTh = icon.closest("th");
        const colName = parentTh ? parentTh.getAttribute("data-col") : null;
        if (colName === "loai_ton") {
            icon.className = "fa-solid fa-sort-down";
        } else {
            icon.className = "fa-solid fa-sort";
        }
    });

    loadDetailed();

    matrixSortCol = "pos_name";
    matrixSortDir = "asc";

    document.querySelectorAll(".sortable-matrix i").forEach(icon => {
        icon.className = "fa-solid fa-sort";
    });

    if (cachedSummaryData) {
        renderSummary(cachedSummaryData);
    }
});


// =========================================================================
// --- NATIVE INTEGRATION: AUTHENTICATION, MULTI-VIEWS & EXCEL EXPORTER ---
// =========================================================================

// Auth UI components
const loginContainer = document.getElementById("login-container");
const mainAppContainer = document.getElementById("main-app-container");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

// Login Captcha State (no longer required during login)
async function loadLoginCaptcha() {
    // No-op: login captcha removed
}

// Bind refresh button if exists
const btnRefreshLoginCaptcha = document.getElementById("btn-refresh-login-captcha");
if (btnRefreshLoginCaptcha) {
    btnRefreshLoginCaptcha.addEventListener("click", loadLoginCaptcha);
}

// Login Submit Handler (Local DB checks on python backend port 8000)
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    loginError.style.display = "none";
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Đăng nhập thất bại.");
        }

        localStorage.setItem("vnpost_token", data.token);
        localStorage.setItem("vnpost_user", JSON.stringify(data.user));
        sessionStorage.setItem("vnpost_pass", password);

        showApp(data.user);
        initDashboard();

    } catch (err) {
        loginError.textContent = err.message;
        loginError.style.display = "block";
    }
});

// Setup application frame upon successful validation
function showApp(user) {
    loginContainer.style.display = "none";
    mainAppContainer.style.display = "flex";

    // User profile sidebar details
    document.getElementById("sidebar-user-profile").style.display = "flex";
    document.getElementById("sidebar-username").textContent = user.username;

    const roleText = user.role === "admin" ? "Quản trị viên" : "Nhân viên";
    document.getElementById("sidebar-user-role").textContent = roleText;

    // Access role permission check for user management view
    const menuUsers = document.getElementById("menu-users");
    if (user.role === "admin") {
        menuUsers.style.display = "flex";
    } else {
        menuUsers.style.display = "none";
    }

    // Initialize system config settings tab elements and event listeners
    initSettingsView();

    // Set to default dashboard view
    switchView("dashboard");
}

// Logout handler
document.getElementById("menu-logout").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("vnpost_token");
    localStorage.removeItem("vnpost_user");
    sessionStorage.removeItem("vnpost_pass");
    stopSessionPolling();
    mainAppContainer.style.display = "none";
    loginContainer.style.display = "flex";
});


// Tab / View Switching controller
const views = ["dashboard", "export", "locton", "users"];
let activeView = "dashboard";


function switchView(viewName) {
    activeView = viewName;
    views.forEach(v => {
        const menuEl = document.getElementById(`menu-${v}`);
        const viewEl = document.getElementById(`view-${v}`);
        if (v === viewName) {
            if (menuEl) menuEl.classList.add("active");
            if (viewEl) viewEl.classList.add("active");
        } else {
            if (menuEl) menuEl.classList.remove("active");
            if (viewEl) viewEl.classList.remove("active");
        }
    });

    // Handle Power BI URL error overlay & sticky banner visibility across views
    if (isDashboardUrlError) {
        const overlay = document.getElementById("dashboard-url-error-overlay");
        const stickyBanner = document.getElementById("sticky-pbi-error-banner");
        const viewExport = document.getElementById("view-export");

        if (viewName === "dashboard") {
            if (overlay) overlay.style.display = "flex";
            if (stickyBanner) stickyBanner.style.display = "none";
        } else if (viewName === "export") {
            if (!isErrorBannerMinimized) {
                if (overlay) overlay.style.display = "flex";
                if (viewExport) viewExport.classList.add("view-locked");
                if (stickyBanner) stickyBanner.style.display = "none";
            } else {
                if (overlay) overlay.style.display = "none";
                if (viewExport) viewExport.classList.remove("view-locked");
                if (stickyBanner) stickyBanner.style.display = "flex";
            }
        }
    }

    // Start active view specific operations
    if (viewName === "export") {
        loadSessionsStatus();
        startSessionPolling();
    } else {
        stopSessionPolling();
    }

    if (viewName === "locton") {
        initLoctonView();
    }

    if (viewName === "users") {
        loadUsersList();
    }
}

// Bind navigation clicks
views.forEach(v => {
    const btn = document.getElementById(`menu-${v}`);
    if (btn) {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            switchView(v);
        });
    }
});


// ==========================================
// --- PORT 5000: EXCEL EXPORTER CORE WORKERS ---
// ==========================================

let activeSessionIndexes = [];
let userConcurrencyLimit = 3;
let sessionPollInterval = null;

function startSessionPolling() {
    if (sessionPollInterval) clearInterval(sessionPollInterval);
    sessionPollInterval = setInterval(loadSessionsStatus, 5000);
}

function stopSessionPolling() {
    if (sessionPollInterval) {
        clearInterval(sessionPollInterval);
        sessionPollInterval = null;
    }
}

// Fetch connection thread states from Node.js port 5000
let captchaSessionIndex = 0;
let isCaptchaRefresh = false;
let currentCaptchaFields = null;
let currentCaptchaCookies = null;

async function loadSessionsStatus() {
    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/vnpost/sessions-status`, {
            headers: getHeaders()
        });
        if (!res.ok) return;
        const resultData = await res.json();
        const sessions = resultData.sessions || [];

        const user = JSON.parse(localStorage.getItem("vnpost_user") || "{}");
        userConcurrencyLimit = user.concurrencyLimit || user.concurrency_limit || 3;

        const activeCount = sessions.filter(s => s.active).length;
        document.getElementById("active-thread-count").textContent = `${activeCount}/${userConcurrencyLimit}`;

        const container = document.getElementById("sessions-container");
        container.innerHTML = "";

        activeSessionIndexes = [];

        for (let i = 0; i < userConcurrencyLimit; i++) {
            const session = sessions.find(s => s.index === i);
            const btn = document.createElement("button");
            btn.className = "compact-thread-btn";

            if (session && session.active) {
                btn.classList.add("active");
                btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Luồng ${i + 1}`;
                btn.title = `Luồng ${i + 1}: Hoạt động tốt`;
                activeSessionIndexes.push(i);
            } else {
                btn.classList.add("expired");
                // For Luồng 1 (index 0), it is always treated as refreshable slot 0
                const isRefresh = (session !== undefined) || (i === 0);
                const statusText = isRefresh ? "Hết hạn" : "Chưa kết nối";
                btn.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Luồng ${i + 1}`;
                btn.title = `Luồng ${i + 1}: ${statusText} (Bấm để giải captcha kết nối)`;
                btn.addEventListener("click", () => showSessionCaptchaForm(i, isRefresh));
            }
            container.appendChild(btn);
        }

    } catch (err) {
        console.error("Error loading sessions:", err);
    }
}

// Display captcha form inline in export view
async function showSessionCaptchaForm(index, isRefresh) {
    captchaSessionIndex = index;
    isCaptchaRefresh = isRefresh;

    // Auto switch to export view so the captcha form is immediately visible!
    switchView("export");

    const formBox = document.getElementById("session-captcha-form");
    document.getElementById("session-captcha-title").textContent = isRefresh
        ? `Giải Captcha Khôi phục Luồng ${index + 1}`
        : `Giải Captcha Tạo Luồng ${index + 1}`;

    formBox.style.display = "flex";
    loadSessionCaptchaImage();

    showToast(`Luồng ${index + 1} yêu cầu giải captcha để tiếp tục.`, "warning");
}

async function loadSessionCaptchaImage() {
    const wrapper = document.getElementById("session-captcha-img-wrapper");
    wrapper.innerHTML = `<span class="captcha-placeholder">Đang tải...</span>`;

    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/vnpost/session-captcha?sessionIndex=${captchaSessionIndex}&t=${Date.now()}`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Không thể tải captcha");

        const data = await res.json();
        currentCaptchaFields = data.fields;
        currentCaptchaCookies = data.cookies;

        wrapper.innerHTML = `<img src="${data.captchaImage}" alt="Captcha VNPost" />`;
    } catch (err) {
        wrapper.innerHTML = `<span class="text-red">Lỗi tải Captcha.</span>`;
    }
}

document.getElementById("btn-refresh-session-captcha").addEventListener("click", loadSessionCaptchaImage);

document.getElementById("btn-session-captcha-cancel").addEventListener("click", () => {
    document.getElementById("session-captcha-form").style.display = "none";
});

document.getElementById("frm-session-captcha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const solution = document.getElementById("session-captcha-input").value;
    const isRefresh = isCaptchaRefresh || (captchaSessionIndex === 0);
    const url = isRefresh
        ? `${API_BASE_DINHVI}/api/vnpost/refresh-session`
        : `${API_BASE_DINHVI}/api/vnpost/add-session`;

    const storedPass = sessionStorage.getItem("vnpost_pass") || "";

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getHeaders()
            },
            body: JSON.stringify({
                sessionIndex: captchaSessionIndex,
                captchaSolution: solution,
                initialFields: currentCaptchaFields,
                initialCookies: currentCaptchaCookies,
                password: storedPass
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Gửi captcha thất bại.");
        }

        document.getElementById("session-captcha-input").value = "";
        document.getElementById("session-captcha-form").style.display = "none";
        showToast(data.message || `Đã kết nối thành công Luồng ${captchaSessionIndex + 1}!`, "success");
        loadSessionsStatus();

    } catch (err) {
        showToast("Lỗi giải captcha: " + err.message, "error");
        loadSessionCaptchaImage();
    }
});

// Reset threads
document.getElementById("btn-reset-sessions").addEventListener("click", async () => {
    if (!confirm("Bạn có chắc chắn muốn đặt lại tất cả các luồng kết nối VNPost không?")) return;
    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/vnpost/reset-sessions`, {
            method: "POST",
            headers: getHeaders()
        });
        if (res.ok) {
            loadSessionsStatus();
            showToast("Đã đặt lại tất cả các luồng kết nối.", "success");
        } else {
            const data = await res.json();
            showToast("Lỗi: " + data.error, "error");
        }
    } catch (err) {
        showToast("Lỗi kết nối: " + err.message, "error");
    }
});

// Add new thread button logic
const btnAddSession = document.getElementById("btn-add-session");
if (btnAddSession) {
    btnAddSession.addEventListener("click", () => {
        const activeIndices = activeSessionIndexes;
        let nextIndex = -1;
        for (let i = 0; i < userConcurrencyLimit; i++) {
            if (!activeIndices.includes(i)) {
                nextIndex = i;
                break;
            }
        }
        if (nextIndex === -1) {
            showToast("Bạn đã mở tối đa số luồng cấu hình của tài khoản này.", "warning");
            return;
        }
        showSessionCaptchaForm(nextIndex, false);
    });
}

// Excel Exporter Core worker pool execution
const btnStartExport = document.getElementById("btn-start-export");
const codesInput = document.getElementById("export-codes-input");
const badgeCodesCount = document.getElementById("badge-codes-count");

codesInput.addEventListener("input", () => {
    const text = codesInput.value.trim();
    if (!text) {
        badgeCodesCount.textContent = "0 mã";
        return;
    }
    const codes = text.split(/[\s,\n]+/).filter(c => c.trim().length > 0);
    badgeCodesCount.textContent = `${codes.length} mã`;
});

document.getElementById("btn-load-sample-codes").addEventListener("click", () => {
    codesInput.value = "CE991562158VN\nCC817263541VN\nCE123456789VN";
    badgeCodesCount.textContent = "3 mã";
});

document.getElementById("btn-clear-codes").addEventListener("click", () => {
    codesInput.value = "";
    badgeCodesCount.textContent = "0 mã";
});

let exportLoading = false;
function addExportLog(message, type = "info") {
    const consoleLogs = document.getElementById("export-console-logs");
    const div = document.createElement("div");
    div.className = `log-row ${type}`;
    const now = new Date().toLocaleTimeString();
    div.textContent = `[${now}] ${message}`;
    consoleLogs.appendChild(div);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

btnStartExport.addEventListener("click", async () => {
    if (exportLoading) return;

    const text = codesInput.value.trim();
    if (!text) {
        showToast("Vui lòng nhập mã bưu gửi.", "warning");
        return;
    }

    if (activeSessionIndexes.length === 0) {
        showToast("Không có luồng kết nối VNPost nào đang hoạt động. Vui lòng kết nối ít nhất 1 luồng.", "error");
        return;
    }

    const codes = text.split(/[\s,\n]+/).map(c => c.trim().toUpperCase()).filter(c => c.length > 0);
    if (codes.length === 0) {
        showToast("Mã bưu gửi không hợp lệ.", "warning");
        return;
    }

    exportLoading = true;
    btnStartExport.disabled = true;
    document.getElementById("export-download-wrapper").style.display = "none";

    // Update sidebar nav label at start
    const menuExport = document.getElementById("menu-export");
    if (menuExport) {
        menuExport.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: var(--accent-emerald);"></i> Đang định vị (0%)`;
    }

    const batchSize = parseInt(localStorage.getItem("export_batch_size")) || 50;
    const chunks = [];
    for (let i = 0; i < codes.length; i += batchSize) {
        chunks.push(codes.slice(i, i + batchSize));
    }
    const totalBatches = chunks.length;

    const checklist = document.getElementById("export-batches-checklist");
    checklist.innerHTML = "";
    document.getElementById("export-console-logs").innerHTML = "";

    const progressBar = document.getElementById("export-progress-bar");
    const progressText = document.getElementById("export-progress-text");
    progressBar.style.width = "0%";
    progressText.textContent = "0%";

    addExportLog(`Bắt đầu xuất định vị cho ${codes.length} bưu gửi...`, "info");
    addExportLog(`Phân chia thành ${totalBatches} lô xử lý. Số luồng đồng thời: ${activeSessionIndexes.length}.`, "info");

    chunks.map((chunk, idx) => {
        const label = document.createElement("div");
        label.className = "batch-label pending";
        label.id = `batch-label-${idx}`;
        label.textContent = idx + 1;
        label.title = `Lô ${idx + 1}: ${idx * batchSize + 1} - ${Math.min((idx + 1) * batchSize, codes.length)}`;
        checklist.appendChild(label);
    });

    const excelBuffers = new Array(totalBatches).fill(null);
    let successCount = 0;
    let hasError = false;
    let nextIndex = 0;

    const downloadBatch = async (index, workerId) => {
        const batchCodes = chunks[index];
        const label = document.getElementById(`batch-label-${index}`);
        label.className = "batch-label processing";

        addExportLog(`Luồng ${workerId + 1} đang tải Lô ${index + 1}/${totalBatches}...`, "info");

        try {
            const res = await fetch(`${API_BASE_DINHVI}/api/export-batch`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getHeaders()
                },
                body: JSON.stringify({
                    codes: batchCodes,
                    sessionIndex: activeSessionIndexes[workerId]
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            excelBuffers[index] = arrayBuffer;
            successCount += batchCodes.length;

            label.className = "batch-label success";
            addExportLog(`Lô ${index + 1}/${totalBatches} thành công.`, "success");

            const completedCount = excelBuffers.filter(Boolean).length;
            const pct = Math.round(5 + (completedCount / totalBatches) * 80);
            const pctText = `${pct}%`;
            progressBar.style.width = pctText;
            progressText.textContent = pctText;

            // Update sidebar nav label
            const menuExport = document.getElementById("menu-export");
            if (menuExport) {
                menuExport.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: var(--accent-emerald);"></i> Đang định vị (${pctText})`;
            }

        } catch (err) {
            label.className = "batch-label error";
            addExportLog(`Lỗi tải Lô ${index + 1}: ${err.message}`, "error");
            if (err.message.includes("Cookie") || err.message.includes("hết hạn")) {
                hasError = true;
            }
        }
    }

    const worker = async (workerId) => {
        while (nextIndex < totalBatches && !hasError) {
            const currentIndex = nextIndex++;
            await downloadBatch(currentIndex, workerId);
        }
    };

    const workers = [];
    const concurrency = Math.min(activeSessionIndexes.length, totalBatches);
    for (let i = 0; i < concurrency; i++) {
        workers.push(worker(i));
    }

    await Promise.all(workers);

    const validBuffers = excelBuffers.filter(Boolean);
    if (hasError || validBuffers.length === 0) {
        progressBar.style.width = "0%";
        progressText.textContent = "0%";
        addExportLog("Tiến trình xuất dữ liệu bị hủy bỏ do lỗi phiên VNPost hoặc captcha luồng.", "error");
        exportLoading = false;
        btnStartExport.disabled = false;
        return;
    }

    addExportLog(`Đã tải xong các lô. Đang kết hợp và gộp file...`, "info");
    progressBar.style.width = "90%";
    progressText.textContent = "90%";

    try {
        const arrayBufferToBase64 = (buffer) => {
            let binary = "";
            const bytes = new Uint8Array(buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        };

        const base64Buffers = validBuffers.map(buf => arrayBufferToBase64(buf));

        const mergeRes = await fetch(`${API_BASE_DINHVI}/api/merge-and-save`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getHeaders()
            },
            body: JSON.stringify({
                buffers: base64Buffers,
                totalCodes: codes.length
            })
        });

        if (mergeRes.ok) {
            const blob = await mergeRes.blob();
            let fileName = `DanhSachBuuGui_Gop_${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.xlsx`;
            const disposition = mergeRes.headers.get("content-disposition");
            if (disposition && disposition.indexOf("filename=") !== -1) {
                const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                if (matches != null && matches[1]) {
                    fileName = matches[1].replace(/['"]/g, '');
                }
            }

            const downloadUrl = window.URL.createObjectURL(blob);
            const downloadBtn = document.getElementById("btn-download-export-file");
            if (downloadBtn) {
                downloadBtn.href = downloadUrl;
                downloadBtn.download = fileName;
            }
            document.getElementById("export-download-wrapper").style.display = "block";

            // Tự động tải xuống file Excel
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            progressBar.style.width = "100%";
            progressText.textContent = "100%";
            addExportLog(`Hoàn tất! Xuất thành công ${successCount}/${codes.length} bưu gửi. Đang tải file...`, "success");
        } else {
            let errorMsg = "Lỗi gộp dữ liệu Excel.";
            try {
                const errData = await mergeRes.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (e) {}
            progressBar.style.width = "0%";
            progressText.textContent = "0%";
            addExportLog(`Lỗi: ${errorMsg}`, "error");
        }
    } catch (err) {
        progressBar.style.width = "0%";
        progressText.textContent = "0%";
        addExportLog(`Lỗi kết nối gộp dữ liệu: ${err.message}`, "error");
    } finally {
        exportLoading = false;
        btnStartExport.disabled = false;

        // Restore sidebar nav label
        const menuExport = document.getElementById("menu-export");
        if (menuExport) {
            menuExport.innerHTML = `<i class="fa-solid fa-file-excel"></i> Xuất Excel (Định vị)`;
        }
    }
});


// ==========================================
// --- SETTINGS VIEW HANDLERS ---
// ==========================================

const cookieForm = document.getElementById("settings-cookie-form");
const cookieAlert = document.getElementById("cookie-settings-alert");

if (cookieForm) {
    cookieForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const cookieVal = document.getElementById("settings-cookie-input").value.trim();
        cookieAlert.style.display = "none";

        try {
            const res = await fetch("/api/user/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getHeaders()
                },
                body: JSON.stringify({ vnpost_cookie: cookieVal })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể lưu Cookie.");

            cookieAlert.className = "alert success";
            cookieAlert.textContent = "Đã lưu Cookie thành công!";
            cookieAlert.style.display = "block";
            document.getElementById("settings-cookie-input").value = "";

            const user = JSON.parse(localStorage.getItem("vnpost_user") || "{}");
            user.hasVnpostCookie = true;
            localStorage.setItem("vnpost_user", JSON.stringify(user));

        } catch (err) {
            cookieAlert.className = "alert danger";
            cookieAlert.textContent = err.message;
            cookieAlert.style.display = "block";
        }
    });
}

const passwordForm = document.getElementById("settings-password-form");
const passwordAlert = document.getElementById("password-settings-alert");

if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newPass = document.getElementById("settings-new-password").value;
        const confirmPass = document.getElementById("settings-confirm-password").value;

        passwordAlert.style.display = "none";
        if (newPass !== confirmPass) {
            passwordAlert.className = "alert danger";
            passwordAlert.textContent = "Mật khẩu xác nhận không khớp.";
            passwordAlert.style.display = "block";
            return;
        }

        try {
            const res = await fetch("/api/user/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getHeaders()
                },
                body: JSON.stringify({ password: newPass })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể đổi mật khẩu.");

            passwordAlert.className = "alert success";
            passwordAlert.textContent = "Đổi mật khẩu thành công!";
            passwordAlert.style.display = "block";
            document.getElementById("settings-new-password").value = "";
            document.getElementById("settings-confirm-password").value = "";
        } catch (err) {
            passwordAlert.className = "alert danger";
            passwordAlert.textContent = err.message;
            passwordAlert.style.display = "block";
        }
    });
}


// ==========================================
// --- USERS MANAGEMENT VIEW HANDLERS ---
// ==========================================

async function loadUsersList() {
    const tbody = document.getElementById("users-table-tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Đang tải danh sách tài khoản...</td></tr>`;

    try {
        const res = await fetch("/api/admin/users", {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Không thể tải danh sách tài khoản.");
        const data = await res.json();

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Không có tài khoản người dùng nào.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        data.forEach(user => {
            const tr = document.createElement("tr");
            const roleBadge = user.role === "admin" ? "badge badge-success" : "badge badge-primary";
            const roleText = user.role === "admin" ? "Admin" : "Nhân viên";
            const vnpostUserText = user.vnpost_username ? `<code style="font-size: 13px; color: var(--accent-emerald); font-weight: bold;">${user.vnpost_username}</code>` : `<span class="text-muted" style="font-size: 13px;">Chưa cấu hình</span>`;

            tr.innerHTML = `
                <td style="font-weight: 700;">${user.username}</td>
                <td>${vnpostUserText}</td>
                <td><span class="${roleBadge}">${roleText}</span></td>
                <td>${user.concurrency_limit} luồng</td>
                <td>${user.created_at || '-'}</td>
                <td class="text-right">
                    <button class="btn btn-secondary btn-sm btn-edit-user"><i class="fa-solid fa-pen"></i> Sửa</button>
                    <button class="btn btn-danger btn-sm btn-delete-user"><i class="fa-solid fa-trash"></i> Xóa</button>
                </td>
            `;

            tr.querySelector(".btn-edit-user").addEventListener("click", () => openEditUserModal(user));
            tr.querySelector(".btn-delete-user").addEventListener("click", () => deleteUserAccount(user.id));

            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red">Lỗi: ${err.message}</td></tr>`;
    }
}

// Import from BCCP Modal Handlers
const importModal = document.getElementById("import-user-modal");
const importPasteArea = document.getElementById("import-paste-area");
const importPreviewWrapper = document.getElementById("import-preview-wrapper");
const importPreviewTbody = document.getElementById("import-preview-tbody");
const btnProcessPasted = document.getElementById("btn-process-pasted");
const btnSubmitImport = document.getElementById("btn-submit-import");
const importSelectAll = document.getElementById("import-select-all");
let parsedImportUsers = [];

// Open Import Modal
document.getElementById("btn-open-import-modal").addEventListener("click", () => {
    importPasteArea.value = "";
    importPreviewWrapper.style.display = "none";
    importPreviewTbody.innerHTML = "";
    btnSubmitImport.disabled = true;
    parsedImportUsers = [];
    importModal.style.display = "flex";
});

const closeImportModal = () => {
    importModal.style.display = "none";
};
document.getElementById("btn-close-import-modal").addEventListener("click", closeImportModal);
document.getElementById("btn-cancel-import-modal").addEventListener("click", closeImportModal);

// Parse Pasted Clipboard Data
function parsePastedData(rawText) {
    const users = [];
    if (rawText.trim().startsWith("<") || rawText.includes("</td>") || rawText.includes("</tr>")) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawText, "text/html");
        const rows = doc.querySelectorAll("tr");
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll("td, th")).map(c => c.textContent.trim());
            if (cells.length >= 2) {
                const username = cells.find(c => /^[a-zA-Z0-9_\-\.]{3,30}$/.test(c) && !/^\d+$/.test(c));
                if (username) {
                    const name = cells.find(c => c !== username && c.length > 3 && !/^\d+$/.test(c) && !c.includes("@") && isNaN(c));
                    users.push({
                        username: username.toLowerCase(),
                        vnpost_username: username,
                        name: name || username
                    });
                }
            }
        });
    }

    if (users.length === 0) {
        const lines = rawText.split("\n");
        lines.forEach(line => {
            const cells = line.split("\t").map(c => c.trim());
            if (cells.length >= 2) {
                const username = cells.find(c => /^[a-zA-Z0-9_\-\.]{3,30}$/.test(c) && !/^\d+$/.test(c));
                if (username) {
                    const name = cells.find(c => c !== username && c.length > 3 && !/^\d+$/.test(c) && !c.includes("@") && isNaN(c));
                    users.push({
                        username: username.toLowerCase(),
                        vnpost_username: username,
                        name: name || username
                    });
                }
            }
        });
    }

    if (users.length === 0) {
        const lines = rawText.split("\n");
        lines.forEach(line => {
            const val = line.trim();
            if (/^[a-zA-Z0-9_\-\.]{3,30}$/.test(val) && !/^\d+$/.test(val)) {
                users.push({
                    username: val.toLowerCase(),
                    vnpost_username: val,
                    name: val
                });
            }
        });
    }

    const seen = new Set();
    return users.filter(u => {
        if (seen.has(u.username)) return false;
        seen.add(u.username);
        return true;
    });
}

// Process Paste Area
btnProcessPasted.addEventListener("click", () => {
    const rawText = importPasteArea.value;
    if (!rawText.trim()) {
        showToast("Vui lòng dán dữ liệu bôi đen từ trang BCCP trước.", "warning");
        return;
    }

    parsedImportUsers = parsePastedData(rawText);

    if (parsedImportUsers.length === 0) {
        showToast("Không tìm thấy tài khoản nào trong dữ liệu dán. Hãy kiểm tra lại định dạng.", "warning");
        importPreviewWrapper.style.display = "none";
        btnSubmitImport.disabled = true;
        return;
    }

    // Render preview
    importPreviewTbody.innerHTML = "";
    parsedImportUsers.forEach((user, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="import-user-check" data-idx="${index}" checked></td>
            <td><strong style="color: var(--accent-emerald);">${user.vnpost_username}</strong></td>
            <td>${user.name}</td>
            <td><input type="number" class="input-field import-user-concurrency" data-idx="${index}" value="3" min="1" max="10" style="padding: 4px 8px; width: 60px; font-size: 13px; height: 30px; border-radius: 4px;"></td>
        `;
        importPreviewTbody.appendChild(tr);
    });

    document.getElementById("import-detected-count").textContent = `Tìm thấy ${parsedImportUsers.length} tài khoản`;
    importPreviewWrapper.style.display = "block";
    btnSubmitImport.disabled = false;

    showToast(`Đã bóc tách thành công ${parsedImportUsers.length} tài khoản.`, "success");
});

// Select/Deselect All Checkbox
importSelectAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll(".import-user-check").forEach(cb => cb.checked = isChecked);
});

// Submit imported users
btnSubmitImport.addEventListener("click", async () => {
    const selectedUsers = [];
    const rows = importPreviewTbody.querySelectorAll("tr");

    rows.forEach(row => {
        const cb = row.querySelector(".import-user-check");
        if (cb && cb.checked) {
            const idx = parseInt(cb.getAttribute("data-idx"));
            const concurrencyInput = row.querySelector(".import-user-concurrency");
            const concurrencyVal = concurrencyInput ? parseInt(concurrencyInput.value) || 3 : 3;

            selectedUsers.push({
                username: parsedImportUsers[idx].username,
                role: "staff",
                concurrency_limit: concurrencyVal,
                vnpost_username: parsedImportUsers[idx].vnpost_username,
                vnpost_password: ""
            });
        }
    });

    if (selectedUsers.length === 0) {
        showToast("Vui lòng chọn ít nhất 1 tài khoản để nhập.", "warning");
        return;
    }

    btnSubmitImport.disabled = true;
    btnSubmitImport.textContent = "Đang đồng bộ...";

    try {
        const res = await fetch("/api/admin/import-users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getHeaders()
            },
            body: JSON.stringify({ users: selectedUsers })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Đồng bộ thất bại.");

        showToast(data.message, "success");
        importModal.style.display = "none";
        loadUsersList();
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btnSubmitImport.disabled = false;
        btnSubmitImport.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Xác nhận nhập tài khoản`;
    }
});

const userModal = document.getElementById("user-modal");
const userModalForm = document.getElementById("user-modal-form");
const userAlert = document.getElementById("users-alert");

document.getElementById("btn-open-create-user-modal").addEventListener("click", () => {
    document.getElementById("user-modal-title").textContent = "Tạo tài khoản mới";
    document.getElementById("user-modal-id").value = "";
    document.getElementById("user-modal-username").value = "";
    document.getElementById("user-modal-username").disabled = false;
    document.getElementById("user-modal-password").value = "";
    document.getElementById("user-modal-password").required = true;
    document.getElementById("user-modal-password-label").textContent = "Mật khẩu";
    document.getElementById("user-modal-password-help").style.display = "none";
    document.getElementById("user-modal-role").value = "staff";
    document.getElementById("user-modal-concurrency").value = "3";
    document.getElementById("user-modal-vnpost-username").value = "";
    document.getElementById("user-modal-vnpost-password").value = "";
    userModal.style.display = "flex";
});

window.openEditUserModal = function (user) {
    document.getElementById("user-modal-title").textContent = `Chỉnh sửa tài khoản: ${user.username}`;
    document.getElementById("user-modal-id").value = user.id;
    document.getElementById("user-modal-username").value = user.username;
    document.getElementById("user-modal-username").disabled = true;
    document.getElementById("user-modal-password").value = "";
    document.getElementById("user-modal-password").required = false;
    document.getElementById("user-modal-password-label").textContent = "Mật khẩu mới";
    document.getElementById("user-modal-password-help").style.display = "block";
    document.getElementById("user-modal-role").value = user.role;
    document.getElementById("user-modal-concurrency").value = user.concurrency_limit;
    document.getElementById("user-modal-vnpost-username").value = user.vnpost_username || "";
    document.getElementById("user-modal-vnpost-password").value = user.vnpost_password || "";
    userModal.style.display = "flex";
};

const closeUserModal = () => {
    userModal.style.display = "none";
};
document.getElementById("btn-close-user-modal").addEventListener("click", closeUserModal);
document.getElementById("btn-cancel-user-modal").addEventListener("click", closeUserModal);

userModalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("user-modal-id").value;
    const username = document.getElementById("user-modal-username").value;
    const password = document.getElementById("user-modal-password").value;
    const role = document.getElementById("user-modal-role").value;
    const concurrency = parseInt(document.getElementById("user-modal-concurrency").value);
    const vnpostUsername = document.getElementById("user-modal-vnpost-username").value.trim();
    const vnpostPassword = document.getElementById("user-modal-vnpost-password").value;

    userAlert.style.display = "none";

    const isEdit = id !== "";
    const url = isEdit ? `/api/admin/users/${id}` : "/api/admin/users";
    const method = isEdit ? "PUT" : "POST";

    const body = {
        role,
        concurrency_limit: concurrency,
        vnpost_username: vnpostUsername,
        vnpost_password: vnpostPassword
    };
    if (!isEdit) {
        body.username = username;
        body.password = password;
    } else if (password.trim() !== "") {
        body.password = password;
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                ...getHeaders()
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Không thể thực hiện tác vụ.");

        userModal.style.display = "none";
        loadUsersList();

        // If editing the currently logged-in user, refresh their info in localStorage!
        const currentUser = JSON.parse(localStorage.getItem("vnpost_user") || "{}");
        if (isEdit && parseInt(id) === currentUser.id) {
            currentUser.concurrencyLimit = concurrency;
            localStorage.setItem("vnpost_user", JSON.stringify(currentUser));
            loadSessionsStatus();
        }

        userAlert.className = "alert success";
        userAlert.textContent = isEdit ? "Cập nhật tài khoản thành công!" : "Tạo tài khoản thành công!";
        userAlert.style.display = "block";
    } catch (err) {
        showToast("Lỗi: " + err.message, "error");
    }
});

window.deleteUserAccount = async function (id) {
    if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này không? Tác vụ này không thể khôi phục.")) return;
    userAlert.style.display = "none";
    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: "DELETE",
            headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Không thể xóa tài khoản.");

        loadUsersList();
        userAlert.className = "alert success";
        userAlert.textContent = "Đã xóa tài khoản thành công.";
        userAlert.style.display = "block";
    } catch (err) {
        userAlert.className = "alert danger";
        userAlert.textContent = err.message;
        userAlert.style.display = "block";
    }
};


// ==========================================================
// --- RUNNER & POLLING SERVICES INITIALIZER ---
// ==========================================================

// Main Application entry point
async function init() {
    const token = localStorage.getItem("vnpost_token");
    if (!token) {
        loginContainer.style.display = "flex";
        mainAppContainer.style.display = "none";
        return;
    }

    // Check if stored JWT token is valid
    try {
        const res = await fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();

        const data = await res.json();
        localStorage.setItem("vnpost_user", JSON.stringify(data));
        showApp(data);
        initSettingsView();

        await initDashboard();

    } catch (err) {
        localStorage.removeItem("vnpost_token");
        localStorage.removeItem("vnpost_user");
        sessionStorage.removeItem("vnpost_pass");
        loginContainer.style.display = "flex";
        mainAppContainer.style.display = "none";
    }
}

async function initDashboard() {
    // Populate default highlight thresholds from localStorage if set
    if (document.getElementById("threshold-3")) document.getElementById("threshold-3").value = localStorage.getItem("default_thresh_3") || "";
    if (document.getElementById("threshold-4")) document.getElementById("threshold-4").value = localStorage.getItem("default_thresh_4") || "";
    if (document.getElementById("threshold-5")) document.getElementById("threshold-5").value = localStorage.getItem("default_thresh_5") || "";
    if (document.getElementById("threshold-7")) document.getElementById("threshold-7").value = localStorage.getItem("default_thresh_7") || "";
    if (document.getElementById("threshold-14")) document.getElementById("threshold-14").value = localStorage.getItem("default_thresh_14") || "";
    if (document.getElementById("threshold-total")) document.getElementById("threshold-total").value = localStorage.getItem("default_thresh_total") || "";

    // Set visual filter-active classes
    document.querySelectorAll(".threshold-inputs input").forEach(el => checkFilterActive(el));

    // Initialize UI configs & Matrix Quick Config Popover Modal immediately
    initMatrixTotalQuickConfig();
    loadColumnConfig();
    renderColumnConfigUI();
    renderDetailedHeader();

    // Fetch live data from backend
    try {
        await updateStatus();
        await loadFilters();
        await loadSummary();
        await loadDetailed();
    } catch (e) {
        console.error("Error loading dashboard data:", e);
    }
}

const MODAL_VIS_MAP = [
    { id: "modal-vis-col-0", val: "<1 ngày" },
    { id: "modal-vis-col-1", val: "≥1 ngày" },
    { id: "modal-vis-col-1-5", val: "≥1.5 ngày" },
    { id: "modal-vis-col-2", val: "≥2 ngày" },
    { id: "modal-vis-col-3", val: "≥3 ngày" },
    { id: "modal-vis-col-4", val: "≥4 ngày" },
    { id: "modal-vis-col-5", val: "≥5 ngày" },
    { id: "modal-vis-col-7", val: "≥7 ngày" },
    { id: "modal-vis-col-14", val: "≥14 ngày" }
];

const MODAL_CFG_MAP = [
    { id: "modal-cfg-col-0", val: "<1 ngày" },
    { id: "modal-cfg-col-1", val: "≥1 ngày" },
    { id: "modal-cfg-col-1-5", val: "≥1.5 ngày" },
    { id: "modal-cfg-col-2", val: "≥2 ngày" },
    { id: "modal-cfg-col-3", val: "≥3 ngày" },
    { id: "modal-cfg-col-4", val: "≥4 ngày" },
    { id: "modal-cfg-col-5", val: "≥5 ngày" },
    { id: "modal-cfg-col-7", val: "≥7 ngày" },
    { id: "modal-cfg-col-14", val: "≥14 ngày" }
];

const SETTINGS_MAP = [
    { id: "cfg-col-0", val: "<1 ngày" },
    { id: "cfg-col-1", val: "≥1 ngày" },
    { id: "cfg-col-1-5", val: "≥1.5 ngày" },
    { id: "cfg-col-2", val: "≥2 ngày" },
    { id: "cfg-col-3", val: "≥3 ngày" },
    { id: "cfg-col-4", val: "≥4 ngày" },
    { id: "cfg-col-5", val: "≥5 ngày" },
    { id: "cfg-col-7", val: "≥7 ngày" },
    { id: "cfg-col-14", val: "≥14 ngày" }
];

function openMatrixConfigModal(initialTab = "cols") {
    const matrixTotalModal = document.getElementById("matrix-total-modal");
    if (!matrixTotalModal) return;

    switchMatrixConfigTab(initialTab);

    const visCols = getVisibleCategories();
    MODAL_VIS_MAP.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) el.checked = visCols.includes(item.val);
    });

    const totCols = getTotalCategories();
    MODAL_CFG_MAP.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) el.checked = totCols.includes(item.val);
    });

    matrixTotalModal.style.display = "flex";
}

function switchMatrixConfigTab(tabName) {
    const tabBtnCols = document.getElementById("tab-btn-cfg-cols");
    const tabBtnTotal = document.getElementById("tab-btn-cfg-total");
    const panelCols = document.getElementById("panel-cfg-cols");
    const panelTotal = document.getElementById("panel-cfg-total");

    if (!tabBtnCols || !tabBtnTotal || !panelCols || !panelTotal) return;

    if (tabName === "cols") {
        tabBtnCols.classList.add("active");
        tabBtnCols.style.background = "var(--accent-emerald)";
        tabBtnCols.style.color = "white";
        tabBtnCols.style.border = "none";

        tabBtnTotal.classList.remove("active");
        tabBtnTotal.style.background = "var(--bg-primary)";
        tabBtnTotal.style.color = "var(--text-secondary)";
        tabBtnTotal.style.border = "1px solid var(--border-color)";

        panelCols.style.display = "block";
        panelTotal.style.display = "none";
    } else {
        tabBtnTotal.classList.add("active");
        tabBtnTotal.style.background = "var(--accent-emerald)";
        tabBtnTotal.style.color = "white";
        tabBtnTotal.style.border = "none";

        tabBtnCols.classList.remove("active");
        tabBtnCols.style.background = "var(--bg-primary)";
        tabBtnCols.style.color = "var(--text-secondary)";
        tabBtnCols.style.border = "1px solid var(--border-color)";

        panelCols.style.display = "none";
        panelTotal.style.display = "block";
    }
}

function initMatrixTotalQuickConfig() {
    const matrixTotalModal = document.getElementById("matrix-total-modal");
    const btnCloseMatrixTotalModal = document.getElementById("btn-close-matrix-total-modal");
    const btnCancelMatrixTotalModal = document.getElementById("btn-cancel-matrix-total-modal");
    const btnSaveMatrixTotalModal = document.getElementById("btn-save-matrix-total-modal");
    const btnConfigMatrixCols = document.getElementById("btn-config-matrix-columns");

    if (!matrixTotalModal) return;

    // Toolbar button to open modal on Tab 1
    if (btnConfigMatrixCols) {
        btnConfigMatrixCols.addEventListener("click", () => {
            openMatrixConfigModal("cols");
        });
    }

    // Modal Tab buttons
    const tabBtnCols = document.getElementById("tab-btn-cfg-cols");
    const tabBtnTotal = document.getElementById("tab-btn-cfg-total");
    if (tabBtnCols) tabBtnCols.addEventListener("click", () => switchMatrixConfigTab("cols"));
    if (tabBtnTotal) tabBtnTotal.addEventListener("click", () => switchMatrixConfigTab("total"));

    // Quick Select Buttons
    const btnQuickColsAll = document.getElementById("btn-quick-cols-all");
    const btnQuickColsDef = document.getElementById("btn-quick-cols-default");
    const btnQuickTotalAll = document.getElementById("btn-quick-total-all");
    const btnQuickTotalDef = document.getElementById("btn-quick-total-default");

    if (btnQuickColsAll) {
        btnQuickColsAll.addEventListener("click", () => {
            MODAL_VIS_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el) el.checked = true;
            });
        });
    }

    if (btnQuickColsDef) {
        btnQuickColsDef.addEventListener("click", () => {
            const def = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
            MODAL_VIS_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el) el.checked = def.includes(item.val);
            });
        });
    }

    if (btnQuickTotalAll) {
        btnQuickTotalAll.addEventListener("click", () => {
            MODAL_CFG_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el) el.checked = true;
            });
        });
    }

    if (btnQuickTotalDef) {
        btnQuickTotalDef.addEventListener("click", () => {
            const def = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
            MODAL_CFG_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el) el.checked = def.includes(item.val);
            });
        });
    }

    const closeModal = () => {
        matrixTotalModal.style.display = "none";
    };

    if (btnCloseMatrixTotalModal) btnCloseMatrixTotalModal.addEventListener("click", closeModal);
    if (btnCancelMatrixTotalModal) btnCancelMatrixTotalModal.addEventListener("click", closeModal);

    // Save Config
    if (btnSaveMatrixTotalModal) {
        btnSaveMatrixTotalModal.addEventListener("click", () => {
            const selectedVis = [];
            MODAL_VIS_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el && el.checked) selectedVis.push(item.val);
            });

            if (selectedVis.length === 0) {
                showToast("Phải chọn ít nhất một cột để hiển thị trên ma trận.", "warning");
                switchMatrixConfigTab("cols");
                return;
            }

            const selectedTot = [];
            MODAL_CFG_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el && el.checked) selectedTot.push(item.val);
            });

            if (selectedTot.length === 0) {
                showToast("Phải chọn ít nhất một cột để tính tổng tồn.", "warning");
                switchMatrixConfigTab("total");
                return;
            }

            localStorage.setItem("matrix_visible_columns", JSON.stringify(selectedVis));
            localStorage.setItem("matrix_total_columns", JSON.stringify(selectedTot));

            // Sync with Settings view
            SETTINGS_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el) el.checked = selectedTot.includes(item.val);
            });

            closeModal();

            if (cachedSummaryData) {
                renderSummary(cachedSummaryData);
            }

            showToast("Đã lưu cấu hình cột ma trận và tổng tồn.", "success");
        });
    }
}

// Background status sync
setInterval(async () => {
    if (localStorage.getItem("vnpost_token")) {
        await updateStatus();
    }
}, 15000);

// Background dashboard reload (runs only when viewing dashboard tab and no URL error)
setInterval(async () => {
    if (localStorage.getItem("vnpost_token") && activeView === "dashboard" && !isDashboardUrlError) {
        await loadSummary();
        await loadDetailed();
    }
}, 60000);

// Settings View Tabs and Config Handlers
function initSettingsView() {
    const tabBtnUsers = document.getElementById("tab-btn-users");
    const tabBtnDinhvi = document.getElementById("tab-btn-dinhvi");
    const tabBtnPosConfig = document.getElementById("tab-btn-pos-config");
    const panelUsers = document.getElementById("panel-settings-users");
    const panelDinhvi = document.getElementById("panel-settings-dinhvi");
    const panelPosConfig = document.getElementById("panel-settings-pos-config");
    const usersHeaderActions = document.getElementById("users-header-actions");
    const frmDinhviConfig = document.getElementById("frm-dinhvi-config");
    const cfgBatchSize = document.getElementById("cfg-batch-size");
    const cfgThresh3 = document.getElementById("cfg-thresh-3");
    const cfgThresh4 = document.getElementById("cfg-thresh-4");
    const cfgThresh5 = document.getElementById("cfg-thresh-5");
    const cfgThresh7 = document.getElementById("cfg-thresh-7");
    const cfgThresh14 = document.getElementById("cfg-thresh-14");
    const cfgThreshTotal = document.getElementById("cfg-thresh-total");

    if (!tabBtnUsers || !tabBtnDinhvi) return;

    // Load saved config
    const savedBatchSize = localStorage.getItem("export_batch_size") || "50";
    if (cfgBatchSize) cfgBatchSize.value = savedBatchSize;

    if (cfgThresh3) cfgThresh3.value = localStorage.getItem("default_thresh_3") || "";
    if (cfgThresh4) cfgThresh4.value = localStorage.getItem("default_thresh_4") || "";
    if (cfgThresh5) cfgThresh5.value = localStorage.getItem("default_thresh_5") || "";
    if (cfgThresh7) cfgThresh7.value = localStorage.getItem("default_thresh_7") || "";
    if (cfgThresh14) cfgThresh14.value = localStorage.getItem("default_thresh_14") || "";
    if (cfgThreshTotal) cfgThreshTotal.value = localStorage.getItem("default_thresh_total") || "";

    // Load Matrix total columns config
    const savedColsStr = localStorage.getItem("matrix_total_columns");
    let savedCols = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
    if (savedColsStr) {
        try {
            const parsed = JSON.parse(savedColsStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
                savedCols = parsed;
            }
        } catch (e) { }
    }
    SETTINGS_MAP.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) el.checked = savedCols.includes(item.val);
    });

    // Reset view to tab-users active by default
    const activateTab = (tabName) => {
        const tabs = [
            { btn: tabBtnUsers, panel: panelUsers, name: "users" },
            { btn: tabBtnDinhvi, panel: panelDinhvi, name: "dinhvi" },
            { btn: tabBtnPosConfig, panel: panelPosConfig, name: "pos" }
        ];

        tabs.forEach(t => {
            if (!t.btn || !t.panel) return;
            if (t.name === tabName) {
                t.btn.classList.add("active");
                t.btn.style.color = "var(--accent-emerald)";
                t.btn.style.borderBottom = "3px solid var(--accent-emerald)";
                t.panel.style.display = "block";
            } else {
                t.btn.classList.remove("active");
                t.btn.style.color = "var(--text-muted)";
                t.btn.style.borderBottom = "none";
                t.panel.style.display = "none";
            }
        });

        if (usersHeaderActions) {
            usersHeaderActions.style.display = tabName === "users" ? "flex" : "none";
        }
    };

    activateTab("users");

    tabBtnUsers.addEventListener("click", () => activateTab("users"));
    tabBtnDinhvi.addEventListener("click", () => activateTab("dinhvi"));
    if (tabBtnPosConfig) {
        tabBtnPosConfig.addEventListener("click", async () => {
            activateTab("pos");
            await loadPosConfigData();
            renderPosConfigPanel();
        });
    }

    // Handle config submit
    if (frmDinhviConfig) {
        frmDinhviConfig.addEventListener("submit", (e) => {
            e.preventDefault();
            const batchSizeVal = parseInt(cfgBatchSize.value) || 50;
            if (batchSizeVal < 1 || batchSizeVal > 500) {
                showToast("Số lượng bưu gửi trên 1 lô phải nằm trong khoảng 1 - 500.", "warning");
                return;
            }

            const thresh3Val = cfgThresh3 ? cfgThresh3.value.trim() : "";
            const thresh4Val = cfgThresh4 ? cfgThresh4.value.trim() : "";
            const thresh5Val = cfgThresh5 ? cfgThresh5.value.trim() : "";
            const thresh7Val = cfgThresh7 ? cfgThresh7.value.trim() : "";
            const thresh14Val = cfgThresh14 ? cfgThresh14.value.trim() : "";
            const threshTotalVal = cfgThreshTotal ? cfgThreshTotal.value.trim() : "";

            // Save Matrix total columns config
            const selectedCols = [];
            SETTINGS_MAP.forEach(item => {
                const el = document.getElementById(item.id);
                if (el && el.checked) selectedCols.push(item.val);
            });

            if (selectedCols.length === 0) {
                showToast("Phải chọn ít nhất một cột để tính tổng tồn.", "warning");
                return;
            }

            localStorage.setItem("export_batch_size", batchSizeVal);
            localStorage.setItem("default_thresh_3", thresh3Val);
            localStorage.setItem("default_thresh_4", thresh4Val);
            localStorage.setItem("default_thresh_5", thresh5Val);
            localStorage.setItem("default_thresh_7", thresh7Val);
            localStorage.setItem("default_thresh_14", thresh14Val);
            localStorage.setItem("default_thresh_total", threshTotalVal);
            localStorage.setItem("matrix_total_columns", JSON.stringify(selectedCols));

            // Instantly sync dashboard fields so the user doesn't need to refresh
            if (document.getElementById("threshold-3")) document.getElementById("threshold-3").value = thresh3Val;
            if (document.getElementById("threshold-4")) document.getElementById("threshold-4").value = thresh4Val;
            if (document.getElementById("threshold-5")) document.getElementById("threshold-5").value = thresh5Val;
            if (document.getElementById("threshold-7")) document.getElementById("threshold-7").value = thresh7Val;
            if (document.getElementById("threshold-14")) document.getElementById("threshold-14").value = thresh14Val;
            if (document.getElementById("threshold-total")) document.getElementById("threshold-total").value = threshTotalVal;

            // Sync filter-active classes on dashboard inputs
            document.querySelectorAll(".threshold-inputs input").forEach(el => checkFilterActive(el));

            // Apply new highlight levels
            applyHighlights();

            // Re-render Pivot Matrix instantly
            if (cachedSummaryData) {
                renderSummary(cachedSummaryData);
            }

            showToast("Lưu thông số hệ thống thành công.", "success");
        });
    }
}

// Data Note Modal Event Listeners & BCKT Detail Explorer
let cachedBcktData = null;

async function loadBcktSummaryData() {
    const summaryTbody = document.getElementById("bckt-summary-tbody");
    const itemsTbody = document.getElementById("bckt-items-tbody");
    const badge = document.getElementById("bckt-summary-total-badge");
    const posSelect = document.getElementById("bckt-items-filter-pos");

    if (!summaryTbody || !itemsTbody) return;

    try {
        summaryTbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding: 20px;">Đang tải dữ liệu khai thác...</td></tr>';
        itemsTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">Đang tải danh sách mã bưu gửi...</td></tr>';

        const res = await fetch("/api/bckt-summary");
        const data = await res.json();
        cachedBcktData = data;

        if (badge) {
            badge.textContent = `Tổng: ${formatNumber(data.total_bckt_qty || 0)} đơn (${formatCurrency(data.total_bckt_cod || 0)})`;
        }

        // Render Tab 1: BCKT Summary Table
        const summaryList = data.bckt_summary || [];

        if (summaryList.length === 0) {
            summaryTbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding: 20px;">Không có dữ liệu khai thác đọng.</td></tr>';
        } else {
            let summaryHtml = "";
            if (posSelect) {
                posSelect.innerHTML = '<option value="">-- Tất cả bưu cục --</option>';
            }

            summaryList.forEach((item, idx) => {
                const m = item.matrix || {};
                const q3 = m["≥3 ngày"]?.qty || 0;
                const q4 = m["≥4 ngày"]?.qty || 0;
                const q5 = m["≥5 ngày"]?.qty || 0;
                const q7 = m["≥7 ngày"]?.qty || 0;
                const q14 = m["≥14 ngày"]?.qty || 0;

                summaryHtml += `
                    <tr>
                        <td class="text-center">${idx + 1}</td>
                        <td style="font-weight: 600; color: var(--text-primary);">${item.pos_name}</td>
                        <td class="text-center" style="font-family: var(--font-mono); font-size: 12px;">${item.pos_code}</td>
                        <td class="text-right" style="${q3 > 0 ? 'background: rgba(16, 185, 129, 0.08); color: #047857; font-weight: 600;' : ''}">${formatNumber(q3)}</td>
                        <td class="text-right" style="${q4 > 0 ? 'background: rgba(16, 185, 129, 0.08); color: #047857; font-weight: 600;' : ''}">${formatNumber(q4)}</td>
                        <td class="text-right" style="${q5 > 0 ? 'background: rgba(245, 158, 11, 0.09); color: #b45309; font-weight: 600;' : ''}">${formatNumber(q5)}</td>
                        <td class="text-right" style="${q7 > 0 ? 'background: rgba(245, 158, 11, 0.09); color: #b45309; font-weight: 600;' : ''}">${formatNumber(q7)}</td>
                        <td class="text-right" style="${q14 > 0 ? 'background: rgba(239, 68, 68, 0.09); color: #b91c1c; font-weight: 700;' : ''}">${formatNumber(q14)}</td>
                        <td class="text-right text-bold" style="color: var(--accent-emerald);">${formatNumber(item.total_qty)}</td>
                        <td class="text-right text-bold">${formatCurrency(item.total_cod)}</td>
                    </tr>
                `;

                if (posSelect) {
                    const opt = document.createElement("option");
                    opt.value = item.pos_name;
                    opt.textContent = `${item.pos_name} (${item.total_qty} đơn)`;
                    posSelect.appendChild(opt);
                }
            });
            summaryTbody.innerHTML = summaryHtml;
        }

        // Render Tab 2: BCKT Items List
        renderBcktItemsList();

    } catch (e) {
        console.error("Error loading BCKT summary:", e);
        summaryTbody.innerHTML = '<tr><td colspan="10" class="text-center text-red" style="padding: 20px;">Lỗi tải dữ liệu khai thác.</td></tr>';
    }
}

function getLoaiTonBadgeStyle(loaiTon) {
    if (!loaiTon) return "background: var(--bg-secondary); color: var(--text-secondary);";
    if (loaiTon.includes("3") || loaiTon.includes("4")) {
        return "background: rgba(16, 185, 129, 0.15); color: #047857; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 600;";
    }
    if (loaiTon.includes("5") || loaiTon.includes("7")) {
        return "background: rgba(245, 158, 11, 0.15); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600;";
    }
    if (loaiTon.includes("14")) {
        return "background: rgba(239, 68, 68, 0.15); color: #b91c1c; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700;";
    }
    return "background: var(--bg-secondary); color: var(--text-secondary);";
}

function renderBcktItemsList() {
    const itemsTbody = document.getElementById("bckt-items-tbody");
    const countBadge = document.getElementById("bckt-items-count-badge");
    const searchVal = (document.getElementById("bckt-items-search")?.value || "").toLowerCase().trim();
    const filterPos = document.getElementById("bckt-items-filter-pos")?.value || "";
    const filterCat = document.getElementById("bckt-items-filter-cat")?.value || "";

    if (!itemsTbody || !cachedBcktData) return;

    let items = cachedBcktData.bckt_items || [];

    if (searchVal) {
        items = items.filter(i => 
            (i.item_code && i.item_code.toLowerCase().includes(searchVal)) ||
            (i.pos_name && i.pos_name.toLowerCase().includes(searchVal)) ||
            (i.status_name && i.status_name.toLowerCase().includes(searchVal))
        );
    }

    if (filterPos) {
        items = items.filter(i => i.pos_name === filterPos);
    }

    if (filterCat) {
        items = items.filter(i => i.loai_ton === filterCat);
    }

    if (countBadge) {
        countBadge.textContent = `Hiển thị: ${formatNumber(items.length)} đơn`;
    }

    if (items.length === 0) {
        itemsTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">Không tìm thấy mã bưu gửi phù hợp.</td></tr>';
        return;
    }

    let itemsHtml = "";
    items.slice(0, 300).forEach((item, idx) => {
        const badgeStyle = getLoaiTonBadgeStyle(item.loai_ton);
        itemsHtml += `
            <tr>
                <td class="text-center">${idx + 1}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald); font-size: 13px;">${item.item_code}</td>
                <td style="font-weight: 500;">${item.pos_name}</td>
                <td class="text-center"><span class="badge" style="font-size: 11px; padding: 3px 9px; border-radius: 12px; ${badgeStyle}">${item.loai_ton}</span></td>
                <td>${item.status_name || ''}</td>
                <td class="text-right font-mono text-bold">${formatCurrency(item.cod_amount)}</td>
                <td class="text-center" style="font-size: 12px; color: var(--text-muted);">${item.nhom_kh || ''}</td>
            </tr>
        `;
    });

    if (items.length > 300) {
        itemsHtml += `<tr><td colspan="7" class="text-center text-muted" style="padding: 10px; font-style: italic;">Hiển thị 300 / ${items.length} bưu gửi. Dùng bộ lọc để thu hẹp kết quả.</td></tr>`;
    }

    itemsTbody.innerHTML = itemsHtml;
}

function initDataNoteModal() {
    const btnOpen = document.getElementById("btn-open-data-note-modal");
    const modal = document.getElementById("data-note-modal");
    const btnCloseHeader = document.getElementById("btn-close-data-note-modal");
    const btnCloseFooter = document.getElementById("btn-close-data-note-modal-footer");

    const tabBtnSummary = document.getElementById("bckt-tab-btn-summary");
    const tabBtnItems = document.getElementById("bckt-tab-btn-items");
    const tabBtnInfo = document.getElementById("bckt-tab-btn-info");

    const panelSummary = document.getElementById("bckt-panel-summary");
    const panelItems = document.getElementById("bckt-panel-items");
    const panelInfo = document.getElementById("bckt-panel-info");

    if (!modal) return;

    const switchTab = (activeTab) => {
        [tabBtnSummary, tabBtnItems, tabBtnInfo].forEach(btn => {
            if (!btn) return;
            btn.style.background = "var(--bg-primary)";
            btn.style.color = "var(--text-secondary)";
            btn.style.border = "1px solid var(--border-color)";
        });
        [panelSummary, panelItems, panelInfo].forEach(p => {
            if (p) p.style.display = "none";
        });

        if (activeTab === "summary") {
            if (tabBtnSummary) {
                tabBtnSummary.style.background = "var(--accent-emerald)";
                tabBtnSummary.style.color = "white";
                tabBtnSummary.style.border = "none";
            }
            if (panelSummary) panelSummary.style.display = "block";
        } else if (activeTab === "items") {
            if (tabBtnItems) {
                tabBtnItems.style.background = "var(--accent-emerald)";
                tabBtnItems.style.color = "white";
                tabBtnItems.style.border = "none";
            }
            if (panelItems) panelItems.style.display = "block";
        } else if (activeTab === "info") {
            if (tabBtnInfo) {
                tabBtnInfo.style.background = "var(--accent-emerald)";
                tabBtnInfo.style.color = "white";
                tabBtnInfo.style.border = "none";
            }
            if (panelInfo) panelInfo.style.display = "block";
        }
    };

    if (tabBtnSummary) tabBtnSummary.addEventListener("click", () => switchTab("summary"));
    if (tabBtnItems) tabBtnItems.addEventListener("click", () => switchTab("items"));
    if (tabBtnInfo) tabBtnInfo.addEventListener("click", () => switchTab("info"));

    const openModal = async () => {
        const modalEl = document.getElementById("data-note-modal");
        if (modalEl) {
            modalEl.style.display = "flex";
            modalEl.style.zIndex = "99999";
            switchTab("summary");
            await loadBcktSummaryData();
        }
    };

    window.openDataNoteModal = openModal;

    if (btnOpen) {
        btnOpen.addEventListener("click", async (e) => {
            if (e) e.preventDefault();
            await openModal();
        });
    }

    // Global document-level click delegation fallback to ensure button is ALWAYS interactive
    document.addEventListener("click", async (e) => {
        const targetBtn = e.target.closest("#btn-open-data-note-modal");
        if (targetBtn) {
            e.preventDefault();
            await openModal();
        }
    });

    const closeModal = () => {
        modal.style.display = "none";
    };

    if (btnCloseHeader) btnCloseHeader.addEventListener("click", closeModal);
    if (btnCloseFooter) btnCloseFooter.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });

    // Add filter input listeners for BCKT Items List
    const searchInput = document.getElementById("bckt-items-search");
    const posSelect = document.getElementById("bckt-items-filter-pos");
    const catSelect = document.getElementById("bckt-items-filter-cat");

    if (searchInput) searchInput.addEventListener("input", renderBcktItemsList);
    if (posSelect) posSelect.addEventListener("change", renderBcktItemsList);
    if (catSelect) catSelect.addEventListener("change", renderBcktItemsList);
}

function initUrlErrorOverlay() {
    const btnRetry = document.getElementById("btn-retry-pbi-url");
    const btnMinimize = document.getElementById("btn-minimize-pbi-error");
    const btnExpand = document.getElementById("btn-expand-pbi-error");

    if (btnRetry) btnRetry.addEventListener("click", retryPbiConnection);

    if (btnMinimize) {
        btnMinimize.addEventListener("click", () => {
            isErrorBannerMinimized = true;
            const overlay = document.getElementById("dashboard-url-error-overlay");
            const stickyBanner = document.getElementById("sticky-pbi-error-banner");
            const viewExport = document.getElementById("view-export");

            if (overlay) overlay.style.display = "none";
            switchView("export");
            if (stickyBanner) stickyBanner.style.display = "flex";
            if (viewExport) viewExport.classList.remove("view-locked");
        });
    }

    if (btnExpand) {
        btnExpand.addEventListener("click", () => {
            isErrorBannerMinimized = false;
            const overlay = document.getElementById("dashboard-url-error-overlay");
            const stickyBanner = document.getElementById("sticky-pbi-error-banner");
            const viewExport = document.getElementById("view-export");

            if (overlay) overlay.style.display = "flex";
            if (stickyBanner) stickyBanner.style.display = "none";
            if (viewExport) viewExport.classList.add("view-locked");
        });
    }
}

// ==========================================
// --- POS OFFICES CONFIGURATION MODULE ---
// ==========================================

let currentPosConfigs = [];

async function loadPosConfigData() {
    try {
        const res = await fetch("/api/pos-config");
        if (!res.ok) throw new Error("Không thể tải cấu hình bưu cục.");
        currentPosConfigs = await res.json();
        return currentPosConfigs;
    } catch (e) {
        showToast("Lỗi tải danh sách bưu cục: " + e.message, "error");
        return [];
    }
}

function updatePosConfigStats() {
    const total = currentPosConfigs.length;
    const activeList = currentPosConfigs.filter(c => c.is_active);
    const activeCount = activeList.length;
    const activeItems = activeList.reduce((sum, c) => sum + (c.item_count || 0), 0);

    const badgeText = `Hiển thị: ${activeCount}/${total} bưu cục (${formatNumber(activeItems)} đơn)`;
    
    // Update badge in settings panel
    const panelBadge = document.getElementById("pos-cfg-stats-badge");
    if (panelBadge) panelBadge.textContent = badgeText;

    // Update badge in modal
    const modalBadge = document.getElementById("modal-pos-cfg-badge");
    if (modalBadge) modalBadge.textContent = `${activeCount}/${total} bưu cục`;

    const modalSummary = document.getElementById("modal-pos-cfg-summary-text");
    if (modalSummary) modalSummary.textContent = `Đang kích hoạt ${activeCount}/${total} bưu cục (Tổng tồn: ${formatNumber(activeItems)} đơn)`;
}

function renderPosConfigRows(tbodyEl, configs, isModal = false) {
    if (!tbodyEl) return;
    if (!configs || configs.length === 0) {
        tbodyEl.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Không tìm thấy bưu cục nào phù hợp.</td></tr>`;
        return;
    }

    tbodyEl.innerHTML = "";
    configs.forEach((item, idx) => {
        const tr = document.createElement("tr");
        if (!item.is_active) {
            tr.style.opacity = "0.6";
            tr.style.background = "rgba(0, 0, 0, 0.02)";
        }

        let typeBadge = '';
        if (item.pos_type === 'BCP') {
            typeBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #047857; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;">BCP (Phát)</span>`;
        } else if (item.pos_type === 'BCKT') {
            typeBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #b45309; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;">BCKT (Khai thác)</span>`;
        } else {
            typeBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #475569; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;">${item.pos_type || 'Khác'}</span>`;
        }

        const checkboxId = `${isModal ? 'modal' : 'panel'}-pos-check-${item.pos_code}`;

        tr.innerHTML = `
            <td class="text-center" style="font-weight: 500; color: var(--text-muted);">${idx + 1}</td>
            <td class="text-center">
                <input type="checkbox" id="${checkboxId}" data-code="${item.pos_code}" ${item.is_active ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-emerald); cursor: pointer;">
            </td>
            <td><code style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-emerald); font-size: 13.5px;">${item.pos_code}</code></td>
            <td style="font-weight: 600; color: var(--text-primary);">${item.pos_name}</td>
            <td class="text-center">${typeBadge}</td>
            <td class="text-right" style="font-family: var(--font-mono); font-weight: 600; color: ${item.item_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${formatNumber(item.item_count || 0)}</td>
        `;

        const cb = tr.querySelector(`#${checkboxId}`);
        cb.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const target = currentPosConfigs.find(c => c.pos_code === item.pos_code);
            if (target) {
                target.is_active = checked;
            }
            if (!checked) {
                tr.style.opacity = "0.6";
                tr.style.background = "rgba(0, 0, 0, 0.02)";
            } else {
                tr.style.opacity = "1";
                tr.style.background = "";
            }
            updatePosConfigStats();
        });

        tbodyEl.appendChild(tr);
    });
}

function getFilteredPosConfigs(searchText, typeFilter) {
    let list = [...currentPosConfigs];
    if (searchText) {
        const query = searchText.toLowerCase().trim();
        list = list.filter(c => (c.pos_code && c.pos_code.toLowerCase().includes(query)) || (c.pos_name && c.pos_name.toLowerCase().includes(query)));
    }
    if (typeFilter) {
        list = list.filter(c => c.pos_type === typeFilter);
    }
    return list;
}

function renderPosConfigPanel() {
    const tbody = document.getElementById("pos-cfg-table-tbody");
    const searchInput = document.getElementById("pos-cfg-search-input");
    const typeSelect = document.getElementById("pos-cfg-filter-type");

    const searchVal = searchInput ? searchInput.value : "";
    const typeVal = typeSelect ? typeSelect.value : "";

    const filtered = getFilteredPosConfigs(searchVal, typeVal);
    renderPosConfigRows(tbody, filtered, false);
    updatePosConfigStats();
}

function renderPosConfigModal() {
    const tbody = document.getElementById("modal-pos-cfg-tbody");
    const searchInput = document.getElementById("modal-pos-cfg-search");

    const searchVal = searchInput ? searchInput.value : "";
    const filtered = getFilteredPosConfigs(searchVal, "");
    renderPosConfigRows(tbody, filtered, true);
    updatePosConfigStats();
}

function applyOnlyBcpFilter() {
    currentPosConfigs.forEach(c => {
        const nameUpper = (c.pos_name || "").toUpperCase().trim();
        if (nameUpper.startsWith("BCKT") || c.pos_type === "BCKT") {
            c.is_active = false;
        } else if (nameUpper.startsWith("BCP") || c.pos_type === "BCP") {
            c.is_active = true;
        } else {
            // Keep others or active
            c.is_active = true;
        }
    });
}

function setAllPosActive(isActive) {
    currentPosConfigs.forEach(c => {
        c.is_active = isActive;
    });
}

async function savePosConfigChanges() {
    if (!currentPosConfigs || currentPosConfigs.length === 0) return;

    try {
        const payload = {
            configs: currentPosConfigs.map(c => ({
                pos_code: c.pos_code,
                is_active: Boolean(c.is_active)
            }))
        };

        const res = await fetch("/api/pos-config", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getHeaders()
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Không thể lưu cấu hình.");

        showToast("Đã lưu cấu hình danh sách bưu cục hiển thị!", "success");

        // Close modal if open
        const modal = document.getElementById("pos-config-modal");
        if (modal) modal.style.display = "none";

        // Refresh all dashboard metrics & filters with new active POS list
        await loadSummary();
        await loadFilters();
        await loadDetailed();

    } catch (err) {
        showToast("Lỗi lưu cấu hình bưu cục: " + err.message, "error");
    }
}

function initPosConfig() {
    // 1. Dashboard Modal Open / Close triggers
    const btnOpenModal = document.getElementById("btn-open-pos-config-modal");
    const modalEl = document.getElementById("pos-config-modal");
    const btnCloseModal = document.getElementById("btn-close-pos-config-modal");
    const btnCancelModal = document.getElementById("modal-btn-close-pos-config");
    const btnSaveModal = document.getElementById("modal-btn-save-pos-config");

    const openModal = async () => {
        if (!modalEl) return;
        modalEl.style.display = "flex";
        modalEl.style.zIndex = "99999";
        await loadPosConfigData();
        renderPosConfigModal();
    };

    if (btnOpenModal) {
        btnOpenModal.addEventListener("click", (e) => {
            e.preventDefault();
            openModal();
        });
    }

    // Global document-level click delegation for open pos config modal button
    document.addEventListener("click", (e) => {
        const target = e.target.closest("#btn-open-pos-config-modal");
        if (target) {
            e.preventDefault();
            openModal();
        }
    });

    const closeModal = () => {
        if (modalEl) modalEl.style.display = "none";
    };

    if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener("click", closeModal);
    if (modalEl) {
        modalEl.addEventListener("click", (e) => {
            if (e.target === modalEl) closeModal();
        });
    }

    if (btnSaveModal) btnSaveModal.addEventListener("click", savePosConfigChanges);

    // Modal quick action buttons
    const modalBtnOnlyBcp = document.getElementById("modal-btn-pos-cfg-only-bcp");
    const modalBtnSelectAll = document.getElementById("modal-btn-pos-cfg-select-all");
    const modalBtnClearAll = document.getElementById("modal-btn-pos-cfg-clear-all");
    const modalSearchInput = document.getElementById("modal-pos-cfg-search");

    if (modalBtnOnlyBcp) {
        modalBtnOnlyBcp.addEventListener("click", () => {
            applyOnlyBcpFilter();
            renderPosConfigModal();
            showToast("Đã chọn các bưu cục BCP và tắt các bưu cục BCKT.", "info");
        });
    }

    if (modalBtnSelectAll) {
        modalBtnSelectAll.addEventListener("click", () => {
            setAllPosActive(true);
            renderPosConfigModal();
        });
    }

    if (modalBtnClearAll) {
        modalBtnClearAll.addEventListener("click", () => {
            setAllPosActive(false);
            renderPosConfigModal();
        });
    }

    if (modalSearchInput) {
        modalSearchInput.addEventListener("input", renderPosConfigModal);
    }

    // 2. Settings View Panel triggers
    const panelBtnSave = document.getElementById("btn-pos-cfg-save");
    const panelBtnOnlyBcp = document.getElementById("btn-pos-cfg-only-bcp");
    const panelBtnSelectAll = document.getElementById("btn-pos-cfg-select-all");
    const panelBtnClearAll = document.getElementById("btn-pos-cfg-clear-all");
    const panelSearchInput = document.getElementById("pos-cfg-search-input");
    const panelTypeSelect = document.getElementById("pos-cfg-filter-type");

    if (panelBtnSave) panelBtnSave.addEventListener("click", savePosConfigChanges);

    if (panelBtnOnlyBcp) {
        panelBtnOnlyBcp.addEventListener("click", () => {
            applyOnlyBcpFilter();
            renderPosConfigPanel();
            showToast("Đã chọn các bưu cục BCP và tắt các bưu cục BCKT.", "info");
        });
    }

    if (panelBtnSelectAll) {
        panelBtnSelectAll.addEventListener("click", () => {
            setAllPosActive(true);
            renderPosConfigPanel();
        });
    }

    if (panelBtnClearAll) {
        panelBtnClearAll.addEventListener("click", () => {
            setAllPosActive(false);
            renderPosConfigPanel();
        });
    }

    if (panelSearchInput) {
        panelSearchInput.addEventListener("input", renderPosConfigPanel);
    }

    if (panelTypeSelect) {
        panelTypeSelect.addEventListener("change", renderPosConfigPanel);
    }
}

// ==========================================
// --- MODULE: LỌC TỒN BƯU GỬI (LOCTON) ---
// ==========================================

let loctonHangtonFile = null;
let loctonDinhViFile = null;
let loctonData = { bang1: [], bang2: [], bang3: [] };
let loctonActiveTab = 3; // 3: Tổng hợp BC, 1: Chưa phát, 2: Đã giao/thu tiền
let loctonSearchText = "";
let loctonCurrentPage = 1;
let loctonPageSize = 50;
let isLoctonInitialized = false;

function initLoctonView() {
    if (isLoctonInitialized) return;
    isLoctonInitialized = true;

    // Dropzone Hàng Tồn
    const dropzoneHangton = document.getElementById("dropzone-hangton");
    const inputHangton = document.getElementById("input-locton-hangton");
    const labelHangton = document.getElementById("label-locton-hangton");
    const badgeHangton = document.getElementById("badge-locton-hangton");

    // Dropzone Định Vị
    const dropzoneDinhVi = document.getElementById("dropzone-dinhvi");
    const inputDinhVi = document.getElementById("input-locton-dinhvi");
    const labelDinhVi = document.getElementById("label-locton-dinhvi");
    const badgeDinhVi = document.getElementById("badge-locton-dinhvi");

    function setupDropzone(dropzone, input, onFileSelected) {
        if (!dropzone || !input) return;
        dropzone.addEventListener("click", () => input.click());
        input.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                onFileSelected(e.target.files[0]);
            }
        });
        ["dragenter", "dragover"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = "var(--accent-emerald)";
                dropzone.style.background = "var(--accent-emerald-light)";
            });
        });
        ["dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = "var(--border-color)";
                dropzone.style.background = "var(--bg-primary)";
            });
        });
        dropzone.addEventListener("drop", (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                onFileSelected(e.dataTransfer.files[0]);
            }
        });
    }

    setupDropzone(dropzoneHangton, inputHangton, (file) => {
        loctonHangtonFile = file;
        labelHangton.textContent = file.name;
        badgeHangton.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        badgeHangton.style.display = "inline-block";
        hideLoctonAlert();
    });

    setupDropzone(dropzoneDinhVi, inputDinhVi, (file) => {
        loctonDinhViFile = file;
        labelDinhVi.textContent = file.name;
        badgeDinhVi.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        badgeDinhVi.style.display = "inline-block";
        hideLoctonAlert();
    });

    // Button Bắt đầu Lọc Tồn
    const btnProcess = document.getElementById("btn-locton-process");
    if (btnProcess) {
        btnProcess.addEventListener("click", handleLoctonProcess);
    }

    // Button Reset
    const btnReset = document.getElementById("btn-locton-reset");
    if (btnReset) {
        btnReset.addEventListener("click", resetLoctonState);
    }

    // Button Export Excel
    const btnExport = document.getElementById("btn-locton-export-excel");
    if (btnExport) {
        btnExport.addEventListener("click", handleLoctonExport);
    }

    // Tab buttons
    [1, 2, 3].forEach(tabNum => {
        const tabBtn = document.getElementById(`tab-locton-${tabNum}`);
        if (tabBtn) {
            tabBtn.addEventListener("click", () => {
                setLoctonTab(tabNum);
            });
        }
    });

    // Search input
    const searchInput = document.getElementById("locton-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            loctonSearchText = (e.target.value || "").trim().toLowerCase();
            loctonCurrentPage = 1;
            renderLoctonTable();
        });
    }

    // Page size selector
    const pageSizeSelect = document.getElementById("locton-page-size");
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            loctonPageSize = parseInt(e.target.value, 10) || 50;
            loctonCurrentPage = 1;
            renderLoctonTable();
        });
    }

    // Prev / Next pagination buttons
    const btnPrev = document.getElementById("btn-locton-prev");
    const btnNext = document.getElementById("btn-locton-next");
    if (btnPrev) {
        btnPrev.addEventListener("click", () => {
            if (loctonCurrentPage > 1) {
                loctonCurrentPage--;
                renderLoctonTable();
            }
        });
    }
    if (btnNext) {
        btnNext.addEventListener("click", () => {
            loctonCurrentPage++;
            renderLoctonTable();
        });
    }
}

const LOCTON_EXCLUDE_STATUSES = new Set([
    '[BĐ8]Đã tới bưu cục nhận',
    '[BĐ8]Đã xác nhận đi',
    'Đã đóng chuyến thư đi',
    'Đã thu tiền khách hàng',
    'Đã thu tiền khách hàng (QR)',
    'Đã thu tiền bưu tá',
    'Mất bưu gửi',
    'Đã phát thành công',
    'Phát thành công',
    'Trả tiền cho người gửi',
    'Đã trả tiền'
]);

const LOCTON_EXCLUDE_BC = new Set([
    '640000', '641190', '641430',
    '670000', '671040', '671640',
    '673300', '674169', '674790'
]);

function hasTargetBcPrefix(vt) {
    if (!vt) return false;
    const s = String(vt).trim();
    // 1. Bắt đầu bằng 64, 67 hoặc 80 (vd: "670000", "641190 - Gia Nghĩa", "800000")
    if (/^(64|67|80)/.test(s)) return true;
    // 2. Chứa mã bưu cục (2-6 chữ số) có tiền tố 64, 67, 80 sau ký tự phân cách (vd: "BCKT (670000)", "Bưu điện 641190")
    if (/(?:^|[^\d])(64|67|80)(?:\d{4}|\d{2}|[^\d]|$)/.test(s)) return true;
    return false;
}

function isSpecialTransitStatus(status) {
    if (!status) return false;
    const s = String(status).trim();
    const lower = s.toLowerCase();
    if (s.includes('[BĐ8]Đã xác nhận đi') || s.includes('Đã xác nhận đi') || lower.includes('đã xác nhận đi') || lower.includes('da xac nhan di')) {
        return true;
    }
    if (s.includes('Đã đóng chuyến thư đi') || lower.includes('đã đóng chuyến thư đi') || lower.includes('da dong chuyen thu di')) {
        return true;
    }
    return false;
}

function shouldExcludeItem(status, location) {
    if (isSpecialTransitStatus(status)) {
        // Đối với "[BĐ8]Đã xác nhận đi" hoặc "Đã đóng chuyến thư đi":
        // Vị trí cuối cùng ở bc có đầu 2 số 64, 67, 80 -> Bảng 1 (Hàng tồn)
        if (hasTargetBcPrefix(location)) {
            return false; // Hàng tồn -> Bảng 1
        }
        // Nếu không có -> Bảng 2 (Trạng thái khác)
        return true; // Trạng thái khác -> Bảng 2
    }
    return isLoctonExcludedStatus(status);
}

function isLoctonExcludedStatus(status) {
    if (!status) return false;
    const s = String(status).trim();
    if (LOCTON_EXCLUDE_STATUSES.has(s)) return true;
    const lower = s.toLowerCase();
    if (lower.includes('phát thành công') && !lower.includes('không')) return true;
    if (lower.includes('thu tiền khách hàng') || lower.includes('thu tiền bưu tá')) return true;
    return false;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function updateLoctonStep(stepNum, status) {
    const stepEl = document.getElementById(`locton-step-${stepNum}`);
    if (!stepEl) return;
    stepEl.classList.remove('pending', 'active', 'completed');
    stepEl.classList.add(status);
    const iconWrap = stepEl.querySelector('.step-icon-wrap');
    if (!iconWrap) return;

    if (status === 'completed') {
        iconWrap.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else if (status === 'active') {
        iconWrap.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    } else {
        const defaultIcons = {
            1: '<i class="fa-solid fa-location-crosshairs"></i>',
            2: '<i class="fa-solid fa-boxes-stacked"></i>',
            3: '<i class="fa-solid fa-code-compare"></i>',
            4: '<i class="fa-solid fa-chart-pie"></i>'
        };
        iconWrap.innerHTML = defaultIcons[stepNum] || '<i class="fa-solid fa-circle"></i>';
    }
}

function setLoctonProgress(percent, title, subtitle, activeStep) {
    const card = document.getElementById('locton-processing-card');
    if (card) card.style.display = 'block';

    const bar = document.getElementById('locton-progress-bar-fill');
    if (bar) bar.style.width = `${percent}%`;

    const titleEl = document.getElementById('locton-progress-title');
    if (titleEl) titleEl.textContent = title;

    const subEl = document.getElementById('locton-progress-subtitle');
    if (subEl) subEl.textContent = subtitle;

    if (activeStep) {
        for (let i = 1; i <= 4; i++) {
            if (i < activeStep) updateLoctonStep(i, 'completed');
            else if (i === activeStep) updateLoctonStep(i, 'active');
            else updateLoctonStep(i, 'pending');
        }
    }
}

// Client-side Excel Processor using SheetJS (runs 100% in browser, fast & offline-ready)
async function processExcelLocTonInBrowser(hangtonFile, dinhViFile, onStage) {
    if (!window.XLSX) {
        throw new Error("Thư viện SheetJS (XLSX) chưa được tải trên trình duyệt.");
    }

    // 1. Đọc file định vị (dinh_vi.xlsx)
    if (onStage) onStage(1, 15, "Bước 1/4: Đọc file Định vị (dinh_vi.xlsx)...", "Đang trích xuất mã số hiệu, trạng thái và vị trí cuối cùng");
    await sleep(250);

    const bufDinhVi = await dinhViFile.arrayBuffer();
    const wbDinhVi = window.XLSX.read(bufDinhVi, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellStyles: false,
        cellText: false
    });

    const sheetNameDV = wbDinhVi.Sheets['DanhSach'] ? 'DanhSach' : wbDinhVi.SheetNames[0];
    const wsDinhVi = wbDinhVi.Sheets[sheetNameDV];
    const dinhViMap = new Map();

    if (wsDinhVi && wsDinhVi['!ref']) {
        const range = window.XLSX.utils.decode_range(wsDinhVi['!ref']);
        
        let colSoHieu = 1;      // Cột B
        let colTrangThai = 24;  // Cột Y
        let colViTri = 23;      // Cột X
        let dataStartRow = 2;   // Dòng 3

        // Quét tự động header từ dòng 0 đến dòng 4
        for (let r = range.s.r; r <= Math.min(range.s.r + 4, range.e.r); r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = wsDinhVi[window.XLSX.utils.encode_cell({ r, c })];
                if (cell && cell.v !== undefined && cell.v !== null) {
                    const val = String(cell.v).trim().toLowerCase();
                    if (val.includes('trạng thái cuối cùng') || val.includes('trang thai cuoi cung')) {
                        colTrangThai = c;
                        dataStartRow = Math.max(dataStartRow, r + 1);
                    } else if (
                        val.includes('vị trí cuối cùng') || val.includes('vi tri cuoi cung') ||
                        val.includes('bưu cục phát hiện tại') || val.includes('đơn vị cuối cùng') ||
                        val.startsWith('vị trí') || val.startsWith('vi tri')
                    ) {
                        colViTri = c;
                        dataStartRow = Math.max(dataStartRow, r + 1);
                    } else if ((val === 'số hiệu' || val === 'so hieu' || val.includes('mã bưu gửi') || val.includes('itemcode') || val === 'số hiệu bưu gửi') && !val.includes('khách hàng')) {
                        colSoHieu = c;
                        dataStartRow = Math.max(dataStartRow, r + 1);
                    }
                }
            }
        }

        for (let r = dataStartRow; r <= range.e.r; r++) {
            const cellB = wsDinhVi[window.XLSX.utils.encode_cell({ r, c: colSoHieu })];
            if (cellB && cellB.v !== undefined && cellB.v !== null) {
                const soHieu = String(cellB.v).trim();
                if (!soHieu) continue;

                const cellTT = wsDinhVi[window.XLSX.utils.encode_cell({ r, c: colTrangThai })];
                const tt = cellTT && cellTT.v !== undefined && cellTT.v !== null ? String(cellTT.v).trim() : '';

                const cellVT = wsDinhVi[window.XLSX.utils.encode_cell({ r, c: colViTri })];
                const vt = cellVT && cellVT.v !== undefined && cellVT.v !== null ? String(cellVT.v).trim() : '';

                dinhViMap.set(soHieu, { tt, vt });
            }
        }
    }

    // 2. Đọc file hàng tồn (hangton.xlsx)
    if (onStage) onStage(2, 40, "Bước 2/4: Đọc file Hàng tồn (hangton.xlsx)...", `Đã nạp ${dinhViMap.size} mã định vị. Đang đọc danh sách tồn`);
    await sleep(250);

    const bufHangton = await hangtonFile.arrayBuffer();
    const wbHangton = window.XLSX.read(bufHangton, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellStyles: false
    });
    const sheetNameHT = wbHangton.SheetNames[0];
    const wsHangton = wbHangton.Sheets[sheetNameHT];
    const hangtonRows = window.XLSX.utils.sheet_to_json(wsHangton, { defval: '' });

    // 3. Phân loại Bảng 1 & Bảng 2
    if (onStage) onStage(3, 70, "Bước 3/4: Đang đối soát dữ liệu & phân loại...", `Đang khớp ${hangtonRows.length} dòng hàng tồn với trạng thái định vị`);
    await sleep(300);

    const bang1 = [];
    const bang2 = [];

    const getVal = (row, candidates, fallback = '') => {
        for (const c of candidates) {
            if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
                return row[c];
            }
        }
        return fallback;
    };

    for (const item of hangtonRows) {
        const maBG = String(getVal(item, ['Mã bưu gửi', 'Mã BG', 'ItemCode', 'Số hiệu'])).trim();
        if (!maBG || !dinhViMap.has(maBG)) {
            continue; // Chỉ xử lý các bưu gửi có trong file định vị (INNER JOIN)
        }

        const dvInfo = dinhViMap.get(maBG);
        let ttcc = '';
        let vtcc = '';
        if (typeof dvInfo === 'object' && dvInfo !== null) {
            ttcc = dvInfo.tt || dvInfo.trangThai || '';
            vtcc = dvInfo.vt || dvInfo.viTri || '';
        } else {
            ttcc = String(dvInfo || '').trim();
        }

        const codVal = Number(getVal(item, ['COD', 'Tiền COD', 'Tien COD', 'Số tiền thu hộ'], 0)) || 0;
        const tlVal = Number(getVal(item, ['Trọng lượng', 'Khối lượng', 'TL'], 0)) || 0;

        // Đổi tên trạng thái đối với trường hợp [BĐ8]Đã xác nhận đi hoặc Đã đóng chuyến thư đi có vị trí ở bc đầu 64, 67, 80
        let trangThaiHienThi = ttcc;
        if (isSpecialTransitStatus(ttcc) && hasTargetBcPrefix(vtcc)) {
            trangThaiHienThi = vtcc ? `${ttcc} - ${vtcc}` : ttcc;
        }

        const rowData = {
            'Mã bưu gửi': maBG,
            'Mã BC phát': String(getVal(item, ['Mã bưu cục', 'Mã BC', 'Mã bưu cục phát', 'Mã BC phát', 'POS Code'])).trim(),
            'Tên BC phát': String(getVal(item, ['Bưu cục Phát', 'Tên BC phát', 'Tên bưu cục', 'Bưu cục phát', 'POS Name'])).trim(),
            'Ngày đến BC phát': String(getVal(item, ['DK1', 'Ngày đến', 'Ngày đến BC', 'Ngày đến BC phát'])).trim(),
            'Thời gian tồn': String(getVal(item, ['Thời gian tồn', 'TG tồn', 'Thời gian lưu'])).trim(),
            'Trạng thái hiện tại': trangThaiHienThi,
            'Trạng thái cuối cùng': trangThaiHienThi,
            'Vị trí cuối cùng': vtcc,
            'Thời gian cập nhật': String(getVal(item, ['Thời gian quét', 'Thời gian cập nhật', 'TG quet'])).trim(),
            'Người ký nhận': String(getVal(item, ['Người ký nhận', 'Người nhận', 'Nguoi nhan'])).trim(),
            'Tiền COD': codVal,
            'Khối lượng': tlVal
        };

        if (shouldExcludeItem(ttcc, vtcc)) {
            bang2.push(rowData);
        } else {
            bang1.push(rowData);
        }
    }

    // 4. Tổng hợp Bảng 3: Nhóm theo bưu cục từ Bảng 1
    if (onStage) onStage(4, 90, "Bước 4/4: Đang tổng hợp báo cáo các bưu cục...", `Bảng 1: ${bang1.length} bưu gửi | Bảng 2: ${bang2.length} bưu gửi`);
    await sleep(250);

    const groups = new Map();

    for (const row of bang1) {
        const maBC = row['Mã BC phát'];
        if (LOCTON_EXCLUDE_BC.has(maBC)) continue;

        const tenBC = row['Tên BC phát'];
        const key = `${maBC}___${tenBC}`;

        if (!groups.has(key)) {
            groups.set(key, {
                'Mã BC': maBC,
                'Tên bưu cục': tenBC,
                'SL Tồn 3N': 0,
                'Tiền COD 3N': 0,
                'SL Tồn 5N': 0,
                'Tiền COD 5N': 0,
                'SL Tồn 7N': 0,
                'Tiền COD 7N': 0,
                'SL Tồn 14N': 0,
                'Tiền COD 14N': 0,
                'Tổng tồn': 0,
                'Tổng tiền COD': 0
            });
        }

        const g = groups.get(key);
        const tgt = row['Thời gian tồn'];
        const cod = row['Tiền COD'];

        if (tgt === '≥3 ngày' || tgt.includes('3')) {
            g['SL Tồn 3N'] += 1;
            g['Tiền COD 3N'] += cod;
        } else if (tgt === '≥5 ngày' || tgt.includes('5')) {
            g['SL Tồn 5N'] += 1;
            g['Tiền COD 5N'] += cod;
        } else if (tgt === '≥7 ngày' || tgt.includes('7')) {
            g['SL Tồn 7N'] += 1;
            g['Tiền COD 7N'] += cod;
        } else if (tgt === '≥14 ngày' || tgt.includes('14')) {
            g['SL Tồn 14N'] += 1;
            g['Tiền COD 14N'] += cod;
        }

        g['Tổng tồn'] += 1;
        g['Tổng tiền COD'] += cod;
    }

    const bang3List = Array.from(groups.values());

    // Dòng tổng toàn tỉnh Lâm Đồng
    const rowTongLamDong = {
        'Mã BC': '67',
        'Tên bưu cục': 'TOÀN TỈNH LÂM ĐỒNG',
        'SL Tồn 3N': 0,
        'Tiền COD 3N': 0,
        'SL Tồn 5N': 0,
        'Tiền COD 5N': 0,
        'SL Tồn 7N': 0,
        'Tiền COD 7N': 0,
        'SL Tồn 14N': 0,
        'Tiền COD 14N': 0,
        'Tổng tồn': 0,
        'Tổng tiền COD': 0
    };

    for (const item of bang3List) {
        rowTongLamDong['SL Tồn 3N'] += item['SL Tồn 3N'];
        rowTongLamDong['Tiền COD 3N'] += item['Tiền COD 3N'];
        rowTongLamDong['SL Tồn 5N'] += item['SL Tồn 5N'];
        rowTongLamDong['Tiền COD 5N'] += item['Tiền COD 5N'];
        rowTongLamDong['SL Tồn 7N'] += item['SL Tồn 7N'];
        rowTongLamDong['Tiền COD 7N'] += item['Tiền COD 7N'];
        rowTongLamDong['SL Tồn 14N'] += item['SL Tồn 14N'];
        rowTongLamDong['Tiền COD 14N'] += item['Tiền COD 14N'];
        rowTongLamDong['Tổng tồn'] += item['Tổng tồn'];
        rowTongLamDong['Tổng tiền COD'] += item['Tổng tiền COD'];
    }

    const bang3 = [rowTongLamDong, ...bang3List];

    if (onStage) onStage(4, 100, "Hoàn tất đối soát bưu gửi!", "Đang chuẩn bị hiển thị dữ liệu lên bảng");
    await sleep(350);

    return {
        bang1,
        bang2,
        bang3,
        stats: {
            hangtonTotal: hangtonRows.length,
            dinhViTotal: dinhViMap.size,
            bang1Count: bang1.length,
            bang2Count: bang2.length,
            bang3Count: bang3List.length
        }
    };
}

// Client-side Excel Export using SheetJS
function exportLocTonInBrowser(bang1, bang2, bang3) {
    if (!window.XLSX) {
        throw new Error("Thư viện SheetJS (XLSX) chưa được tải.");
    }
    const wb = window.XLSX.utils.book_new();

    // Sheet 1: Tổng tồn các BC
    const ws3 = window.XLSX.utils.json_to_sheet(bang3 || []);
    window.XLSX.utils.book_append_sheet(wb, ws3, 'Tổng tồn các BC');

    // Sheet 2: Danh sách bưu gửi tồn (Bảng 1)
    const ws1 = window.XLSX.utils.json_to_sheet(bang1 || []);
    window.XLSX.utils.book_append_sheet(wb, ws1, 'Danh sách bưu gửi tồn');

    // Sheet 3: Danh sách bg trạng thái khác (Bảng 2)
    const ws2 = window.XLSX.utils.json_to_sheet(bang2 || []);
    window.XLSX.utils.book_append_sheet(wb, ws2, 'Danh sách bg trạng thái khác');

    [ws3, ws1, ws2].forEach(ws => {
        if (!ws['!ref']) return;
        const range = window.XLSX.utils.decode_range(ws['!ref']);
        const colWidths = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            colWidths.push({ wch: 18 });
        }
        ws['!cols'] = colWidths;
    });

    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const filename = `Loc_ton_${dateStr}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

async function handleLoctonProcess() {
    if (!loctonHangtonFile) {
        showLoctonAlert("Vui lòng chọn hoặc kéo thả file Hàng Tồn (hangton.xlsx)", "danger");
        return;
    }
    if (!loctonDinhViFile) {
        showLoctonAlert("Vui lòng chọn hoặc kéo thả file Định Vị (dinh_vi.xlsx)", "danger");
        return;
    }

    const btnProcess = document.getElementById("btn-locton-process");
    const originalHtml = btnProcess ? btnProcess.innerHTML : "";
    if (btnProcess) {
        btnProcess.disabled = true;
        btnProcess.classList.add("btn-locton-pulsing");
        btnProcess.innerHTML = `<i class="fa-solid fa-atom fa-spin"></i> Đang phân tích...`;
    }
    hideLoctonAlert();

    // Ẩn bảng kết quả cũ để tập trung vào animation xử lý
    const kpiSec = document.getElementById("locton-kpis");
    const tblCard = document.getElementById("locton-table-card");
    const procCard = document.getElementById("locton-processing-card");

    if (kpiSec) kpiSec.style.display = "none";
    if (tblCard) tblCard.style.display = "none";
    if (procCard) {
        procCard.style.display = "block";
        procCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    try {
        let result = null;

        // Ưu tiên xử lý trực tiếp trên trình duyệt bằng SheetJS với hiệu ứng chuyển bước sinh động
        if (typeof window.XLSX !== 'undefined') {
            result = await processExcelLocTonInBrowser(
                loctonHangtonFile, 
                loctonDinhViFile, 
                (step, pct, title, sub) => {
                    setLoctonProgress(pct, title, sub, step);
                    if (btnProcess) {
                        btnProcess.innerHTML = `<i class="fa-solid fa-atom fa-spin"></i> Đang xử lý (${pct}%)...`;
                    }
                }
            );
        } else {
            // Dự phòng: gọi lên backend service nếu SheetJS chưa nạp
            setLoctonProgress(30, "Đang tải file lên máy chủ...", "Vui lòng chờ máy chủ xử lý dữ liệu", 2);

            const formData = new FormData();
            formData.append("hangton", loctonHangtonFile);
            formData.append("dinh_vi", loctonDinhViFile);

            const resp = await fetch("/api/locton/process", {
                method: "POST",
                body: formData
            });

            setLoctonProgress(80, "Đang nhận kết quả từ máy chủ...", "Đang đối soát hoàn tất", 3);

            const contentType = resp.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                const textErr = await resp.text();
                throw new Error(`Máy chủ phản hồi mã ${resp.status} (${resp.statusText || 'Lỗi kết nối'}). Vui lòng kiểm tra container vnp-locton-backend đã chạy chưa.`);
            }

            const jsonResp = await resp.json();
            if (!jsonResp.success) {
                throw new Error(jsonResp.message || "Xử lý file thất bại");
            }
            result = {
                bang1: jsonResp.data.bang1,
                bang2: jsonResp.data.bang2,
                bang3: jsonResp.data.bang3,
                stats: jsonResp.stats
            };
            setLoctonProgress(100, "Hoàn tất đối soát bưu gửi!", "Đang chuẩn bị hiển thị dữ liệu", 4);
            await sleep(300);
        }

        loctonData = {
            bang1: result.bang1 || [],
            bang2: result.bang2 || [],
            bang3: result.bang3 || []
        };
        const stats = result.stats || {};

        // Update KPI values
        const kpiTotal = document.getElementById("locton-kpi-total");
        const kpiB1 = document.getElementById("locton-kpi-bang1");
        const kpiB2 = document.getElementById("locton-kpi-bang2");
        const kpiB3 = document.getElementById("locton-kpi-bang3");

        if (kpiTotal) kpiTotal.textContent = formatNumber(stats.hangtonTotal || 0);
        if (kpiB1) kpiB1.textContent = formatNumber(stats.bang1Count || 0);
        if (kpiB2) kpiB2.textContent = formatNumber(stats.bang2Count || 0);
        if (kpiB3) kpiB3.textContent = formatNumber(stats.bang3Count || 0);

        // Update tab badges
        const countTab1 = document.getElementById("locton-count-tab1");
        const countTab2 = document.getElementById("locton-count-tab2");
        const countTab3 = document.getElementById("locton-count-tab3");

        if (countTab1) countTab1.textContent = formatNumber(loctonData.bang1.length);
        if (countTab2) countTab2.textContent = formatNumber(loctonData.bang2.length);
        if (countTab3) countTab3.textContent = formatNumber(loctonData.bang3.length);

        // Ẩn thanh progress và kích hoạt animation fade-in xuất hiện kết quả
        if (procCard) procCard.style.display = "none";

        if (kpiSec) {
            kpiSec.classList.remove("locton-fade-in");
            void kpiSec.offsetWidth; // Trigger reflow
            kpiSec.classList.add("locton-fade-in");
            kpiSec.style.display = "grid";
        }

        if (tblCard) {
            tblCard.classList.remove("locton-fade-in");
            void tblCard.offsetWidth; // Trigger reflow
            tblCard.classList.add("locton-fade-in");
            tblCard.style.display = "block";
        }

        const btnExp = document.getElementById("btn-locton-export-excel");
        if (btnExp) btnExp.style.display = "inline-flex";

        showToast("Lọc và đối soát dữ liệu thành công!", "success");
        setLoctonTab(3); // Default view Bảng 3
    } catch (err) {
        console.error("Lỗi lọc tồn:", err);
        showLoctonAlert("Lỗi: " + err.message, "danger");
        if (procCard) procCard.style.display = "none";
    } finally {
        if (btnProcess) {
            btnProcess.disabled = false;
            btnProcess.classList.remove("btn-locton-pulsing");
            btnProcess.innerHTML = originalHtml;
        }
    }
}

function setLoctonTab(tabNum) {
    loctonActiveTab = tabNum;
    loctonCurrentPage = 1;

    [1, 2, 3].forEach(n => {
        const btn = document.getElementById(`tab-locton-${n}`);
        if (btn) {
            if (n === tabNum) {
                btn.classList.add("active");
                btn.style.color = "var(--accent-emerald)";
                btn.style.borderBottom = "3px solid var(--accent-emerald)";
            } else {
                btn.classList.remove("active");
                btn.style.color = "var(--text-muted)";
                btn.style.borderBottom = "none";
            }
        }
    });

    renderLoctonTable();
}

function renderLoctonTable() {
    const thead = document.getElementById("locton-thead");
    const tbody = document.getElementById("locton-tbody");
    if (!thead || !tbody) return;

    let sourceList = [];
    if (loctonActiveTab === 1) sourceList = loctonData.bang1 || [];
    else if (loctonActiveTab === 2) sourceList = loctonData.bang2 || [];
    else sourceList = loctonData.bang3 || [];

    // Filter by search query
    let filtered = sourceList;
    if (loctonSearchText) {
        filtered = sourceList.filter(row => {
            return Object.values(row).some(val => 
                String(val !== null && val !== undefined ? val : "").toLowerCase().includes(loctonSearchText)
            );
        });
    }

    const totalRows = filtered.length;
    const totalPages = Math.ceil(totalRows / loctonPageSize) || 1;
    if (loctonCurrentPage > totalPages) loctonCurrentPage = totalPages;
    if (loctonCurrentPage < 1) loctonCurrentPage = 1;

    const startIdx = (loctonCurrentPage - 1) * loctonPageSize;
    const endIdx = Math.min(startIdx + loctonPageSize, totalRows);
    const pageRows = filtered.slice(startIdx, endIdx);

    // Update pagination info & buttons
    const pageInfo = document.getElementById("locton-pagination-info");
    if (pageInfo) {
        pageInfo.textContent = `Hiển thị ${totalRows > 0 ? startIdx + 1 : 0} - ${endIdx} trong tổng số ${formatNumber(totalRows)} bản ghi`;
    }
    const btnPrev = document.getElementById("btn-locton-prev");
    const btnNext = document.getElementById("btn-locton-next");
    if (btnPrev) btnPrev.disabled = loctonCurrentPage <= 1;
    if (btnNext) btnNext.disabled = loctonCurrentPage >= totalPages;

    // Render Headers & Rows according to tab
    if (loctonActiveTab === 3) {
        thead.innerHTML = `
            <tr>
                <th style="width: 50px;" class="text-center">STT</th>
                <th style="width: 100px;">Mã BC</th>
                <th>Tên bưu cục</th>
                <th class="text-right">SL 3N</th>
                <th class="text-right">Tiền COD 3N</th>
                <th class="text-right">SL 5N</th>
                <th class="text-right">Tiền COD 5N</th>
                <th class="text-right">SL 7N</th>
                <th class="text-right">Tiền COD 7N</th>
                <th class="text-right">SL 14N</th>
                <th class="text-right">Tiền COD 14N</th>
                <th class="text-right" style="color: var(--accent-emerald); font-weight: 700;">Tổng tồn</th>
                <th class="text-right" style="color: var(--accent-emerald); font-weight: 700;">Tổng COD</th>
            </tr>
        `;

        if (pageRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted" style="padding: 24px;">Không có dữ liệu</td></tr>`;
            return;
        }

        tbody.innerHTML = pageRows.map((r, idx) => {
            const isTotalRow = String(r["Mã BC"]).includes("TOÀN TỈNH") || r["Mã BC"] === "TONG" || r["Mã BC"] === "67";
            const rowClass = isTotalRow ? 'style="font-weight: 700; background: var(--accent-emerald-light); color: var(--accent-emerald);"' : '';
            return `
                <tr ${rowClass}>
                    <td class="text-center">${isTotalRow ? "★" : startIdx + idx + 1}</td>
                    <td><strong>${r["Mã BC"] || ""}</strong></td>
                    <td>${r["Tên bưu cục"] || ""}</td>
                    <td class="text-right">${formatNumber(r["SL Tồn 3N"] || 0)}</td>
                    <td class="text-right">${formatCurrency(r["Tiền COD 3N"] || 0)}</td>
                    <td class="text-right">${formatNumber(r["SL Tồn 5N"] || 0)}</td>
                    <td class="text-right">${formatCurrency(r["Tiền COD 5N"] || 0)}</td>
                    <td class="text-right">${formatNumber(r["SL Tồn 7N"] || 0)}</td>
                    <td class="text-right">${formatCurrency(r["Tiền COD 7N"] || 0)}</td>
                    <td class="text-right">${formatNumber(r["SL Tồn 14N"] || 0)}</td>
                    <td class="text-right">${formatCurrency(r["Tiền COD 14N"] || 0)}</td>
                    <td class="text-right" style="font-weight: 700; color: var(--accent-emerald);">${formatNumber(r["Tổng tồn"] || 0)}</td>
                    <td class="text-right" style="font-weight: 700; color: var(--accent-emerald);">${formatCurrency(r["Tổng tiền COD"] || 0)}</td>
                </tr>
            `;
        }).join("");
    } else {
        // Bảng 1 hoặc Bảng 2
        thead.innerHTML = `
            <tr>
                <th style="width: 50px;" class="text-center">STT</th>
                <th style="width: 140px;">Mã bưu gửi</th>
                <th style="width: 90px;">Mã BC</th>
                <th>Tên bưu cục phát</th>
                <th style="width: 110px;">Ngày đến BC</th>
                <th style="width: 100px;">TG tồn</th>
                <th>Trạng thái định vị</th>
                <th>Vị trí cuối cùng</th>
                <th style="width: 140px;">TG cập nhật</th>
                <th>Người nhận</th>
                <th class="text-right" style="width: 110px;">Tiền COD</th>
                <th class="text-right" style="width: 90px;">TL (g)</th>
            </tr>
        `;

        if (pageRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding: 24px;">Không có dữ liệu</td></tr>`;
            return;
        }

        tbody.innerHTML = pageRows.map((r, idx) => {
            const statusBadgeClass = loctonActiveTab === 2 
                ? "background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);" 
                : "background: rgba(245, 158, 11, 0.15); color: #d97706;";
            return `
                <tr>
                    <td class="text-center">${startIdx + idx + 1}</td>
                    <td><strong>${r["Mã bưu gửi"] || ""}</strong></td>
                    <td>${r["Mã BC phát"] || r["Mã bưu cục"] || ""}</td>
                    <td>${r["Tên BC phát"] || r["Bưu cục Phát"] || ""}</td>
                    <td>${r["Ngày đến BC phát"] || r["DK1"] || ""}</td>
                    <td><span class="badge" style="background: var(--bg-secondary); font-size: 11.5px; padding: 2px 8px; border-radius: 4px;">${r["Thời gian tồn"] || ""}</span></td>
                    <td><span class="badge" style="${statusBadgeClass} font-size: 11.5px; padding: 3px 8px; border-radius: 4px; font-weight: 600;">${r["Trạng thái hiện tại"] || r["Trạng thái cuối cùng"] || "Chưa có thông tin"}</span></td>
                    <td><span style="font-size: 12.5px; color: var(--text-primary); font-weight: 500;">${r["Vị trí cuối cùng"] || "-"}</span></td>
                    <td style="font-size: 12px; color: var(--text-muted);">${r["Thời gian cập nhật"] || r["Thời gian quét"] || ""}</td>
                    <td>${r["Người ký nhận"] || r["Bưu tá"] || ""}</td>
                    <td class="text-right">${formatCurrency(r["Tiền COD"] || r["COD"] || 0)}</td>
                    <td class="text-right">${formatNumber(r["Khối lượng"] || r["Trọng lượng"] || 0)}</td>
                </tr>
            `;
        }).join("");
    }
}

async function handleLoctonExport() {
    if (!loctonData.bang1 || !loctonData.bang2 || !loctonData.bang3) {
        showToast("Không có dữ liệu để xuất file", "warning");
        return;
    }

    const btnExport = document.getElementById("btn-locton-export-excel");
    const origHtml = btnExport ? btnExport.innerHTML : "";
    if (btnExport) {
        btnExport.disabled = true;
        btnExport.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo file Excel...`;
    }

    try {
        if (typeof window.XLSX !== 'undefined') {
            exportLocTonInBrowser(loctonData.bang1, loctonData.bang2, loctonData.bang3);
            showToast("Đã tải xuống file Excel lọc tồn thành công!", "success");
        } else {
            const resp = await fetch("/api/locton/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bang1: loctonData.bang1,
                    bang2: loctonData.bang2,
                    bang3: loctonData.bang3
                })
            });

            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text.slice(0, 100)}`);
            }

            const blob = await resp.blob();
            const dateStr = new Date().toISOString().split("T")[0];
            const filename = `Loc_ton_${dateStr}.xlsx`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showToast("Đã tải xuống file Excel lọc tồn thành công!", "success");
        }
    } catch (err) {
        console.error("Lỗi xuất file lọc tồn:", err);
        showToast("Lỗi xuất file Excel: " + err.message, "error");
    } finally {
        if (btnExport) {
            btnExport.disabled = false;
            btnExport.innerHTML = origHtml;
        }
    }
}

function showLoctonAlert(msg, type = "info") {
    const el = document.getElementById("locton-alert");
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.style.display = "block";
    el.textContent = msg;
}

function hideLoctonAlert() {
    const el = document.getElementById("locton-alert");
    if (el) el.style.display = "none";
}

function resetLoctonState() {
    loctonHangtonFile = null;
    loctonDinhViFile = null;
    loctonData = { bang1: [], bang2: [], bang3: [] };
    loctonSearchText = "";
    loctonCurrentPage = 1;

    const inputHangton = document.getElementById("input-locton-hangton");
    const labelHangton = document.getElementById("label-locton-hangton");
    const badgeHangton = document.getElementById("badge-locton-hangton");
    if (inputHangton) inputHangton.value = "";
    if (labelHangton) labelHangton.textContent = "Kéo thả file vào đây hoặc bấm để chọn";
    if (badgeHangton) badgeHangton.style.display = "none";

    const inputDinhVi = document.getElementById("input-locton-dinhvi");
    const labelDinhVi = document.getElementById("label-locton-dinhvi");
    const badgeDinhVi = document.getElementById("badge-locton-dinhvi");
    if (inputDinhVi) inputDinhVi.value = "";
    if (labelDinhVi) labelDinhVi.textContent = "Kéo thả file vào đây hoặc bấm để chọn";
    if (badgeDinhVi) badgeDinhVi.style.display = "none";

    const searchInput = document.getElementById("locton-search-input");
    if (searchInput) searchInput.value = "";

    hideLoctonAlert();
    const kpiSec = document.getElementById("locton-kpis");
    const tblCard = document.getElementById("locton-table-card");
    const btnExp = document.getElementById("btn-locton-export-excel");

    if (kpiSec) kpiSec.style.display = "none";
    if (tblCard) tblCard.style.display = "none";
    if (btnExp) btnExp.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    initDataNoteModal();
    initUrlErrorOverlay();
    initPosConfig();
    initLoctonView();
    init();
});

