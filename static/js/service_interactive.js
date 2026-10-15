let currentLevel = 3;
let currentExp = 45;
let currentStars = 85;
let cachedMessages = [];
let cachedSupplyData = [];
let cachedDisasterData = [];
let selectedImageBase64 = "";
let tickerInterval = null;
let selectedDisasterTypes = [];

// 資源主類型、子分類與具體品項規格字典
const resourceDictionary = {
  "物": {
    "防汛阻水類": [
      { name: "高密度防汛沙包", unit: "包", defaultQty: 10 },
      { name: "鋁合金快速擋板", unit: "組", defaultQty: 1 },
      { name: "高分子膨脹吸水袋", unit: "個", defaultQty: 5 }
    ],
    "應急民生類": [
      { name: "常溫防災乾糧箱", unit: "箱", defaultQty: 1 },
      { name: "箱裝應急純淨水", unit: "箱", defaultQty: 2 },
      { name: "防汛醫療急救包", unit: "組", defaultQty: 1 }
    ],
    "照明通訊類": [
      { name: "太陽能手搖收音機", unit: "台", defaultQty: 1 },
      { name: "高流明防汛頭燈", unit: "個", defaultQty: 2 },
      { name: "強光防水防汛手電筒", unit: "個", defaultQty: 2 }
    ]
  },
  "機": {
    "抽水排水設備": [
      { name: "移動式沉水抽水泵浦", unit: "台", defaultQty: 1 },
      { name: "大馬力柴油抽水機", unit: "台", defaultQty: 1 },
      { name: "高壓排水平面水管(20米)", unit: "捆", defaultQty: 2 }
    ],
    "緊急動力設備": [
      { name: "小型汽油發電機", unit: "台", defaultQty: 1 },
      { name: "四衝程柴油發電機組", unit: "台", defaultQty: 1 },
      { name: "大容量儲能行動電源", unit: "台", defaultQty: 1 }
    ],
    "清淤除障機具": [
      { name: "長柄液壓鏈鋸", unit: "台", defaultQty: 1 },
      { name: "高壓泥沙沖洗機", unit: "台", defaultQty: 1 },
      { name: "防汛橡皮艇與推進槳", unit: "組", defaultQty: 1 }
    ]
  },
  "人": {
    "醫療急救組": [
      { name: "EMT 初級救護技術員", unit: "名", defaultQty: 1 },
      { name: "社群傷患包紮與檢傷志工", unit: "名", defaultQty: 2 },
      { name: "災區防疫消毒防護員", unit: "名", defaultQty: 1 }
    ],
    "水電維修組": [
      { name: "水電搶修配電技師", unit: "名", defaultQty: 1 },
      { name: "地下室浸水漏電檢測員", unit: "名", defaultQty: 1 },
      { name: "線路短路緊急切斷技工", unit: "名", defaultQty: 1 }
    ],
    "機具操作組": [
      { name: "移動式抽水泵浦操作員", unit: "名", defaultQty: 1 },
      { name: "發電機與重機械操作手", unit: "名", defaultQty: 1 },
      { name: "清淤高壓沖洗機技工", unit: "名", defaultQty: 1 }
    ],
    "車輛駕駛組": [
      { name: "高底盤四驅車防汛駕駛", unit: "名", defaultQty: 1 },
      { name: "重物物資搬運車輛司機", unit: "名", defaultQty: 1 },
      { name: "撤離專車導引與駕駛員", unit: "名", defaultQty: 2 }
    ]
  }
};

let pendingRequestItems = [];

// 調整為優雅、柔和的標籤樣式：統一深灰文字搭配淡雅背景與同色細邊框
const DISASTER_TAG_STYLES = {
  "路樹災情": "background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;",
  "廣告招牌災情": "background-color: #fffbeb; color: #92400e; border: 1px solid #fde68a;",
  "道路災情": "background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;",
  "鐵路、高鐵捷運災情": "background-color: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;",
  "積淹水災情": "background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;",
  "建物毀損": "background-color: #fef2f2; color: #991b1b; border: 1px solid #fecaca;",
  "其他災情": "background-color: #f8fafc; color: #475569; border: 1px solid #e2e8f0;"
};

