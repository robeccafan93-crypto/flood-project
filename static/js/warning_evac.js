document.addEventListener("DOMContentLoaded", () => {
  const alertBox = document.getElementById("evac-status-text");
  const btn = document.getElementById("btn-trigger-alarm");

  btn.addEventListener("click", () => {
    alertBox.innerHTML = "<span class='text-danger fw-bold'>【緊急避難警報】該區雨量已達 250mm 警戒標準！請迅速往高處避難。</span>";
    alert("已發送即時避難通知！路線導航已更新為最高安全避難路徑。");
  });
});