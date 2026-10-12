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

        // Populate Categories into Custom Multiselect with fixed list
        const fixedLoaiTons = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];
        if (multiselectCategoryList) {
            multiselectCategoryList.innerHTML = '';
            fixedLoaiTons.forEach(cat => {
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

function setDashboardUrlError(hasError, message = "") {
    isDashboardUrlError = hasError;
    const overlay = document.getElementById("dashboard-url-error-overlay");
    const viewDashboard = document.getElementById("view-dashboard");
    const errorDetailContent = document.getElementById("url-error-detail-content");

    if (hasError) {
        if (overlay) overlay.style.display = "flex";
        if (viewDashboard) viewDashboard.classList.add("dashboard-locked");
        if (errorDetailContent && message) {
            errorDetailContent.textContent = message;
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
        if (overlay) overlay.style.display = "none";
        if (viewDashboard) viewDashboard.classList.remove("dashboard-locked");

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
            setDashboardUrlError(true, data.error_message || "Mã lỗi HTTP: 401/403 - URL báo cáo Power BI không tồn tại hoặc đã bị hủy quyền truy cập.");
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

function renderSummary(data) {
    if (!data || !data.matrix) return;

    const categories = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"];

    // Load config for Matrix Total Columns
    const savedColsStr = localStorage.getItem("matrix_total_columns");
    let targetCats = ["≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"]; // Default fallback: sum all categories
    if (savedColsStr) {
        try {
            const parsed = JSON.parse(savedColsStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
                targetCats = parsed;
            }
        } catch (e) { }
    }

    // Update the "Toàn tỉnh" column header label dynamically to show selected columns
    const headerSublabel = document.getElementById("matrix-header-sublabel");
    if (headerSublabel) {
        if (targetCats.length === categories.length && categories.every(c => targetCats.includes(c))) {
            headerSublabel.textContent = "(Tất cả cột)";
        } else {
            headerSublabel.textContent = `(${targetCats.join(', ')})`;
        }
    }

    let colTotals = {
        "≥3 ngày": { qty: 0, cod: 0.0 },
        "≥4 ngày": { qty: 0, cod: 0.0 },
        "≥5 ngày": { qty: 0, cod: 0.0 },
        "≥7 ngày": { qty: 0, cod: 0.0 },
        "≥14 ngày": { qty: 0, cod: 0.0 },
        "Total": { qty: 0, cod: 0.0 }
    };

    let posList = Object.keys(data.matrix);

    if (posList.length === 0) {
        matrixTbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Không có dữ liệu tổng hợp.</td></tr>';
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
            const cat = parts[1];

            if (cat === "Total") {
                let totalQtyA = 0, totalCodA = 0;
                targetCats.forEach(c => {
                    const cell = data.matrix[a][c] || { qty: 0, cod: 0 };
                    totalQtyA += cell.qty;
                    totalCodA += cell.cod;
                });
                valA = type === "qty" ? totalQtyA : totalCodA;

                let totalQtyB = 0, totalCodB = 0;
                targetCats.forEach(c => {
                    const cell = data.matrix[b][c] || { qty: 0, cod: 0 };
                    totalQtyB += cell.qty;
                    totalCodB += cell.cod;
                });
                valB = type === "qty" ? totalQtyB : totalCodB;
            } else {
                const cellA = data.matrix[a][cat] || { qty: 0, cod: 0 };
                const cellB = data.matrix[b][cat] || { qty: 0, cod: 0 };
                valA = type === "qty" ? cellA.qty : cellA.cod;
                valB = type === "qty" ? cellB.qty : cellB.cod;
            }
        }

        if (valA < valB) return matrixSortDir === "asc" ? -1 : 1;
        if (valA > valB) return matrixSortDir === "asc" ? 1 : -1;
        return 0;
    });

    // First, compute all totals across all POS offices to build the totals row
    posList.forEach(pos => {
        let rowTotalQty = 0;
        let rowTotalCod = 0;
        categories.forEach(cat => {
            const cell = data.matrix[pos][cat] || { qty: 0, cod: 0 };
            colTotals[cat].qty += cell.qty;
            colTotals[cat].cod += cell.cod;

            // Dynamically sum configured columns for the Total column
            if (targetCats.includes(cat)) {
                rowTotalQty += cell.qty;
                rowTotalCod += cell.cod;
            }
        });
        colTotals["Total"].qty += rowTotalQty;
        colTotals["Total"].cod += rowTotalCod;
    });

    matrixTbody.innerHTML = "";

    // 1. Render totals row AT THE TOP of the table body (categories first, Total last)
    const totalTrTop = document.createElement("tr");
    totalTrTop.className = "total-row top-total-row";
    let totalRowHtml = `<td></td><td>TOÀN TỈNH</td>`;
    categories.forEach(cat => {
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

    // 2. Render each POS office row (with categories first, then Total column last)
    posList.forEach((pos, index) => {
        const tr = document.createElement("tr");
        let rowHtml = `
            <td class="text-center" style="font-family: var(--font-mono); font-size: 13px; font-weight: 500; color: var(--text-secondary);">${index + 1}</td>
            <td class="pos-name-cell">${pos}</td>
        `;
        let rowTotalQty = 0;
        let rowTotalCod = 0;

        // Breakdown columns first
        categories.forEach(cat => {
            const cell = data.matrix[pos][cat] || { qty: 0, cod: 0 };
            rowHtml += `
                <td class="qty-cell text-right" data-cat="${cat}" data-qty="${cell.qty}">${formatNumber(cell.qty)}</td>
                <td class="cod-cell text-right">${formatCurrency(cell.cod)}</td>
            `;

            // Dynamically sum configured columns for the Total column
            if (targetCats.includes(cat)) {
                rowTotalQty += cell.qty;
                rowTotalCod += cell.cod;
            }
        });

        // Total column last + Action button
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

    // 3. Render totals row AT THE BOTTOM of the table body for completeness
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

// Sorting matrix headers
document.querySelectorAll(".sortable-matrix").forEach(header => {
    header.addEventListener("click", () => {
        const col = header.getAttribute("data-sort");

        if (matrixSortCol === col) {
            matrixSortDir = matrixSortDir === "asc" ? "desc" : "asc";
        } else {
            matrixSortCol = col;
            matrixSortDir = col === "pos_name" ? "asc" : "desc";
        }

        document.querySelectorAll(".sortable-matrix i").forEach(icon => {
            icon.className = "fa-solid fa-sort";
        });

        const icon = header.querySelector("i");
        icon.className = matrixSortDir === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";

        if (cachedSummaryData) {
            renderSummary(cachedSummaryData);
        }
    });
});

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

// Login Captcha State
let loginCaptchaFields = null;
let loginCaptchaCookies = null;

async function loadLoginCaptcha() {
    const imgWrapper = document.getElementById("login-captcha-img-wrapper");
    if (!imgWrapper) return;

    imgWrapper.innerHTML = `<span class="captcha-placeholder" style="font-size: 12.5px; color: var(--text-muted);">Đang tải...</span>`;
    document.getElementById("login-captcha-input").value = "";

    try {
        const res = await fetch("/api/auth/login-captcha");
        if (!res.ok) throw new Error("Không thể tải captcha");
        const data = await res.json();

        loginCaptchaFields = data.fields;
        loginCaptchaCookies = data.cookies;

        imgWrapper.innerHTML = `<img src="${data.captchaImage}" alt="Captcha VNPost" style="max-height: 100%; max-width: 100%; object-fit: contain;" />`;
    } catch (err) {
        imgWrapper.innerHTML = `<span class="text-red" style="font-size: 11.5px; font-weight: bold;">Lỗi tải Captcha.</span>`;
    }
}

// Bind refresh button
document.getElementById("btn-refresh-login-captcha").addEventListener("click", loadLoginCaptcha);

// Login Submit Handler (Local DB checks on python backend port 8000)
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const captchaSolution = document.getElementById("login-captcha-input").value.trim();

    loginError.style.display = "none";
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password,
                captchaSolution,
                initialFields: loginCaptchaFields,
                initialCookies: loginCaptchaCookies
            })
        });

        const data = await res.json();
        if (!res.ok) {
            // Reload captcha on error
            loadLoginCaptcha();
            throw new Error(data.detail || "Đăng nhập thất bại.");
        }

        localStorage.setItem("vnpost_token", data.token);
        localStorage.setItem("vnpost_user", JSON.stringify(data.user));

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
        document.querySelectorAll(".th-history-user").forEach(el => el.style.display = "table-cell");
    } else {
        menuUsers.style.display = "none";
        document.querySelectorAll(".th-history-user").forEach(el => el.style.display = "none");
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
    stopSessionPolling();
    mainAppContainer.style.display = "none";
    loginContainer.style.display = "flex";
    loadLoginCaptcha();
});


// Tab / View Switching controller
const views = ["dashboard", "export", "history", "users"];
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

    // Start active view specific operations
    if (viewName === "export") {
        loadSessionsStatus();
        startSessionPolling();
    } else {
        stopSessionPolling();
    }

    if (viewName === "history") {
        loadHistoryList();
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
                const isRefresh = (session !== undefined);
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
    const url = isCaptchaRefresh
        ? `${API_BASE_DINHVI}/api/vnpost/refresh-session`
        : `${API_BASE_DINHVI}/api/vnpost/add-session`;

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
                initialCookies: currentCaptchaCookies
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Gửi captcha thất bại.");
        }

        document.getElementById("session-captcha-input").value = "";
        document.getElementById("session-captcha-form").style.display = "none";
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

        const mergeData = await mergeRes.json();
        if (mergeRes.ok) {
            progressBar.style.width = "100%";
            progressText.textContent = "100%";
            addExportLog(`Hoàn tất! Xuất thành công ${successCount}/${codes.length} bưu gửi.`, "success");

            const token = localStorage.getItem("vnpost_token");
            const downloadUrl = `${API_BASE_DINHVI}/api/history/${mergeData.historyId}/download?authorization=Bearer ${token}`;

            const downloadBtn = document.getElementById("btn-download-export-file");
            downloadBtn.href = downloadUrl;
            document.getElementById("export-download-wrapper").style.display = "block";

            window.open(downloadUrl);
        } else {
            progressBar.style.width = "0%";
            progressText.textContent = "0%";
            addExportLog(`Lỗi gộp dữ liệu Excel: ${mergeData.error}`, "error");
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
// --- HISTORY VIEW HANDLERS ---
// ==========================================

async function loadHistoryList() {
    const tbody = document.getElementById("history-table-tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Đang tải lịch sử xuất...</td></tr>`;

    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/history`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Không thể tải lịch sử.");
        const data = await res.json();

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Không có lịch sử xuất file.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        const user = JSON.parse(localStorage.getItem("vnpost_user") || "{}");
        const showUser = user.role === "admin";

        data.forEach(item => {
            const tr = document.createElement("tr");
            const time = new Date(item.export_time).toLocaleString("vi-VN");
            const statusClass = item.status === "success" ? "badge badge-success" : "badge badge-counter";
            const statusText = item.status === "success" ? "Thành công" : item.status;

            tr.innerHTML = `
                <td>${time}</td>
                <td class="td-history-user" style="display: ${showUser ? 'table-cell' : 'none'};">${item.username || 'N/A'}</td>
                <td>${item.total_codes} bưu gửi (Định vị: ${item.success_codes})</td>
                <td style="font-family: var(--font-mono); font-size: 13px;">${item.file_name}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td class="text-right">
                    <button class="btn btn-secondary btn-sm" onclick="viewHistoryDetail(${item.id})"><i class="fa-solid fa-eye"></i> Xem</button>
                    <button class="btn btn-primary btn-sm" onclick="downloadHistoryFile(${item.id})"><i class="fa-solid fa-download"></i> Tải</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red">Lỗi: ${err.message}</td></tr>`;
    }
}

window.downloadHistoryFile = function (historyId) {
    const token = localStorage.getItem("vnpost_token");
    window.open(`${API_BASE_DINHVI}/api/history/${historyId}/download?authorization=Bearer ${token}`);
};

let detailHistoryId = null;
window.viewHistoryDetail = async function (historyId) {
    detailHistoryId = historyId;
    const modal = document.getElementById("history-detail-modal");
    const tbody = document.getElementById("detail-modal-table-tbody");
    tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">Đang tải chi tiết bưu gửi...</td></tr>`;

    document.getElementById("detail-export-time").textContent = "-";
    document.getElementById("detail-export-user").textContent = "-";
    document.getElementById("detail-export-qty").textContent = "-";
    document.getElementById("detail-export-file").textContent = "-";

    modal.style.display = "flex";

    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/history/${historyId}/items`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Không thể tải chi tiết.");
        const data = await res.json();

        const timeStr = data.length > 0 && data[0].export_time ? new Date(data[0].export_time).toLocaleString("vi-VN") : "-";
        document.getElementById("detail-export-time").textContent = timeStr;
        document.getElementById("detail-export-user").textContent = data.length > 0 ? (data[0].username || "N/A") : "-";
        document.getElementById("detail-export-qty").textContent = `${data.length} bưu gửi`;
        document.getElementById("detail-export-file").textContent = data.length > 0 ? (data[0].file_name || "Excel Export") : "-";

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">Không tìm thấy bưu gửi nào.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        data.forEach(item => {
            const tr = document.createElement("tr");
            let detailsHtml = "";
            try {
                const info = JSON.parse(item.data_json);
                const parts = [];
                for (const [k, v] of Object.entries(info)) {
                    if (v && v.toString().trim() !== "") {
                        parts.push(`<strong>${k}:</strong> ${v}`);
                    }
                }
                detailsHtml = parts.join(" | ");
            } catch (_) {
                detailsHtml = item.data_json;
            }

            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-weight: 700; width: 150px;">${item.tracking_code}</td>
                <td>${detailsHtml || '<span class="text-muted">Không có dữ liệu chi tiết</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-red">Lỗi: ${err.message}</td></tr>`;
    }
};

document.getElementById("history-search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("history-search-input").value.trim();
    if (!q) return;

    const resultsContainer = document.getElementById("search-results-container");
    resultsContainer.style.display = "block";
    resultsContainer.innerHTML = `<div class="text-muted">Đang tìm kiếm bưu gửi ${q}...</div>`;

    try {
        const res = await fetch(`${API_BASE_DINHVI}/api/history/search?code=${q}`, {
            headers: getHeaders()
        });
        if (!res.ok) throw new Error("Lỗi tìm kiếm.");
        const data = await res.json();

        if (data.length === 0) {
            resultsContainer.innerHTML = `<div class="text-muted" style="padding: 12px; background: var(--bg-secondary); border-radius: 8px;">Không tìm thấy bưu gửi "${q}" trong lịch sử.</div>`;
            return;
        }

        resultsContainer.innerHTML = "";
        data.forEach(item => {
            const div = document.createElement("div");
            div.className = "search-item-card";
            const time = new Date(item.export_time).toLocaleString("vi-VN");

            let detailsGrid = "";
            try {
                const info = JSON.parse(item.data_json);
                const props = [];
                for (const [k, v] of Object.entries(info)) {
                    props.push(`
                        <div class="search-item-prop">${k}:</div>
                        <div class="search-item-val">${v || '-'}</div>
                    `);
                }
                detailsGrid = `<div class="search-item-details">${props.join("")}</div>`;
            } catch (_) {
                detailsGrid = `<div class="text-muted">${item.data_json}</div>`;
            }

            div.innerHTML = `
                <div class="search-item-header">
                    <span class="search-item-code">${item.tracking_code}</span>
                    <span class="search-item-meta">Xuất ngày ${time} bởi ${item.username || 'nhân viên'}</span>
                </div>
                ${detailsGrid}
            `;
            resultsContainer.appendChild(div);
        });
    } catch (err) {
        resultsContainer.innerHTML = `<div class="text-red">Lỗi: ${err.message}</div>`;
    }
});

document.getElementById("btn-refresh-history").addEventListener("click", loadHistoryList);
document.getElementById("btn-close-detail-modal").addEventListener("click", () => {
    document.getElementById("history-detail-modal").style.display = "none";
});
document.getElementById("btn-close-detail-modal-action").addEventListener("click", () => {
    document.getElementById("history-detail-modal").style.display = "none";
});
document.getElementById("btn-download-detail-file").addEventListener("click", () => {
    if (detailHistoryId) downloadHistoryFile(detailHistoryId);
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
        loadLoginCaptcha();
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
        loginContainer.style.display = "flex";
        mainAppContainer.style.display = "none";
        loadLoginCaptcha();
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

    await updateStatus();
    await loadFilters();
    await loadSummary();
    await loadMatrixConfig();
    loadColumnConfig();
    renderColumnConfigUI();
    renderDetailedHeader();
    await loadDetailed();

    // Initialize Matrix Quick Config Popover Modal
    initMatrixTotalQuickConfig();
}

function initMatrixTotalQuickConfig() {
    const headerTotal = document.getElementById("matrix-header-total");
    const matrixTotalModal = document.getElementById("matrix-total-modal");
    const btnCloseMatrixTotalModal = document.getElementById("btn-close-matrix-total-modal");
    const btnCancelMatrixTotalModal = document.getElementById("btn-cancel-matrix-total-modal");
    const btnSaveMatrixTotalModal = document.getElementById("btn-save-matrix-total-modal");

    const modalCfgCol3 = document.getElementById("modal-cfg-col-3");
    const modalCfgCol4 = document.getElementById("modal-cfg-col-4");
    const modalCfgCol5 = document.getElementById("modal-cfg-col-5");
    const modalCfgCol7 = document.getElementById("modal-cfg-col-7");
    const modalCfgCol14 = document.getElementById("modal-cfg-col-14");

    if (!headerTotal || !matrixTotalModal) return;

    // Open Modal
    headerTotal.addEventListener("click", () => {
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
        if (modalCfgCol3) modalCfgCol3.checked = savedCols.includes("≥3 ngày");
        if (modalCfgCol4) modalCfgCol4.checked = savedCols.includes("≥4 ngày");
        if (modalCfgCol5) modalCfgCol5.checked = savedCols.includes("≥5 ngày");
        if (modalCfgCol7) modalCfgCol7.checked = savedCols.includes("≥7 ngày");
        if (modalCfgCol14) modalCfgCol14.checked = savedCols.includes("≥14 ngày");

        matrixTotalModal.style.display = "flex";
    });

    const closeModal = () => {
        matrixTotalModal.style.display = "none";
    };

    if (btnCloseMatrixTotalModal) btnCloseMatrixTotalModal.addEventListener("click", closeModal);
    if (btnCancelMatrixTotalModal) btnCancelMatrixTotalModal.addEventListener("click", closeModal);

    // Save Quick Config
    if (btnSaveMatrixTotalModal) {
        btnSaveMatrixTotalModal.addEventListener("click", () => {
            const selectedCols = [];
            if (modalCfgCol3 && modalCfgCol3.checked) selectedCols.push("≥3 ngày");
            if (modalCfgCol4 && modalCfgCol4.checked) selectedCols.push("≥4 ngày");
            if (modalCfgCol5 && modalCfgCol5.checked) selectedCols.push("≥5 ngày");
            if (modalCfgCol7 && modalCfgCol7.checked) selectedCols.push("≥7 ngày");
            if (modalCfgCol14 && modalCfgCol14.checked) selectedCols.push("≥14 ngày");

            if (selectedCols.length === 0) {
                showToast("Phải chọn ít nhất một cột để tính tổng tồn.", "warning");
                return;
            }

            localStorage.setItem("matrix_total_columns", JSON.stringify(selectedCols));

            // Sync with system settings checkboxes if visible
            const cfgCol3 = document.getElementById("cfg-col-3");
            const cfgCol4 = document.getElementById("cfg-col-4");
            const cfgCol5 = document.getElementById("cfg-col-5");
            const cfgCol7 = document.getElementById("cfg-col-7");
            const cfgCol14 = document.getElementById("cfg-col-14");
            if (cfgCol3) cfgCol3.checked = selectedCols.includes("≥3 ngày");
            if (cfgCol4) cfgCol4.checked = selectedCols.includes("≥4 ngày");
            if (cfgCol5) cfgCol5.checked = selectedCols.includes("≥5 ngày");
            if (cfgCol7) cfgCol7.checked = selectedCols.includes("≥7 ngày");
            if (cfgCol14) cfgCol14.checked = selectedCols.includes("≥14 ngày");

            closeModal();

            // Re-render Pivot Matrix instantly
            if (cachedSummaryData) {
                renderSummary(cachedSummaryData);
            }

            showToast("Cập nhật cột tính tổng tồn thành công.", "success");
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
    const panelUsers = document.getElementById("panel-settings-users");
    const panelDinhvi = document.getElementById("panel-settings-dinhvi");
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
    const cfgCol3 = document.getElementById("cfg-col-3");
    const cfgCol4 = document.getElementById("cfg-col-4");
    const cfgCol5 = document.getElementById("cfg-col-5");
    const cfgCol7 = document.getElementById("cfg-col-7");
    const cfgCol14 = document.getElementById("cfg-col-14");
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
    if (cfgCol3) cfgCol3.checked = savedCols.includes("≥3 ngày");
    if (cfgCol4) cfgCol4.checked = savedCols.includes("≥4 ngày");
    if (cfgCol5) cfgCol5.checked = savedCols.includes("≥5 ngày");
    if (cfgCol7) cfgCol7.checked = savedCols.includes("≥7 ngày");
    if (cfgCol14) cfgCol14.checked = savedCols.includes("≥14 ngày");

    // Reset view to tab-users active by default
    tabBtnUsers.classList.add("active");
    tabBtnDinhvi.classList.remove("active");
    tabBtnUsers.style.color = "var(--accent-emerald)";
    tabBtnUsers.style.borderBottom = "3px solid var(--accent-emerald)";
    tabBtnDinhvi.style.color = "var(--text-muted)";
    tabBtnDinhvi.style.borderBottom = "none";
    if (panelUsers) panelUsers.style.display = "block";
    if (panelDinhvi) panelDinhvi.style.display = "none";
    if (usersHeaderActions) usersHeaderActions.style.display = "block";

    tabBtnUsers.addEventListener("click", () => {
        // Toggle tabs
        tabBtnUsers.classList.add("active");
        tabBtnDinhvi.classList.remove("active");
        tabBtnUsers.style.color = "var(--accent-emerald)";
        tabBtnUsers.style.borderBottom = "3px solid var(--accent-emerald)";
        tabBtnDinhvi.style.color = "var(--text-muted)";
        tabBtnDinhvi.style.borderBottom = "none";

        // Toggle panels
        if (panelUsers) panelUsers.style.display = "block";
        if (panelDinhvi) panelDinhvi.style.display = "none";
        if (usersHeaderActions) usersHeaderActions.style.display = "block";
    });

    tabBtnDinhvi.addEventListener("click", () => {
        // Toggle tabs
        tabBtnDinhvi.classList.add("active");
        tabBtnUsers.classList.remove("active");
        tabBtnDinhvi.style.color = "var(--accent-emerald)";
        tabBtnDinhvi.style.borderBottom = "3px solid var(--accent-emerald)";
        tabBtnUsers.style.color = "var(--text-muted)";
        tabBtnUsers.style.borderBottom = "none";

        // Toggle panels
        if (panelUsers) panelUsers.style.display = "none";
        if (panelDinhvi) panelDinhvi.style.display = "block";
        if (usersHeaderActions) usersHeaderActions.style.display = "none";
    });

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
            if (cfgCol3 && cfgCol3.checked) selectedCols.push("≥3 ngày");
            if (cfgCol4 && cfgCol4.checked) selectedCols.push("≥4 ngày");
            if (cfgCol5 && cfgCol5.checked) selectedCols.push("≥5 ngày");
            if (cfgCol7 && cfgCol7.checked) selectedCols.push("≥7 ngày");
            if (cfgCol14 && cfgCol14.checked) selectedCols.push("≥14 ngày");

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
    const btnGotoExport = document.getElementById("btn-goto-export-from-error");
    if (btnRetry) btnRetry.addEventListener("click", retryPbiConnection);
    if (btnGotoExport) btnGotoExport.addEventListener("click", () => switchView("export"));
}

document.addEventListener("DOMContentLoaded", () => {
    initDataNoteModal();
    initUrlErrorOverlay();
    init();
});