document.addEventListener("DOMContentLoaded", () => {
  updateSubCatOptions();
  loadSupplyHistory();
  loadDisasterAccordion();
  loadVolunteerTasks();
  loadBoardMessages();
  updateVolunteerUI();

  // 歷史紀錄篩選事件
  document.getElementById("supply-search-keyword")?.addEventListener("input", filterAndRenderSupplyHistory);
  document.getElementById("supply-filter-type")?.addEventListener("change", filterAndRenderSupplyHistory);
  document.getElementById("supply-sort-time")?.addEventListener("change", filterAndRenderSupplyHistory);

  // 災情追蹤篩選事件
  document.getElementById("disaster-search-keyword")?.addEventListener("input", filterAndRenderDisasterAccordion);
  document.getElementById("disaster-filter-status")?.addEventListener("change", filterAndRenderDisasterAccordion);
  document.getElementById("disaster-sort-time")?.addEventListener("change", filterAndRenderDisasterAccordion);

  // 照片預覽與壓縮
  const fileInput = document.getElementById("report-img-file");
  if (fileInput) {
    fileInput.addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          
          selectedImageBase64 = canvas.toDataURL("image/jpeg", 0.75);
          document.getElementById("img-preview").src = selectedImageBase64;
          document.getElementById("img-preview-box").classList.remove("d-none");
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 留言板
  const btnSubmitMsg = document.getElementById("btn-submit-message");
  if (btnSubmitMsg) {
    btnSubmitMsg.addEventListener("click", async () => {
      const catEl = document.getElementById("msg-input-cat");
      const textEl = document.getElementById("msg-input-text");
      const content = textEl ? textEl.value.trim() : "";
      if (!content) return;

      const tags = (content.match(/#[^\s#]+/g) || []).join(" ");
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: catEl.value, content: content, tags: tags })
        });
        const data = await res.json();
        if (data.status === "success") {
          textEl.value = "";
          loadBoardMessages();
        }
      } catch (e) {}
    });
  }

  // 智慧防汛問答發送邏輯
  const btnSendQa = document.getElementById("btn-send-qa");
  const qaInput = document.getElementById("qa-input");
  const chatBox = document.getElementById("chat-box");
  if (btnSendQa && qaInput && chatBox) {
    const sendQa = async () => {
      const q = qaInput.value.trim();
      if (!q) return;

      chatBox.innerHTML += `<div class="mb-2 text-end"><span class="bg-primary text-white p-2 rounded d-inline-block">${q}</span></div>`;
      qaInput.value = "";
      chatBox.scrollTop = chatBox.scrollHeight;

      const thinkingId = "thinking_" + Date.now();
      chatBox.innerHTML += `<div class="mb-2 text-muted small" id="${thinkingId}"><strong class="text-primary">🤖 防汛助手：</strong>正在分析全區水情與防汛資料庫...</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        const res = await fetch("/api/qa-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q })
        });
        const data = await res.json();
        document.getElementById(thinkingId)?.remove();

        const engineBadge = data.engine === "gemini_ai" ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-1" style="font-size:0.7rem;">Gemini AI 即時研判</span>` : "";
        chatBox.innerHTML += `<div class="mb-2"><strong class="text-primary">🤖 防汛助手${engineBadge}：</strong>${data.answer}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      } catch (e) {
        document.getElementById(thinkingId)?.remove();
        chatBox.innerHTML += `<div class="mb-2"><strong class="text-primary">🤖 防汛助手：</strong>如遇暴雨緊急狀況，請優先前往二樓以上處所垂直避難，或前往預警避難專區啟動安全路線導航。</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    };
    btnSendQa.addEventListener("click", sendQa);
    qaInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendQa(); });
  }
});

function updateSubCatOptions() {
  const mainCat = document.getElementById("select-main-cat")?.value || "物";
  const subCatSelect = document.getElementById("select-sub-cat");
  if (!subCatSelect) return;
  subCatSelect.innerHTML = "";
  const subCats = Object.keys(resourceDictionary[mainCat] || {});
  subCats.forEach(s => {
    subCatSelect.innerHTML += `<option value="${s}">${s}</option>`;
  });
  updateItemOptions();
}

function updateItemOptions() {
  const mainCat = document.getElementById("select-main-cat")?.value || "物";
  const subCat = document.getElementById("select-sub-cat")?.value;
  const itemDetailSelect = document.getElementById("select-item-detail");
  if (!itemDetailSelect || !subCat) return;
  itemDetailSelect.innerHTML = "";

  const items = resourceDictionary[mainCat]?.[subCat] || [];
  items.forEach((item, idx) => {
    itemDetailSelect.innerHTML += `<option value="${idx}">${item.name} (${item.defaultQty} ${item.unit})</option>`;
  });
}

function addItemToRequestList() {
  const mainCat = document.getElementById("select-main-cat").value;
  const subCat = document.getElementById("select-sub-cat").value;
  const itemIdx = parseInt(document.getElementById("select-item-detail").value);
  const targetItem = resourceDictionary[mainCat][subCat][itemIdx];

  const existIdx = pendingRequestItems.findIndex(i => i.item_name === targetItem.name);
  if (existIdx >= 0) {
    pendingRequestItems[existIdx].quantity += targetItem.defaultQty;
  } else {
    pendingRequestItems.push({
      resource_type: mainCat,
      sub_category: subCat,
      item_name: targetItem.name,
      quantity: targetItem.defaultQty,
      unit: targetItem.unit
    });
  }
  renderRequestTable();
}

function removeItemFromList(idx) {
  pendingRequestItems.splice(idx, 1);
  renderRequestTable();
}

