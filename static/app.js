// 1. 讀取資料庫數據
document.getElementById('loadBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/flood-data');
        const result = await response.json();

        if (result.status === 'success') {
            const tableBody = document.getElementById('tableBody');
            tableBody.innerHTML = ''; 

            result.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>#${row.id}</b></td>
                    <td>${row.region}</td>
                    <td><span class="badge">${row.region_code}</span></td>
                    <td>${row.rainfall_mm}</td>
                    <td>${row.humidity_percent}%</td>
                `;
                tableBody.appendChild(tr);
            });

            document.getElementById('statCount').innerText = `${result.data.length} 筆`;
        }
    } catch (error) {
        alert('連線失敗！');
    }
});

// 2. 登入視窗 Modal 控制
const modal = document.getElementById('loginModal');
document.getElementById('openLoginBtn').onclick = () => modal.style.display = 'flex';
document.getElementById('closeLoginBtn').onclick = () => modal.style.display = 'none';

// 3. 處理登入表單送出
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();

        if (result.status === 'success') {
            alert(`🎉 ${result.message} 歡迎回來，${result.user}`);
            modal.style.display = 'none';
            document.getElementById('navUserArea').innerHTML = `<span><i class="fa-solid fa-circle-user"></i> ${result.user}</span>`;
        } else {
            alert(`❌ ${result.message}`);
        }
    } catch (error) {
        alert('登入請求失敗');
    }
});