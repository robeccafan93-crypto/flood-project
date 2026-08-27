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
      document.getElementById('disaster-table-body').innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">資料庫連線逾時，請檢查網路後重新整理。</td></tr>`;
    }
  };

  const renderDashboard = (list) => {
    document.getElementById('monitored-districts-count').innerText = `${list.length} 個行政區`;
    
    let maxRain = 0;
    list.forEach(d => {
      const r = parseFloat(d.max_rainfall || d.rainfall || 0);
      if (r > maxRain) maxRain = r;
    });
    
    document.getElementById('city-max-rain').innerText = `${maxRain.toFixed(3)}`;
    
    const alertEl = document.getElementById('city-alert-level');
    if (maxRain > 300) {
      alertEl.className = 'fs-4 fw-bold text-danger';
      alertEl.innerText = '二級警戒 (局處整備)';
    } else if (maxRain > 150) {
      alertEl.className = 'fs-4 fw-bold text-warning';
      alertEl.innerText = '水情戒備';
    } else {
      alertEl.className = 'fs-4 fw-bold text-success';
      alertEl.innerText = '正常水情監控';
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
      
      const avgFormatted = avgRain.toFixed(3);
      const maxFormatted = maxRain.toFixed(3);

      let badge = '<span class="badge bg-success px-3 py-2">正常 (無風險)</span>';
      if (maxRain > 300) {
        badge = '<span class="badge bg-danger px-3 py-2">高度淹水風險</span>';
      } else if (maxRain > 150) {
        badge = '<span class="badge bg-warning text-dark px-3 py-2">中度淹水警戒</span>';
      }

      tbody.innerHTML += `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td class="fw-bold fs-6 text-dark">${item.district}</td>
          <td><span class="badge bg-light text-primary border border-primary px-2 py-1">${item.region_code}</span></td>
          <td class="fw-bold font-monospace text-dark">${avgFormatted}</td>
          <td class="font-monospace text-secondary">${maxFormatted}</td>
          <td>${badge}</td>
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