function renderRequestTable() {
  const tbody = document.getElementById("request-list-tbody");
  if (!tbody) return;
  const countEl = document.getElementById("selected-items-count");
  if (countEl) countEl.innerText = `已選 ${pendingRequestItems.length} 項`;
  
  if (pendingRequestItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted small py-3">尚未加入品項，請從上方選單挑選後點擊「加入清單」</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  pendingRequestItems.forEach((it, idx) => {
    let badgeClass = it.resource_type === "人" ? "bg-success" : (it.resource_type === "機" ? "bg-warning text-dark" : "bg-primary");
    tbody.innerHTML += `
      <tr>
        <td style="white-space: nowrap;"><span class="badge ${badgeClass}">${it.resource_type}</span></td>
        <td><strong>${it.item_name}</strong> <small class="text-muted">(${it.sub_category})</small></td>
        <td style="white-space: nowrap;">
          <input type="number" class="form-control form-control-sm text-center" style="width: 80px;" value="${it.quantity}" min="1" onchange="pendingRequestItems[${idx}].quantity = parseInt(this.value);">
        </td>
        <td style="white-space: nowrap;">${it.unit}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" onclick="removeItemFromList(${idx})">移除</button>
        </td>
      </tr>
    `;
  });
}

function promptConfirmSupplyModal() {
  if (pendingRequestItems.length === 0) return;

  const name = document.getElementById("supply-name")?.value || "王小明";
  const phone = document.getElementById("supply-phone")?.value.trim() || "";
  const address = document.getElementById("supply-address")?.value.trim() || "";

  document.getElementById("cmodal-name").innerText = name;
  document.getElementById("cmodal-phone").innerText = phone;
  document.getElementById("cmodal-address").innerText = address;

  const tbody = document.getElementById("cmodal-items-table-body");
  tbody.innerHTML = "";
  pendingRequestItems.forEach((it, idx) => {
    tbody.innerHTML += `
      <tr>
        <td style="text-align: center; white-space: nowrap;">${idx + 1}</td>
        <td><strong>${it.item_name}</strong></td>
        <td style="white-space: nowrap;"><span class="badge bg-light text-dark border">${it.sub_category || it.resource_type}</span></td>
        <td style="text-align: center; white-space: nowrap;" class="fw-bold text-primary">${it.quantity}</td>
        <td style="text-align: center; white-space: nowrap;">${it.unit || '個'}</td>
      </tr>
    `;
  });

  new bootstrap.Modal(document.getElementById("confirmSupplySubmitModal")).show();
}

function executeRealSupplySubmit() {
  const phone = document.getElementById("supply-phone")?.value.trim() || "";
  const address = document.getElementById("supply-address")?.value.trim() || "";
  const district = document.getElementById("supply-district")?.value.trim() || "中山區";

  const modalEl = document.getElementById("confirmSupplySubmitModal");
  if (modalEl) {
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const payload = {
            contact_phone: phone,
            detail_address: address,
            district: district,
            items: pendingRequestItems,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };

          const res = await fetch("/api/supply-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.status === "success") {
            pendingRequestItems = [];
            renderRequestTable();
            if (document.getElementById("supply-address")) {
              document.getElementById("supply-address").value = "";
            }
            loadSupplyHistory();
          }
        } catch (e) {}
      },
      async () => {
        try {
          const payload = {
            contact_phone: phone,
            detail_address: address,
            district: district,
            items: pendingRequestItems,
            latitude: 25.0685,
            longitude: 121.5325
          };
          const res = await fetch("/api/supply-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.status === "success") {
            pendingRequestItems = [];
            renderRequestTable();
            if (document.getElementById("supply-address")) {
              document.getElementById("supply-address").value = "";
            }
            loadSupplyHistory();
          }
        } catch (e) {}
      }
    );
  }
}

// 多選災害種類標籤
function addDisasterTypeTag(typeVal) {
  if (!typeVal) return;
  if (!selectedDisasterTypes.includes(typeVal)) {
    selectedDisasterTypes.push(typeVal);
    renderDisasterTypeTags();
    syncDisasterDesc();
  }
  const typeSelect = document.getElementById("report-disaster-type");
  if (typeSelect) typeSelect.selectedIndex = 0;
}

function removeDisasterTypeTag(typeVal) {
  selectedDisasterTypes = selectedDisasterTypes.filter(t => t !== typeVal);
  renderDisasterTypeTags();
  syncDisasterDesc();
}

function renderDisasterTypeTags() {
  const container = document.getElementById("selected-types-container");
  if (!container) return;

  if (selectedDisasterTypes.length === 0) {
    container.innerHTML = `<small class="text-muted" id="types-placeholder-text">尚未選取種類，可從上方下拉選單點選加入災害種類</small>`;
    return;
  }

  container.innerHTML = selectedDisasterTypes.map(t => `
    <span class="badge d-inline-flex align-items-center gap-1 py-1 px-2 fw-semibold" style="font-size:0.8rem; background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;">
      ${t}
      <i class="bi bi-x-circle-fill opacity-75" onclick="removeDisasterTypeTag('${t}')" style="cursor: pointer;"></i>
    </span>
  `).join("");
}

