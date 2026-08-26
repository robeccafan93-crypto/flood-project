document.addEventListener("DOMContentLoaded", () => {
  const loadDemands = async () => {
    const res = await fetch("/api/community-demands");
    const json = await res.json();
    const tbody = document.getElementById("demand-table-body");
    tbody.innerHTML = "";

    (json.data || []).forEach(d => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${d.community_name}</strong></td>
          <td><span class="badge bg-primary">${d.category}</span></td>
          <td>${d.item_name}</td>
          <td>${d.quantity}</td>
          <td><span class="badge bg-info text-dark">${d.source_type}</span></td>
          <td><span class="badge bg-warning text-dark">${d.status}</span></td>
        </tr>
      `;
    });
  };

  document.getElementById("form-demand").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      community_name: document.getElementById("comm-name").value,
      category: document.getElementById("demand-cat").value,
      source_type: document.getElementById("source-type").value,
      item_name: document.getElementById("demand-item").value,
      quantity: parseInt(document.getElementById("demand-qty").value)
    };
    const res = await fetch("/api/community-demands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    document.getElementById("demand-item").value = "";
    loadDemands();
  });

  loadDemands();
});