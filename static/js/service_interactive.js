let currentLevel = 3;
let currentExp = 45;
let currentStars = 85;
let cachedMessages = [];
let selectedImageBase64 = "";

document.addEventListener("DOMContentLoaded", () => {
  loadSupplyHistory();
  loadBoardMessages();
  updateVolunteerUI();

  // 1. 調度申請送出 (HUM/EQP/MAT)
  const formSupply = document.getElementById("form-supply");
  if (formSupply) {
    formSupply.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const typeSelect = document.getElementById("supply-type");
      const rawType = typeSelect ? typeSelect.value : "物";
      const itemEl = document.getElementById("supply-item");
      const qtyEl = document.getElementById("supply-qty");
      const phoneEl = document.getElementById("supply-phone");

      const payload = {
        resource_type: rawType,
        item_name: itemEl ? itemEl.value.trim() : "防汛物資",
        quantity: qtyEl ? parseInt(qtyEl.value) : 1,
        contact_phone: phoneEl ? phoneEl.value.trim() : ""
      };

      try {
        const res = await fetch("/api/supply-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.status === "success") {
          alert(`調度申請已成功建立並寫入資料庫！\n訂單編號為：【${data.order_no}】`);
          if (itemEl) itemEl.value = "";
          loadSupplyHistory();
          openOrderModal(data.order_no, `${payload.item_name} (${payload.quantity})`, 1, "收到申請，審核備料中");
        } else {
          alert(data.message || "建立失敗");
        }
      } catch (err) {
        alert("資料庫連線逾時，請檢查連線！");
      }
    });
  }

  // 2. 照片選取預覽
  const fileInput = document.getElementById("report-img-file");
  if (fileInput) {
    fileInput.addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 3 * 1024 * 1024) {
        alert("照片檔案過大，請選擇小於 3MB 的圖片！");
        this.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        selectedImageBase64 = evt.target.result;
        document.getElementById("img-preview").src = selectedImageBase64;
        document.getElementById("img-preview-box").classList.remove("d-none");
      };
      reader.readAsDataURL(file);
    });
  }

  // 3. 災情通報送出 (動態生成卡片推入上方，保證原版卡片不消失)
  const formDisaster = document.getElementById("form-disaster");
  if (formDisaster) {
    formDisaster.addEventListener("submit", async (e) => {
      e.preventDefault();
      const distEl = document.getElementById("report-district");
      const locEl = document.getElementById("report-loc");
      const descEl = document.getElementById("report-desc");

      const districtVal = distEl ? distEl.value : "中山區";
      const locVal = locEl ? locEl.value.trim() : "";
      const descVal = descEl ? descEl.value.trim() : "";

      try {
        const res = await fetch("/api/disaster-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            district: districtVal,
            location: locVal,
            description: descVal,
            image_url: selectedImageBase64
          })
        });

        const data = await res.json();
        if (data.status === "success") {
          alert(`災情通報已成功送出！案件編號：【${data.report_no}】`);
          
          const container = document.getElementById("disaster-reports-container");
          const now = new Date();
          const timeStr = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          
          const imgPreviewHtml = selectedImageBase64 
            ? `<div class="mt-2"><img src="${selectedImageBase64}" style="max-height:80px; border-radius:6px; border:1px solid #ccc;"></div>` 
            : '';

          const newCardHtml = `
            <div class="border rounded p-4 mb-3 bg-white shadow-sm border-start border-danger border-4">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="fw-bold text-dark mb-0">案件編號 #${data.report_no} (${districtVal} - ${locVal})</h5>
                <span class="badge bg-primary text-white px-3 py-2 fw-bold" style="font-size: 0.9rem;">通報已受理</span>
              </div>
              <p class="text-secondary small mb-2">${descVal}</p>
              ${imgPreviewHtml}

              <div class="stepper-container" style="background:#1e293b; padding: 2.2rem 1.5rem; border-radius: 12px;">
                <div class="stepper-wrapper">
                  <div class="stepper-progress-line" style="width: 0%;"></div>
                  <div class="step-item active">
                    <div class="step-circle" style="width:75px; height:75px;"><i class="bi bi-receipt fs-4"></i><span style="font-size:0.75rem;">通報受理</span></div>
                    <small class="text-warning mt-2 d-block font-monospace">${timeStr}<br>(已受理)</small>
                  </div>
                  <div class="step-item">
                    <div class="step-circle" style="width:75px; height:75px;"><i class="bi bi-people fs-4"></i><span style="font-size:0.75rem;">派員現場</span></div>
                    <small class="text-muted mt-2 d-block font-monospace">排程派案中</small>
                  </div>
                  <div class="step-item">
                    <div class="step-circle" style="width:75px; height:75px;"><i class="bi bi-gear-wide-connected fs-4"></i><span style="font-size:0.75rem;">搶修排除</span></div>
                    <small class="text-muted mt-2 d-block font-monospace">待處置</small>
                  </div>
                  <div class="step-item">
                    <div class="step-circle" style="width:75px; height:75px;"><i class="bi bi-check2-all fs-4"></i><span style="font-size:0.75rem;">結案驗收</span></div>
                    <small class="text-muted mt-2 d-block font-monospace">待結案</small>
                  </div>
                </div>
              </div>
            </div>
          `;
          container.insertAdjacentHTML("afterbegin", newCardHtml);

          if (locEl) locEl.value = "";
          if (descEl) descEl.value = "";
          removeSelectedImage();
        } else {
          alert(data.message || "通報失敗");
        }
      } catch (err) {
        alert("資料庫連線失敗，請檢查 Neon 設定");
      }
    });
  }

  // 4. 留言板送出
  const btnSubmitMsg = document.getElementById("btn-submit-message");
  if (btnSubmitMsg) {
    btnSubmitMsg.addEventListener("click", async () => {
      const catEl = document.getElementById("msg-input-cat");
      const textEl = document.getElementById("msg-input-text");
      const content = textEl ? textEl.value.trim() : "";
      if (!content) {
        alert("請先輸入留言內容！");
        return;
      }

      const tags = (content.match(/#[^\s#]+/g) || []).join(" ");

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: catEl ? catEl.value : "即時路況",
            content: content,
            tags: tags
          })
        });
        const data = await res.json();
        if (data.status === "success") {
          textEl.value = "";
          loadBoardMessages();
        } else {
          alert("留言張貼失敗");
        }
      } catch (e) {
        alert("無法連線至留言板資料庫");
      }
    });
  }

  document.getElementById("board-filter-select")?.addEventListener("change", renderBoardList);
  document.getElementById("board-search-input")?.addEventListener("input", renderBoardList);
  document.getElementById("board-sort-select")?.addEventListener("change", renderBoardList);

  // 5. 問答
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

      try {
        const res = await fetch("/api/qa-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q })
        });
        const data = await res.json();
        chatBox.innerHTML += `<div class="mb-2"><strong class="text-primary">🤖 防汛助手：</strong>${data.answer}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      } catch (e) {
        chatBox.innerHTML += `<div class="mb-2 text-danger small">連線異常，請稍後再試。</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    };
    btnSendQa.addEventListener("click", sendQa);
    qaInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendQa(); });
  }
});