// 同步災情描述框（【種類】後面不加冒號，直接留空格）
function syncDisasterDesc() {
  const descArea = document.getElementById("report-desc");
  if (!descArea) return;

  const currentLines = descArea.value.split("\n");
  const descMap = {};

  currentLines.forEach(line => {
    const trimmed = line.trim();
    const match = trimmed.match(/^【(.*?)】\s*[:：\s]*(.*)$/);
    if (match) {
      descMap[match[1]] = match[2].trim();
    } else if (trimmed && !trimmed.startsWith("【")) {
      descMap["__extra__"] = (descMap["__extra__"] ? descMap["__extra__"] + " " : "") + trimmed;
    }
  });

  if (selectedDisasterTypes.length === 0) {
    descArea.value = descMap["__extra__"] || "";
    return;
  }

  const newLines = selectedDisasterTypes.map(t => {
    const userText = descMap[t] ? ` ${descMap[t]}` : " ";
    return `【${t}】${userText}`;
  });

  if (descMap["__extra__"]) {
    newLines.push(descMap["__extra__"]);
  }

  descArea.value = newLines.join("\n");
}

// 彈出確認災情通報 Modal（字級精巧、統一柔和淡色框線與深色文字）
function promptConfirmDisasterModal() {
  const district = document.getElementById("report-district")?.value || "中山區";
  const loc = document.getElementById("report-loc")?.value.trim() || "";
  const rawDesc = document.getElementById("report-desc")?.value.trim() || "";

  document.getElementById("cdmodal-district").innerText = district;
  document.getElementById("cdmodal-loc").innerText = loc;

  // 1. 災害種類：改為淡雅柔和的標籤樣式，中間以「、」區隔
  const typeContainer = document.getElementById("cdmodal-type");
  if (typeContainer) {
    if (selectedDisasterTypes.length === 0) {
      typeContainer.innerHTML = `<span class="badge py-1 px-2" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-size:0.78rem;">一般通報</span>`;
    } else {
      typeContainer.innerHTML = selectedDisasterTypes.map((t, idx) => {
        const badgeHtml = `<span class="badge py-1 px-2 fw-semibold" style="background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 0.78rem;">${t}</span>`;
        return idx < selectedDisasterTypes.length - 1 ? `${badgeHtml}、` : badgeHtml;
      }).join("");
    }
  }

  // 2. 災情描述摘要：統一深色字體、字級恰當、淡色優雅標籤，去除突兀色塊
  const descContainer = document.getElementById("cdmodal-desc");
  if (descContainer) {
    let styledDesc = rawDesc;
    Object.keys(DISASTER_TAG_STYLES).forEach(typeName => {
      const inlineStyle = DISASTER_TAG_STYLES[typeName];
      const regex = new RegExp(`【${typeName}】`, "g");
      styledDesc = styledDesc.replace(
        regex,
        `<span class="badge me-1 fw-bold rounded-pill" style="${inlineStyle} font-size: 0.76rem; padding: 0.2rem 0.55rem; vertical-align: middle;">【${typeName}】</span>`
      );
    });
    descContainer.innerHTML = styledDesc || "無詳細描述";
  }

  document.getElementById("cdmodal-has-img").innerText = selectedImageBase64 ? "已檢附現場照片" : "無相片";

  new bootstrap.Modal(document.getElementById("confirmDisasterSubmitModal")).show();
}

async function executeRealDisasterSubmit() {
  const distEl = document.getElementById("report-district");
  const locEl = document.getElementById("report-loc");
  const descEl = document.getElementById("report-desc");
  const disasterTypeStr = selectedDisasterTypes.length > 0 ? selectedDisasterTypes.join("、") : "一般通報";

  const modalEl = document.getElementById("confirmDisasterSubmitModal");
  if (modalEl) {
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
  }

  try {
    const res = await fetch("/api/disaster-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        district: distEl ? distEl.value : "中山區",
        location: locEl ? locEl.value.trim() : "",
        description: descEl ? descEl.value.trim() : "",
        report_type: disasterTypeStr,
        image_url: selectedImageBase64
      })
    });
    const data = await res.json();
    if (data.status === "success") {
      if (locEl) locEl.value = "";
      if (descEl) descEl.value = "";
      selectedDisasterTypes = [];
      renderDisasterTypeTags();
      removeSelectedImage();
      loadDisasterAccordion();
    }
  } catch (e) {}
}

function removeSelectedImage() {
  selectedImageBase64 = "";
  const fileInput = document.getElementById("report-img-file");
  if (fileInput) fileInput.value = "";
  const box = document.getElementById("img-preview-box");
  if (box) box.classList.add("d-none");
}

// 歷史紀錄載入與篩選
async function loadSupplyHistory() {
  const tbody = document.getElementById("supply-history-tbody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/supply-request");
    const json = await res.json();
    if (json.status === "success" && json.data) {
      cachedSupplyData = json.data;
      filterAndRenderSupplyHistory();
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">讀取申請紀錄失敗</td></tr>`;
  }
}

