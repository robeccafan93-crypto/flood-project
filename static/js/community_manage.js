document.addEventListener("DOMContentLoaded", function () {
  loadCommunityReports();
  loadCommunitySupplies();
  loadCommunityVolunteers();

  // 新增物資
  const formAdd = document.getElementById("formAddSupply");
  if (formAdd) {
    formAdd.addEventListener("submit", function (e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById("suppName").value.trim(),
        location: document.getElementById("suppLoc").value.trim(),
        quantity: parseInt(document.getElementById("suppQty").value),
        status: document.getElementById("suppStatus").value
      };

      fetch("/api/community-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(data => {
          alert(data.message);
          formAdd.reset();
          loadCommunitySupplies();
        });
    });
  }
});

// 1. 載入案件列表 (審核嚴重度與急迫性)
function loadCommunityReports() {
  fetch("/api/disaster-report")
    .then(res => res.json())
    .then(res => {
      const tbody = document.getElementById("communityReportsTableBody");
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3 text-muted">無通報案件待審核。</td></tr>`;
        return;
      }

      tbody.innerHTML = res.data.map(item => `
        <tr>
          <td><strong>#${item.report_no}</strong></td>
          <td>${item.user_name}</td>
          <td>${item.district} ${item.location_description}</td>
          <td><small>${item.description}</small></td>
          <td>
            <select class="form-control form-control-sm" id="sev_${item.report_no}">
              <option value="輕微" ${item.severity === '輕微' ? 'selected' : ''}>🟢 輕微</option>
              <option value="中度" ${item.severity === '中度' ? 'selected' : ''}>🟡 中度</option>
              <option value="嚴重" ${item.severity === '嚴重' ? 'selected' : ''}>🔴 嚴重</option>
            </select>
          </td>
          <td>
            <select class="form-control form-control-sm" id="urg_${item.report_no}">
              <option value="一般" ${item.urgency === '一般' ? 'selected' : ''}>一般</option>
              <option value="高度緊急" ${item.urgency === '高度緊急' ? 'selected' : ''}>⚡ 高度緊急</option>
            </select>
          </td>
          <td><span class="badge badge-info">${item.status}</span></td>
          <td>
            <input type="text" class="form-control form-control-sm" id="vol_${item.report_no}" value="${item.assigned_volunteer || '張師傅 (水電)'}">
          </td>
          <td>
            <button class="btn btn-primary btn-sm mb-1" onclick="auditReport('${item.report_no}', 'dispatch')">派工</button>
            <button class="btn btn-outline-danger btn-sm mb-1" onclick="auditReport('${item.report_no}', 'reject')">駁回</button>
          </td>
        </tr>
      `).join("");
    });
}

// 審核案件
function auditReport(reportNo, action) {
  const sev = document.getElementById(`sev_${reportNo}`).value;
  const urg = document.getElementById(`urg_${reportNo}`).value;
  const vol = document.getElementById(`vol_${reportNo}`).value;

  fetch("/api/disaster-report/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      report_no: reportNo,
      action: action,
      severity: sev,
      urgency: urg,
      volunteer: vol
    })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      loadCommunityReports();
    });
}

// 2. 載入物資庫存
function loadCommunitySupplies() {
  fetch("/api/community-resources")
    .then(res => res.json())
    .then(res => {
      const tbody = document.getElementById("communitySuppliesTableBody");
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">目前無物資登錄。</td></tr>`;
        return;
      }
      tbody.innerHTML = res.data.map(item => `
        <tr>
          <td><strong>${item.item_name}</strong></td>
          <td>${item.location}</td>
          <td>${item.quantity}</td>
          <td><span class="badge badge-success">${item.status}</span></td>
          <td>
            <button class="btn btn-outline-danger btn-sm" onclick="deleteSupply(${item.id})">刪除</button>
          </td>
        </tr>
      `).join("");
    });
}

function deleteSupply(id) {
  if (!confirm("確定要刪除此物資紀錄嗎？")) return;
  fetch(`/api/community-resources?id=${id}`, { method: "DELETE" })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      loadCommunitySupplies();
    });
}

// 3. 載入志工人力名冊
function loadCommunityVolunteers() {
  fetch("/api/community-volunteers")
    .then(res => res.json())
    .then(res => {
      const tbody = document.getElementById("communityVolunteersTableBody");
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">目前無志工資料。</td></tr>`;
        return;
      }
      tbody.innerHTML = res.data.map(v => `
        <tr>
          <td><strong>${v.name}</strong></td>
          <td>${v.phone || '0912-345-678'}</td>
          <td>${v.district || '中山區'}</td>
          <td><span class="text-warning font-weight-bold">★ ${v.points || 0}</span></td>
          <td>${v.exp || 0} EXP</td>
          <td><span class="badge badge-success">正常待命</span></td>
        </tr>
      `).join("");
    });
}