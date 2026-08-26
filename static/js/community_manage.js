document.addEventListener("DOMContentLoaded", () => {
  const loadResources = async () => {
    const res = await fetch("/api/community-resources");
    const json = await res.json();
    const tbody = document.getElementById("resource-table-body");
    tbody.innerHTML = "";

    (json.data || []).forEach(r => {
      tbody.innerHTML += `
        <tr>
          <td><span class="badge bg-secondary">${r.res_type}</span></td>
          <td><strong>${r.name}</strong></td>
          <td>${r.location}</td>
          <td>${r.quantity}</td>
          <td><span class="badge bg-success">${r.status}</span></td>
          <td><button class="btn btn-sm btn-outline-danger" onclick="deleteRes(${r.id})">刪除</button></td>
        </tr>
      `;
    });
  };

  document.getElementById("form-add-resource").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      res_type: document.getElementById("res-type").value,
      name: document.getElementById("res-name").value,
      location: document.getElementById("res-loc").value,
      quantity: parseInt(document.getElementById("res-qty").value)
    };
    await fetch("/api/community-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    document.getElementById("res-name").value = "";
    loadResources();
  });

  window.deleteRes = async (id) => {
    if (confirm("確定刪除此資源項目？")) {
      await fetch(`/api/community-resources?id=${id}`, { method: "DELETE" });
      loadResources();
    }
  };

  loadResources();
});