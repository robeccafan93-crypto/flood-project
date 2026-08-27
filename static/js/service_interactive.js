document.addEventListener("DOMContentLoaded", () => {
  // 1. 物資申請送出與進度條模擬更新
  const formSupply = document.getElementById("form-supply");
  if (formSupply) {
    formSupply.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        item_name: document.getElementById("supply-item").value,
        quantity: document.getElementById("supply-qty").value,
        contact_phone: document.getElementById("supply-phone").value
      };

      try {
        const res = await fetch("/api/supply-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success") {
          alert("物資需求申請已成功送出！系統已進入調度排程。");
          
          // 動態切換進度條至「收到申請」->「揀貨備料中」
          document.getElementById("stepperLine").style.width = "33%";
          document.getElementById("step-1").className = "step-item completed";
          document.getElementById("step-2").className = "step-item active";
          document.getElementById("current-step-badge").innerText = "進度：社區備料揀貨中";
        } else {
          alert(data.message || "送出失敗，請檢查連線");
        }
      } catch (err) {
        alert("伺服器連線異常");
      }
    });
  }

  // 2. 災情通報送出
  const formDisaster = document.getElementById("form-disaster");
  if (formDisaster) {
    formDisaster.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        district: document.getElementById("report-district").value,
        description: document.getElementById("report-desc").value
      };

      const res = await fetch("/api/disaster-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.status === "success") {
        alert(data.message);
        document.getElementById("report-desc").value = "";
      } else {
        alert("通報失敗");
      }
    });
  }

  // 3. QA 智慧問答
  const btnSendQa = document.getElementById("btn-send-qa");
  const qaInput = document.getElementById("qa-input");
  const chatBox = document.getElementById("chat-box");

  if (btnSendQa && qaInput) {
    const sendQa = async () => {
      const q = qaInput.value.trim();
      if (!q) return;

      chatBox.innerHTML += `<div class="mb-2 text-end"><span class="bg-primary text-white p-2 rounded d-inline-block">${q}</span></div>`;
      qaInput.value = "";
      chatBox.scrollTop = chatBox.scrollHeight;

      const res = await fetch("/api/qa-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      });
      const data = await res.json();
      chatBox.innerHTML += `<div class="mb-2"><strong class="text-primary">🤖 防汛助手：</strong>${data.answer}</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    btnSendQa.addEventListener("click", sendQa);
    qaInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendQa();
    });
  }
});