function removeSelectedImage() {
  selectedImageBase64 = "";
  const fileInput = document.getElementById("report-img-file");
  if (fileInput) fileInput.value = "";
  document.getElementById("img-preview-box").classList.add("d-none");
}

async function loadSupplyHistory() {
  const tbody = document.getElementById("supply-history-tbody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/supply-request");
    const json = await res.json();
    
    if (json.status === "success" && json.data && json.data.length > 0) {
      tbody.innerHTML = "";
      json.data.forEach(row => {
        let badgeColor = "bg-primary";
        let typeName = "物 (物資)";
        
        const rType = (row.resource_type || "").toUpperCase();
        const ord = (row.order_no || "").toUpperCase();

        if (rType === "HUM" || ord.startsWith("HUM")) { 
          badgeColor = "bg-success"; 
          typeName = "人 (人力)"; 
        } else if (rType === "EQP" || ord.startsWith("EQP")) { 
          badgeColor = "bg-warning text-dark"; 
          typeName = "機 (機具)"; 
        }

        const stepLevel = (row.status === "已送達") ? 4 : ((row.status === "派送中") ? 3 : ((row.status === "揀貨中") ? 2 : 1));

        tbody.innerHTML += `
          <tr>
            <td><span class="badge bg-light text-primary border font-monospace">${row.order_no}</span></td>
            <td class="small font-monospace text-secondary">${row.created_at || '剛剛'}</td>
            <td><span class="badge ${badgeColor}">${typeName}</span></td>
            <td><strong>${row.item_name}</strong> (${row.quantity})</td>
            <td><span class="badge bg-warning text-dark">${row.status || '收到申請'}</span></td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick="openOrderModal('${row.order_no}', '${row.item_name} (${row.quantity})', ${stepLevel}, '${row.status || '排程中'}')">
                查看進度條
              </button>
            </td>
          </tr>
        `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">尚無調度申請紀錄。</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">讀取申請紀錄失敗</td></tr>`;
  }
}

async function loadBoardMessages() {
  const container = document.getElementById("board-message-list");
  if (!container) return;

  try {
    const res = await fetch("/api/messages");
    const json = await res.json();
    if (json.status === "success" && json.data) {
      cachedMessages = json.data;
      renderBoardList();
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center py-4 text-muted">目前暫無留言。</div>`;
  }
}

function renderBoardList() {
  const container = document.getElementById("board-message-list");
  if (!container) return;

  const cat = document.getElementById("board-filter-select")?.value || "全部類別";
  const kw = (document.getElementById("board-search-input")?.value || "").trim().toLowerCase();
  const sortMode = document.getElementById("board-sort-select")?.value || "desc";

  let list = [...cachedMessages];

  list = list.filter(m => {
    const matchCat = (cat === "全部類別" || m.category === cat);
    const textAll = `${m.content} ${m.tags || ''} ${m.user_name}`.toLowerCase();
    const matchKw = (!kw || textAll.includes(kw));
    return matchCat && matchKw;
  });

  list.sort((a, b) => {
    const tA = new Date(a.time_str || a.created_at).getTime() || 0;
    const tB = new Date(b.time_str || b.created_at).getTime() || 0;
    return sortMode === "asc" ? (tA - tB) : (tB - tA);
  });

  if (list.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-muted">無符合條件之留言。</div>`;
    return;
  }

  container.innerHTML = "";
  list.forEach(m => {
    let tagBadges = "";
    if (m.tags) {
      m.tags.split(" ").forEach(t => {
        if (t) tagBadges += `<span class="badge bg-light text-primary border ms-1">${t}</span>`;
      });
    }

    container.innerHTML += `
      <div class="list-group-item py-3 px-0 border-0 border-bottom">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div>
            <strong class="text-dark me-2">${m.user_name}</strong>
            <span class="badge bg-info text-dark">${m.category}</span>
          </div>
          <small class="text-muted">${m.time_str || '剛剛'}</small>
        </div>
        <p class="mb-0 text-secondary small">
          ${m.content} ${tagBadges}
        </p>
      </div>
    `;
  });
}

function getReqExp(lvl) {
  return 50 + (lvl - 1) * 25;
}

function getTitle(lvl) {
  if (lvl >= 45) return "都市防汛守護大師";
  if (lvl >= 35) return "水利調度指揮官";
  if (lvl >= 25) return "防汛工程先鋒";
  if (lvl >= 15) return "社區核心巡防隊長";
  if (lvl >= 5) return "資深社區巡防員";
  return "防汛見習生";
}

function updateVolunteerUI() {
  const req = getReqExp(currentLevel);
  const pct = Math.min(100, Math.floor((currentExp / req) * 100));
  
  const badgeLvl = document.getElementById('volunteer-badge-level');
  const titleTxt = document.getElementById('volunteer-title-text');
  const expBar = document.getElementById('exp-progress-bar');
  const expTxt = document.getElementById('exp-current-text');
  const starTxt = document.getElementById('star-points-text');
  const shopStars = document.getElementById('shop-user-stars');
  const hintBox = document.getElementById('upgrade-hint-box');

  if (badgeLvl) badgeLvl.innerText = `Lv. ${currentLevel}`;
  if (titleTxt) titleTxt.innerText = `目前頭銜：${getTitle(currentLevel)}`;
  if (expBar) expBar.style.width = `${pct}%`;
  if (expTxt) expTxt.innerText = `${currentExp} / ${req} EXP`;
  if (starTxt) starTxt.innerHTML = `<i class="bi bi-star-fill text-warning"></i> ${currentStars} 點數`;
  if (shopStars) shopStars.innerText = currentStars;

  const remainExp = req - currentExp;
  if (hintBox) hintBox.innerHTML = `🚀 距離升上 <strong>Lv.${currentLevel+1}</strong> 還需 <strong>${remainExp} EXP</strong>`;
}

function claimTask(btn, addExp, addStars) {
  currentExp += addExp;
  currentStars += addStars;

  const req = getReqExp(currentLevel);
  if (currentExp >= req && currentLevel < 50) {
    currentExp -= req;
    currentLevel++;
    alert(`🎉 恭喜升級！升上【Lv.${currentLevel}】！\n獲得頭銜：【${getTitle(currentLevel)}】！`);
  } else {
    alert(`接案出勤完成！結算獲得 +${addExp} EXP 與 +${addStars} 星星點數！`);
  }

  btn.className = "btn btn-sm btn-success disabled";
  btn.innerText = "已出勤完成";
  updateVolunteerUI();
}

function redeemReward(itemName, costStars) {
  if (currentStars < costStars) {
    alert(`❌ 兌換失敗：您的星星點數不足！\n目前點數：${currentStars} 點\n所需點數：${costStars} 點\n還差 ${costStars - currentStars} 點，請多參與防汛志工任務累積點數！`);
    return;
  }

  if (confirm(`確認要消耗 ${costStars} 點兌換【${itemName}】嗎？`)) {
    currentStars -= costStars;
    updateVolunteerUI();
    const sn = "SN-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    alert(`🎉 恭喜成功兌換【${itemName}】！\n已自您的帳戶扣除 ${costStars} 星星點數。\n\n電子兌換憑證序號：【${sn}】\n（請截圖憑此序號至區公所或活動中心服務台領取或出示折抵）`);
  }
}

function openOrderModal(orderId, itemName, stepLevel, statusText) {
  document.getElementById('modal-order-id').innerText = orderId;
  document.getElementById('modal-order-item').innerText = itemName;
  document.getElementById('modal-order-eta').innerText = statusText || "排程處理中";

  const line = document.getElementById('modal-progress-line');
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`mstep-${i}`);
    if (s) {
      s.className = 'step-item';
      if (i < stepLevel) s.className = 'step-item completed';
      else if (i === stepLevel) s.className = 'step-item active';
    }
  }
  if (line) line.style.width = `${Math.max(0, (stepLevel - 1) * 33.3)}%`;
  new bootstrap.Modal(document.getElementById('orderProgressModal')).show();
}