document.addEventListener("DOMContentLoaded", () => {
  // 災情通報
  document.getElementById("form-disaster-report").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      district: document.getElementById("report-district").value,
      severity: document.getElementById("report-severity").value,
      description: document.getElementById("report-desc").value
    };
    const res = await fetch("/api/disaster-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    document.getElementById("report-desc").value = "";
  });

  // 物資申請
  document.getElementById("form-supply-req").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      item_name: document.getElementById("req-item").value,
      quantity: parseInt(document.getElementById("req-qty").value),
      contact_phone: document.getElementById("req-phone").value
    };
    const res = await fetch("/api/supply-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
    document.getElementById("req-phone").value = "";
  });

  // 聊天機器人
  const chatBox = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("btn-chat-send");

  const sendQuestion = async () => {
    const q = chatInput.value.trim();
    if (!q) return;

    chatBox.innerHTML += `<div class="chat-msg user">${q}</div>`;
    chatInput.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    const res = await fetch("/api/qa-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q })
    });
    const data = await res.json();
    chatBox.innerHTML += `<div class="chat-msg bot">${data.answer}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
  };

  sendBtn.addEventListener("click", sendQuestion);
  chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendQuestion(); });
});