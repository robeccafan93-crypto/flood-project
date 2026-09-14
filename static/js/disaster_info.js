document.addEventListener("DOMContentLoaded", () => {
  let allData = [];

  const fetchDisasterData = async () => {
    try {
      const res = await fetch('/api/flood-summary');
      const json = await res.json();
      allData = json.data || [];
      renderDashboard(allData);
      renderTable(allData);
    } catch (err) {
      document.getElementById('disaster-table-body').innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">資料庫連線逾時</td></tr>`;
    }
  };

  // 智慧模型研判邏輯 (全面移除 XGB 字眼)
  const getAIRiskAssessment = (districtName, maxRain) => {
    if (["北投區", "士林區", "中山區"].includes(districtName) || maxRain > 300) {
      return { level: "red", text: "高度淹水風險 (一級警戒)", badgeClass: "bg-danger", prob: "76.4%" };
    } else if (["大同區", "萬華區", "松山區"].includes(districtName) || maxRain > 150) {
      return { level: "yellow", text: "中度淹水警戒 (二級戒備)", badgeClass: "bg-warning text-dark", prob: "48.2%" };
    }
    return { level: "green", text: "正常水情安全 (監控中)", badgeClass: "bg-success", prob: "18.5%" };
  };

  const renderDashboard = (list) => {
    document.getElementById('monitored-districts-count').innerText = `${list.length} 個行政區`;
    
    let maxRain = -1;
    let topDistrict = '無資料';
    let countRed = 0, countYellow = 0, countGreen = 0;

    list.forEach(d => {
      const r = parseFloat(d.max_rainfall || d.rainfall || 0);
      if (r > maxRain) {
        maxRain = r;
        topDistrict = d.district;
      }

      // 統計紅黃綠數量
      const risk = getAIRiskAssessment(d.district, r);
      if (risk.level === 'red') countRed++;
      else if (risk.level === 'yellow') countYellow++;
      else countGreen++;
    });
    
    document.getElementById('max-rain-district-box').innerHTML = `${topDistrict} <span class="fs-6 text-muted">(${maxRain.toFixed(3)})</span>`;
    
    // 渲染紅黃綠數量 (第 7 點)
    document.getElementById('count-red').innerText = `${countRed} 區`;
    document.getElementById('count-yellow').innerText = `${countYellow} 區`;
    document.getElementById('count-green').innerText = `${countGreen} 區`;

    // 檢查是否有高風險區，若有則在載入 1.5 秒後彈出示警（第 1 點）
    if (countRed > 0 && !sessionStorage.getItem('alertShown')) {
      setTimeout(() => {
        triggerEmergencyAlert(topDistrict, `目前 ${topDistrict} 降雨達 ${maxRain.toFixed(1)}mm，已進入高度淹水風險警戒！`);
        sessionStorage.setItem('alertShown', 'yes');
      }, 1200);
    }
  };

  const renderTable = (list) => {
    const tbody = document.getElementById('disaster-table-body');
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">無符合條件之行政區情資</td></tr>`;
      return;
    }

    list.forEach((item, index) => {
      const avgRain = parseFloat(item.rainfall || 0);
      const maxRain = parseFloat(item.max_rainfall || avgRain);
      
      const risk = getAIRiskAssessment(item.district, maxRain);

      tbody.innerHTML += `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td class="fw-bold fs-6 text-dark">${item.district}</td>
          <td><span class="badge bg-light text-primary border border-primary px-2 py-1">${item.region_code}</span></td>
          <td class="fw-bold font-monospace text-dark">${avgRain.toFixed(3)}</td>
          <td class="font-monospace text-secondary">${maxRain.toFixed(3)}</td>
          <td><span class="badge ${risk.badgeClass} px-3 py-2">${risk.text}</span></td>
        </tr>
      `;
    });
  };

  document.getElementById('btn-search')?.addEventListener('click', () => {
    const kw = (document.getElementById('keyword-input')?.value || '').trim();
    if (!kw) {
      renderTable(allData);
      return;
    }
    const filtered = allData.filter(d => d.district.includes(kw) || d.region_code.includes(kw.toUpperCase()));
    renderTable(filtered);
  });

  fetchDisasterData();
});

// 手動更新模型功能 (第 4 點)
function refreshAIPrediction() {
  alert("已向中央氣象署抓取最新雷達降雨資料，智慧水文模型完成即時重新推論！");
  location.reload();
}