function filterAndRenderSupplyHistory() {
  const tbody = document.getElementById("supply-history-tbody");
  if (!tbody) return;

  const kw = (document.getElementById("supply-search-keyword")?.value || "").trim().toLowerCase();
  const filterType = document.getElementById("supply-filter-type")?.value || "ALL";
  const sortMode = document.getElementById("supply-sort-time")?.value || "desc";

  let list = [...cachedSupplyData];

  if (filterType !== "ALL") {
    list = list.filter(r => (r.resource_type || "").includes(filterType));
  }

  if (kw) {
    list = list.filter(r => 
      (r.order_no || "").toLowerCase().includes(kw) ||
      (r.item_name || "").toLowerCase().includes(kw) ||
      (r.detail_address || "").toLowerCase().includes(kw)
    );
  }

  list.sort((a, b) => {
    const tA = new Date(a.created_at).getTime() || 0;
    const tB = new Date(b.created_at).getTime() || 0;
    return sortMode === "asc" ? (tA - tB) : (tB - tA);
  });

  tbody.innerHTML = "";
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">無符合條件之申請紀錄。</td></tr>`;
    return;
  }

  list.forEach(row => {
    const rTypeStr = String(row.resource_type || "物");
    const typeTokens = rTypeStr.split(/[,、]/);
    
    let badgesHtml = "";
    typeTokens.forEach(token => {
      const t = token.trim();
      if (t.includes("人") || t.includes("HUM")) {
        badgesHtml += `<span class="badge bg-success me-1 px-2 py-1">人</span>`;
      } else if (t.includes("機") || t.includes("EQP")) {
        badgesHtml += `<span class="badge bg-warning text-dark me-1 px-2 py-1">機</span>`;
      } else {
        badgesHtml += `<span class="badge bg-primary me-1 px-2 py-1">物</span>`;
      }
    });

    const cleanItemName = String(row.item_name || "").replace(/[()（）]/g, " ");
    let shortItemName = cleanItemName;
    if (cleanItemName.length > 22) {
      shortItemName = cleanItemName.substring(0, 22) + "...";
    }

    let displayStatus = row.status || '收到申請';
    if (displayStatus === '揀貨備料' || displayStatus === '核定備料') {
      displayStatus = '審核核發';
    }

    tbody.innerHTML += `
      <tr>
        <td style="white-space: nowrap;"><span class="badge bg-light text-primary border font-monospace">${row.order_no}</span></td>
        <td style="white-space: nowrap;" class="small font-monospace text-secondary">${row.created_at || '剛剛'}</td>
        <td style="white-space: nowrap; text-align: center;">${badgesHtml}</td>
        <td style="max-width: 250px;" class="text-truncate" title="${cleanItemName}">
          <strong>${shortItemName}</strong>
        </td>
        <td class="small text-secondary text-truncate" style="max-width: 140px;" title="${row.detail_address || '未提供地址'}">
          ${row.detail_address || "未提供地址"}
        </td>
        <td style="white-space: nowrap; text-align: center;">
          <span class="badge bg-warning text-dark px-2 py-1">${displayStatus}</span>
        </td>
        <td style="white-space: nowrap; text-align: center;">
          <button class="btn btn-sm btn-outline-primary px-3" onclick="openOrderDetailModal('${row.order_no}')">
            查看
          </button>
        </td>
      </tr>
    `;
  });
}

