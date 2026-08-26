document.addEventListener("DOMContentLoaded", () => {
  let allData = [];

  const fetchDisasterData = async () => {
    try {
      const res = await fetch('/api/flood-summary');
      const json = await res.json();
      allData = json.data || [];
      renderTable(allData);
    } catch (err) {
      document.getElementById('disaster-table-body').innerHTML = `<tr><td colspan="5" class="text-center text-danger">讀取失敗</td></tr>`;
    }
  };

  const renderTable = (list) => {
    const tbody = document.getElementById('disaster-table-body');
    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">無符合條件之水文情資</td></tr>`;
      return;
    }
    list.forEach(item => {
      const rainfall = parseFloat(item.rainfall_mm || item.rainfall || 0);
      let badge = '<span class="badge bg-success">正常 (無風險)</span>';
      if (rainfall > 300) badge = '<span class="badge bg-danger">高度淹水風險</span>';
      else if (rainfall > 150) badge = '<span class="badge bg-warning text-dark">中度淹水警戒</span>';

      tbody.innerHTML += `
        <tr>
          <td><strong>#${item.id}</strong></td>
          <td>${item.district || item.district_name || '臺北市'}</td>
          <td><span class="badge bg-info text-dark">${item.region_code || 'A'}</span></td>
          <td>${rainfall} mm</td>
          <td>${badge}</td>
        </tr>
      `;
    });
  };

  document.getElementById('btn-search').addEventListener('click', () => {
    const kw = document.getElementById('keyword-input').value.trim();
    if (!kw) {
      renderTable(allData);
      return;
    }
    const filtered = allData.filter(d => (d.district || '').includes(kw));
    renderTable(filtered);
  });

  fetchDisasterData();
});