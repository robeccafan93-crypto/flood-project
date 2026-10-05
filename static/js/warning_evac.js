// 台北市主要行政區最近法定防汛避難所清單與確切座標
const SHELTER_COORDINATES = {
  "大同區": { name: "大同區雙連國小防汛收容中心", lat: 25.0594, lng: 121.5168 },
  "北投區": { name: "北投區石牌國小防汛避難所", lat: 25.1147, lng: 121.5152 },
  "士林區": { name: "士林區士林國小避難中心", lat: 25.0936, lng: 121.5262 },
  "中山區": { name: "中山區中正國小緊急收容所", lat: 25.0538, lng: 121.5375 },
  "萬華區": { name: "萬華區龍山國中收容所", lat: 25.0352, lng: 121.4988 }
};

document.addEventListener("DOMContentLoaded", function () {
  // 綁定「模擬暴雨警示」按鈕 (圖一彈窗觸發)
  const alertTriggerBtn = document.getElementById("btnTriggerFloodAlert");
  if (alertTriggerBtn) {
    alertTriggerBtn.addEventListener("click", function () {
      $('#floodAlertModal').modal('show');
    });
  }

  // 綁定「立即啟動安全避難導航」按鈕
  const navBtn = document.getElementById("btnStartNavigation");
  if (navBtn) {
    navBtn.addEventListener("click", startGoogleMapsNavigation);
  }
});

/**
 * 啟動導航：獲取用戶 GPS 定位，並直接開啟 Google Maps 前往最近的避難所
 */
function startGoogleMapsNavigation() {
  const defaultShelter = SHELTER_COORDINATES["大同區"];
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        // 自動呼叫 Google Maps 路線規劃 API
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${uLat},${uLng}&destination=${defaultShelter.lat},${defaultShelter.lng}&travelmode=walking`;
        window.open(gmapsUrl, "_blank");
      },
      function (err) {
        // 使用者未允許 GPS 或獲取逾時，直接導向避難所地點
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(defaultShelter.name)}+${defaultShelter.lat},${defaultShelter.lng}`;
        window.open(gmapsUrl, "_blank");
      },
      { timeout: 4000 }
    );
  } else {
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(defaultShelter.name)}`;
    window.open(gmapsUrl, "_blank");
  }
}