function openOrderDetailModal(orderNo) {
  const record = cachedSupplyData.find(r => r.order_no === orderNo);
  if (!record) return;

  let rawStatus = record.status || "收到申請";
  let displayStatus = rawStatus;
  if (displayStatus === "揀貨備料" || displayStatus === "核定備料") {
    displayStatus = "審核核發";
  }

  document.getElementById("modal-order-id").innerText = record.order_no;
  document.getElementById("modal-order-status-badge").innerText = displayStatus;
  document.getElementById("modal-order-contact").innerText = `${record.user_name || '王小明'} (${record.contact_phone || '0912-345-678'})`;
  document.getElementById("modal-order-address").innerText = record.detail_address || "未提供詳細地址";
  document.getElementById("modal-order-community").innerText = record.target_community || "大同區防汛備災中心";
  document.getElementById("modal-order-created-at").innerText = record.created_at || "2026-10-01 09:11";

  let stepLevel = 1;
  if (rawStatus === "揀貨備料" || rawStatus === "核定備料" || rawStatus === "審核核發") stepLevel = 2;
  else if (rawStatus === "派送中") stepLevel = 3;
  else if (rawStatus === "已送達") stepLevel = 4;

  const line = document.getElementById("modal-progress-line");
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`mstep-${i}`);
    if (s) {
      s.className = "step-compact-item";
      if (i < stepLevel) s.className = "step-compact-item completed";
      else if (i === stepLevel) s.className = "step-compact-item active";
    }
  }
  line.style.width = `${Math.max(0, (stepLevel - 1) * 33.3)}%`;

  const baseTime = record.created_at ? record.created_at.split(" ")[1] : "09:15";
  document.getElementById("mtime-1").innerHTML = `${baseTime}<br>(已受理)`;
  document.getElementById("mtime-2").innerHTML = stepLevel >= 2 ? `10:00<br>(已核發)` : `預估 10:00`;
  document.getElementById("mtime-3").innerHTML = stepLevel >= 3 ? `10:30<br>(派送中)` : `預估 10:30`;
  document.getElementById("mtime-4").innerHTML = stepLevel >= 4 ? `11:00<br>(已送達)` : `預估 11:00`;

  const tbody = document.getElementById("modal-items-table-body");
  tbody.innerHTML = "";
  
  let items = record.items_json;
  if (!items || items.length === 0) {
    const rawTokens = (record.item_name || "").split("、");
    items = rawTokens.map(tok => ({
      item_name: tok,
      resource_type: record.resource_type || "物",
      sub_category: "常態防汛",
      quantity: 1,
      unit: "單位"
    }));
  }

  items.forEach((it, idx) => {
    tbody.innerHTML += `
      <tr>
        <td style="text-align: center; white-space: nowrap;">${idx + 1}</td>
        <td><strong>${it.item_name}</strong></td>
        <td style="white-space: nowrap;"><span class="badge bg-light text-dark border">${it.sub_category || it.resource_type}</span></td>
        <td style="text-align: center; white-space: nowrap;" class="fw-bold text-primary">${it.quantity}</td>
        <td style="text-align: center; white-space: nowrap;">${it.unit || '個'}</td>
      </tr>
    `;
  });

  new bootstrap.Modal(document.getElementById("orderProgressModal")).show();
}

// 載入災情通報進度與跑馬燈
async function loadDisasterAccordion() {
  const container = document.getElementById("disasterAccordion");
  if (!container) return;

  try {
    const res = await fetch("/api/disaster-report");
    const json = await res.json();
    if (json.status === "success" && json.data) {
      cachedDisasterData = json.data;
      initDisasterLiveTicker(cachedDisasterData);
      filterAndRenderDisasterAccordion();
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center py-3 text-muted">目前暫無案件進度。</div>`;
  }
}

function initDisasterLiveTicker(reports) {
  const summaryEl = document.getElementById("ticker-summary-text");
  const trackEl = document.getElementById("tickerTrack");
  if (!summaryEl || !trackEl) return;

  if (reports.length === 0) {
    summaryEl.innerHTML = `今日已累計 <span class="text-danger fw-bold fs-5">0</span> 筆災情通報：`;
    trackEl.innerHTML = `<div class="ticker-item text-muted small py-2">全區水情監測中，暫無通報案件。</div>`;
    return;
  }

  summaryEl.innerHTML = `今日已累計 <span class="text-danger fw-bold fs-5">${reports.length}</span> 筆災情通報：`;

  trackEl.innerHTML = reports.map(r => `
    <div class="ticker-item py-2 text-truncate" style="height: 44px; line-height: 28px;">
      <span class="badge bg-danger me-2">${r.district}</span>
      <strong class="text-dark me-2">${r.location_description || '市區路段'}</strong>
      <span class="text-secondary">${r.description}</span>
      <small class="text-muted ms-2 font-monospace">(${r.reported_at_str})</small>
    </div>
  `).join("");

  if (tickerInterval) clearInterval(tickerInterval);
  let currentIndex = 0;
  const itemHeight = 44;

  if (reports.length > 1) {
    tickerInterval = setInterval(() => {
      currentIndex++;
      if (currentIndex >= reports.length) {
        currentIndex = 0;
      }
      trackEl.style.transform = `translateY(-${currentIndex * itemHeight}px)`;
    }, 3200);
  }
}

function filterAndRenderDisasterAccordion() {
  const container = document.getElementById("disasterAccordion");
  if (!container) return;

  const kw = (document.getElementById("disaster-search-keyword")?.value || "").trim().toLowerCase();
  const filterStatus = document.getElementById("disaster-filter-status")?.value || "ALL";
  const sortMode = document.getElementById("disaster-sort-time")?.value || "desc";

  let list = [...cachedDisasterData];

  if (filterStatus !== "ALL") {
    list = list.filter(r => (r.status || "").includes(filterStatus));
  }

  if (kw) {
    list = list.filter(r => 
      (r.report_no || "").toLowerCase().includes(kw) ||
      (r.location_description || "").toLowerCase().includes(kw) ||
      (r.district || "").toLowerCase().includes(kw) ||
      (r.description || "").toLowerCase().includes(kw)
    );
  }

  list.sort((a, b) => {
    const tA = new Date(a.reported_at_str).getTime() || 0;
    const tB = new Date(b.reported_at_str).getTime() || 0;
    return sortMode === "asc" ? (tA - tB) : (tB - tA);
  });

  container.innerHTML = "";
  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-muted">無符合條件之通報案件。</div>`;
    return;
  }

  list.forEach((r, idx) => {
    const collapseId = "collapseDisaster" + idx;
    let badgeClass = "bg-primary";
    if (r.status === "派員現場" || r.status === "處理中") badgeClass = "bg-warning text-dark";
    else if (r.status === "已結案") badgeClass = "bg-success";

    const imgBlock = r.image_url 
      ? `
        <div class="col-md-5 text-center p-2 border rounded bg-white">
          <span class="d-block small text-muted mb-1"><i class="bi bi-camera me-1"></i>現場照片</span>
          <img src="${r.image_url}" class="img-fluid rounded border shadow-sm" style="max-height: 140px; cursor: pointer; object-fit: cover;" onclick="openDisasterDetailModal('${r.report_no}')">
        </div>
      ` 
      : `
        <div class="col-md-5 d-flex align-items-center justify-content-center p-3 border rounded bg-white text-muted small">
          <i class="bi bi-image text-secondary me-2"></i>無檢附現場照片
        </div>
      `;

    let confirmActionHtml = "";
    if (r.status === "派員現場") {
      confirmActionHtml = `
        <div class="alert alert-info py-2 px-3 mt-3 d-flex justify-content-between align-items-center">
          <span class="small"><i class="bi bi-person-check-fill text-primary me-1"></i>志工已派駐現場搶修中！現場狀況若已排除，請予以驗收：</span>
          <button class="btn btn-success btn-sm fw-bold px-3" onclick="confirmDisasterTaskResolved('${r.report_no}')">
            <i class="bi bi-award me-1"></i>確認任務完成
          </button>
        </div>
      `;
    }

    container.innerHTML += `
      <div class="accordion-item mb-2 border rounded shadow-sm">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed py-3" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
            <div class="d-flex justify-content-between align-items-center w-100 me-3">
              <div>
                <span class="badge ${badgeClass} me-2" style="white-space: nowrap;">${r.status || '通報受理'}</span>
                <strong class="text-dark">案件編號 #${r.report_no} (${r.district} - ${r.location_description || '市區'})</strong>
              </div>
              <div class="d-flex align-items-center gap-2">
                <small class="text-muted font-monospace" style="white-space: nowrap;">${r.reported_at_str}</small>
              </div>
            </div>
          </button>
        </h2>
        <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#disasterAccordion">
          <div class="accordion-body bg-light">
            <div class="row g-3 align-items-stretch">
              <div class="col-md-7 d-flex flex-column justify-content-between">
                <div>
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <span class="badge bg-warning text-dark">緊急度：${r.urgency || '待評估'}</span>
                    <span class="small text-muted"><i class="bi bi-person me-1"></i>通報人：${r.user_name || '市民'}</span>
                  </div>
                  <p class="text-secondary small mb-2" style="white-space: pre-line;"><strong>災情描述：</strong>\n${r.description}</p>
                </div>
                <div class="pt-2 border-top text-start">
                  <button class="btn btn-outline-danger btn-sm px-3 fw-bold" onclick="openDisasterDetailModal('${r.report_no}')">
                    <i class="bi bi-eye me-1"></i> 查看進度與詳情
                  </button>
                </div>
              </div>
              ${imgBlock}
            </div>
            ${confirmActionHtml}
          </div>
        </div>
      </div>
    `;
  });
}

function openDisasterDetailModal(reportNo) {
  const record = cachedDisasterData.find(r => r.report_no === reportNo);
  if (!record) return;

  document.getElementById("dmodal-report-no").innerText = record.report_no;
  document.getElementById("dmodal-status-badge").innerText = record.status || "通報受理";
  document.getElementById("dmodal-time").innerText = record.reported_at_str || "剛剛";
  document.getElementById("dmodal-location").innerText = `${record.district} ${record.location_description || ''}`;
  document.getElementById("dmodal-urgency").innerText = record.urgency || "待評估";
  document.getElementById("dmodal-username").innerText = record.user_name || "市民 王先生";
  document.getElementById("dmodal-desc").innerText = record.description || "無詳細描述";

  const status = record.status || "通報受理";
  let stepLevel = 1;
  if (status === "派員現場") stepLevel = 2;
  else if (status === "處理中" || status === "搶修排除") stepLevel = 3;
  else if (status === "已結案") stepLevel = 4;

  const line = document.getElementById("dmodal-progress-line");
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`dstep-${i}`);
    if (s) {
      s.className = "step-compact-item";
      if (i < stepLevel) s.className = "step-compact-item completed";
      else if (i === stepLevel) s.className = "step-compact-item active";
    }
  }
  line.style.width = `${Math.max(0, (stepLevel - 1) * 33.3)}%`;

  const baseTime = record.reported_at_str ? record.reported_at_str.split(" ")[1] : "08:30";
  document.getElementById("dtime-1").innerHTML = `${baseTime}<br>(已受理)`;
  document.getElementById("dtime-2").innerHTML = stepLevel >= 2 ? `09:10<br>(已派員)` : `預估 09:10`;
  document.getElementById("dtime-3").innerHTML = stepLevel >= 3 ? `10:00<br>(排除中)` : `預估 10:00`;
  document.getElementById("dtime-4").innerHTML = stepLevel >= 4 ? `11:00<br>(已結案)` : `待結案`;

  const imgCard = document.getElementById("dmodal-img-card");
  const imgEl = document.getElementById("dmodal-img");
  if (record.image_url) {
    imgEl.src = record.image_url;
    imgCard.classList.remove("d-none");
  } else {
    imgCard.classList.add("d-none");
  }

  new bootstrap.Modal(document.getElementById("disasterProgressModal")).show();
}

async function confirmDisasterTaskResolved(reportNo) {
  const resTasks = await fetch("/api/volunteer-tasks");
  const jsonTasks = await resTasks.json();
  const targetTask = (jsonTasks.data || []).find(t => t.report_id === reportNo);

  if (targetTask) {
    await fetch("/api/volunteer-tasks/confirm-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: targetTask.task_id })
    });
  }

  loadDisasterAccordion();
  loadVolunteerTasks();
}

async function loadVolunteerTasks() {
  const tbody = document.getElementById("volunteer-tasks-tbody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/volunteer-tasks");
    const json = await res.json();
    if (json.status === "success" && json.data) {
      tbody.innerHTML = "";
      if (json.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">目前無待出勤任務。</td></tr>`;
        return;
      }
      json.data.forEach(t => {
        let btnStatus = `<button class="btn btn-sm btn-primary px-3" onclick="claimTaskPending(this, ${t.task_id})">接案出勤</button>`;
        if (t.status.includes("執行中")) {
          btnStatus = `<button class="btn btn-sm btn-warning text-dark disabled">出勤中 (待驗收)</button>`;
        } else if (t.status.includes("已完成")) {
          btnStatus = `<button class="btn btn-sm btn-success disabled">已結案核發</button>`;
        }

        tbody.innerHTML += `
          <tr>
            <td style="white-space: nowrap;" class="small font-monospace">${t.time_str || '剛剛'}</td>
            <td>
              <strong class="text-dark">${t.title}</strong><br>
              <small class="text-muted">連動案件：${t.report_id || '社區通報'}</small>
            </td>
            <td style="white-space: nowrap;"><span class="badge bg-danger">緊急出勤</span></td>
            <td>${t.district} ${t.location}</td>
            <td style="white-space: nowrap;">
              <span class="badge bg-success">+50 EXP</span>
              <span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> +${t.reward_points}</span>
            </td>
            <td style="white-space: nowrap; text-align: center;">${btnStatus}</td>
          </tr>
        `;
      });
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">載入出勤任務失敗</td></tr>`;
  }
}

async function claimTaskPending(btn, taskId) {
  await fetch("/api/volunteer-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId })
  });
  loadVolunteerTasks();
}

async function loadBoardMessages() {
  const container = document.getElementById("board-message-list");
  if (!container) return;

  const res = await fetch("/api/messages");
  const json = await res.json();
  if (json.status === "success" && json.data) {
    cachedMessages = json.data;
    renderBoardList();
  }
}

function renderBoardList() {
  const container = document.getElementById("board-message-list");
  if (!container) return;

  container.innerHTML = "";
  cachedMessages.forEach(m => {
    container.innerHTML += `
      <div class="list-group-item py-3 px-0 border-0 border-bottom">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div><strong class="text-dark me-2">${m.user_name}</strong><span class="badge bg-info text-dark">${m.category}</span></div>
          <small class="text-muted">${m.time_str || '剛剛'}</small>
        </div>
        <p class="mb-0 text-secondary small">${m.content}</p>
      </div>
    `;
  });
}

function getReqExp(lvl) { return 50 + (lvl - 1) * 25; }
function getTitle(lvl) { return lvl >= 5 ? "資深社區巡防員" : "防汛見習生"; }

function updateVolunteerUI() {
  const req = getReqExp(currentLevel);
  const pct = Math.min(100, Math.floor((currentExp / req) * 100));
  document.getElementById('volunteer-badge-level').innerText = `Lv. ${currentLevel}`;
  document.getElementById('volunteer-title-text').innerText = `目前頭銜：${getTitle(currentLevel)}`;
  document.getElementById('exp-progress-bar').style.width = `${pct}%`;
  document.getElementById('exp-current-text').innerText = `${currentExp} / ${req} EXP`;
  document.getElementById('star-points-text').innerHTML = `<i class="bi bi-star-fill text-warning"></i> ${currentStars} 點數`;
  document.getElementById('shop-user-stars').innerText = currentStars;
  document.getElementById('upgrade-hint-box').innerHTML = `🚀 距離升上 <strong>Lv.${currentLevel+1}</strong> 還需 <strong>${req - currentExp} EXP</strong>`;
}

function redeemReward(itemName, costStars) {
  if (currentStars < costStars) return;
  currentStars -= costStars;
  updateVolunteerUI();
}