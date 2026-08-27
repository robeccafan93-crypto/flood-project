import os
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "flood_system_secret_key_2026")

# Neon PostgreSQL 連線字串 (直連你的雲端資料庫)
DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_BbAq2rUeTQD9@ep-sweet-dawn-azygay6t-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

def get_db():
    return psycopg2.connect(DB_CONNECTION_STRING, cursor_factory=RealDictCursor)

# ================= 頁面路由與權限控管 =================

# 首頁 (任何人皆可瀏覽)
@app.route("/")
def index():
    return render_template("index.html")

# 登入與註冊模組
@app.route("/auth", methods=["GET", "POST"])
def auth():
    if request.method == "POST":
        action = request.form.get("action")
        account = request.form.get("account", "").strip()
        password = request.form.get("password", "").strip()

        conn = None
        cur = None
        try:
            conn = get_db()
            cur = conn.cursor()

            if action == "login":
                cur.execute(
                    "SELECT user_id, username, password_hash, name, phone, email, role, region_code FROM users WHERE username = %s OR email = %s",
                    (account, account)
                )
                user = cur.fetchone()

                if not user:
                    flash("帳號不存在，請先註冊！", "danger")
                    return redirect(url_for("auth"))

                db_pwd = str(user.get("password_hash") or "")
                # 密碼比對邏輯 (支援明文與預設管理員)
                if db_pwd != password and not db_pwd.endswith(password):
                    if not (account.lower() == "admin" and password == "123456"):
                        flash("密碼錯誤，請重新輸入！", "danger")
                        return redirect(url_for("auth"))

                # 寫入 Session
                session["user_id"] = user["user_id"]
                session["username"] = user["username"]
                session["name"] = user.get("name") or user["username"]
                session["role"] = "community" if str(user.get("role", "")).lower() in ["community", "社區", "admin"] else "citizen"
                session["district"] = user.get("region_code") or "大同區"

                flash(f"歡迎登入，{session['name']}！", "success")
                return redirect(url_for("citizen_disaster"))

            elif action == "register":
                name = request.form.get("name", "").strip()
                phone = request.form.get("phone", "").strip()
                email = request.form.get("email", "").strip()
                role = "community" if request.form.get("role") == "社區" else "citizen"
                district = request.form.get("district", "大同區")

                try:
                    cur.execute(
                        """
                        INSERT INTO users (username, password_hash, name, phone, email, role, region_code)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (account, password, name, phone, email, role, district)
                    )
                    conn.commit()
                    flash("註冊成功！請直接登入。", "success")
                except psycopg2.IntegrityError:
                    if conn: conn.rollback()
                    flash("此帳號已被註冊，請更換帳號！", "warning")
                return redirect(url_for("auth"))

        except Exception as e:
            if conn: conn.rollback()
            flash(f"資料庫連線失敗: {str(e)}", "danger")
            return redirect(url_for("auth"))
        finally:
            if cur: cur.close()
            if conn: conn.close()

    return render_template("auth.html")

# 登出
@app.route("/logout")
def logout():
    session.clear()
    flash("您已安全登出系統。", "info")
    return redirect(url_for("index"))

# --- 民眾服務 (需登入) ---

@app.route("/citizen/disaster")
def citizen_disaster():
    if "username" not in session:
        return redirect(url_for("auth"))
    return render_template("citizen_disaster.html")

@app.route("/citizen/warning")
def citizen_warning():
    if "username" not in session:
        return redirect(url_for("auth"))
    return render_template("citizen_warning.html")

@app.route("/citizen/service")
def citizen_service():
    if "username" not in session:
        return redirect(url_for("auth"))
    return render_template("citizen_service.html")

# --- 社區物資 (含補助資源，限社區端身分) ---

@app.route("/community/manage")
def community_manage():
    if "username" not in session or session.get("role") != "community":
        flash("權限不足：此專區僅限【社區端身分】進入！", "danger")
        return redirect(url_for("citizen_disaster"))
    return render_template("community_manage.html")

@app.route("/community/demand")
def community_demand():
    if "username" not in session or session.get("role") != "community":
        flash("權限不足：此專區僅限【社區端身分】進入！", "danger")
        return redirect(url_for("citizen_disaster"))
    return render_template("community_demand.html")

@app.route("/subsidy")
def subsidy_resource():
    if "username" not in session:
        return redirect(url_for("auth"))
    return render_template("subsidy_resource.html")

# ================= REST API (直接對接現有資料表) =================

# 1. 水情資料查詢：精準讀取 flood_summary 並依 12 行政區自動彙整
@app.route("/api/flood-summary")
def api_flood_summary():
    conn = None
    cur = None
    region_map = {
        "A": "北投區", "B": "士林區", "C": "中山區", "D": "中正區",
        "E": "大安區", "F": "內湖區", "G": "文山區", "H": "松山區",
        "I": "萬華區", "J": "信義區", "K": "南港區", "L": "大同區"
    }
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM flood_summary ORDER BY id ASC")
        raw_rows = cur.fetchall()

        summary_dict = {}
        for r in raw_rows:
            code = str(r.get("region_code") or "A").strip().upper()
            d_name = r.get("district") or r.get("district_name") or r.get("location") or ""
            
            # 若資料庫 district 為空或填寫「臺北市」，依據代碼轉換為具體行政區
            if not d_name or "臺北" in d_name or "台北" in d_name:
                d_name = region_map.get(code, f"監測區-{code}")

            rain = float(r.get("rainfall_mm") or r.get("rainfall") or 0.0)

            if d_name not in summary_dict:
                summary_dict[d_name] = {
                    "district": d_name,
                    "region_code": code,
                    "total_rain": 0.0,
                    "max_rain": 0.0,
                    "count": 0
                }
            summary_dict[d_name]["total_rain"] += rain
            summary_dict[d_name]["max_rain"] = max(summary_dict[d_name]["max_rain"], rain)
            summary_dict[d_name]["count"] += 1

        formatted_list = []
        idx = 1
        for d_name, val in summary_dict.items():
            avg_rain = val["total_rain"] / val["count"] if val["count"] > 0 else 0.0
            formatted_list.append({
                "id": idx,
                "district": d_name,
                "region_code": val["region_code"],
                "rainfall": avg_rain,
                "max_rainfall": val["max_rain"],
                "sensor_count": val["count"]
            })
            idx += 1

        return jsonify({"status": "success", "data": formatted_list})
    except Exception as e:
        print(f"[Flood Summary API Error] {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 2. 災情通報：寫入 disaster_reports 資料表
@app.route("/api/disaster-report", methods=["POST"])
def api_disaster_report():
    data = request.json or {}
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO disaster_reports (district, description)
            VALUES (%s, %s)
            """,
            (data.get("district", "大同區"), data.get("description", ""))
        )
        conn.commit()
        return jsonify({"status": "success", "message": "災情通報已成功送出！案件已進入審核流程。"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 3. 民眾需求申請：寫入 supplies_requests 資料表
@app.route("/api/supply-request", methods=["POST"])
def api_supply_request():
    data = request.json or {}
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO supplies_requests (user_account, user_name, district, item_name, quantity, contact_phone)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                session.get("username", "guest"),
                session.get("name", "民眾"),
                session.get("district", "大同區"),
                data.get("item_name", "防汛沙包"),
                int(data.get("quantity", 1)),
                data.get("contact_phone", "")
            )
        )
        conn.commit()
        return jsonify({"status": "success", "message": "物資申請已成功送出至社區端！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 4. 社區端物資管理：讀取/新增/刪除 supplies 資料表
@app.route("/api/community-resources", methods=["GET", "POST", "DELETE"])
def api_community_resources():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        if request.method == "GET":
            cur.execute("SELECT * FROM supplies ORDER BY id ASC")
            rows = cur.fetchall()
            return jsonify({"status": "success", "data": rows})

        elif request.method == "POST":
            d = request.json or {}
            cur.execute(
                """
                INSERT INTO supplies (item_name, location, quantity, status)
                VALUES (%s, %s, %s, %s)
                """,
                (d.get("name"), d.get("location"), int(d.get("quantity", 1)), d.get("status", "充足"))
            )
            conn.commit()
            return jsonify({"status": "success", "message": "物資項目已新增至 supplies 資料表！"})

        elif request.method == "DELETE":
            res_id = request.args.get("id")
            cur.execute("DELETE FROM supplies WHERE id = %s", (res_id,))
            conn.commit()
            return jsonify({"status": "success", "message": "項目已成功刪除！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 5. 跨社區調度協作 API
@app.route("/api/community-demands", methods=["GET", "POST"])
def api_community_demands():
    if request.method == "POST":
        return jsonify({"status": "success", "message": "調度申請已受理，已啟動跨社區資源派送！"})
    return jsonify({
        "status": "success",
        "data": [
            {"community_name": "明勝里社區防災會", "category": "設備需求", "item_name": "移動式抽水泵浦", "quantity": 2, "source_type": "合作機構", "status": "派送中"},
            {"community_name": "大同區聯合防汛會", "category": "物資需求", "item_name": "防汛沙包 100 包", "quantity": 100, "source_type": "社區互助", "status": "已送達"}
        ]
    })

# 6. 即時防汛問答 API
@app.route("/api/qa-chat", methods=["POST"])
def api_qa_chat():
    d = request.json or {}
    q = d.get("question", "")
    ans = "感謝您的提問。系統建議在豪大雨發布時，請迅速移往二樓以上安全處所，並遠離低窪地下道。"
    if "沙包" in q or "物資" in q:
        ans = "防汛沙包可至各區公所或在民眾服務模組的『服務互動』直接向社區申請調度。"
    elif "路線" in q or "避難" in q:
        ans = "請前往預警避難模組查看當前行政區的最佳避難導航路徑與收容所位置。"
    return jsonify({"status": "success", "answer": ans})

# 7. 會員資料修改 API
@app.route("/api/user-profile/update", methods=["POST"])
def api_update_user_profile():
    if "user_id" not in session:
        return jsonify({"status": "error", "message": "請先登入！"}), 401

    data = request.json or {}
    new_name = data.get("name", "").strip()
    new_username = data.get("username", "").strip()
    new_password = data.get("password", "").strip()
    new_district = data.get("district", "大同區")

    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()

        if new_password:
            cur.execute("""
                UPDATE users 
                SET name = %s, username = %s, password_hash = %s, region_code = %s
                WHERE user_id = %s
            """, (new_name, new_username, new_password, new_district, session["user_id"]))
        else:
            cur.execute("""
                UPDATE users 
                SET name = %s, username = %s, region_code = %s
                WHERE user_id = %s
            """, (new_name, new_username, new_district, session["user_id"]))

        conn.commit()

        session["name"] = new_name
        session["username"] = new_username
        session["district"] = new_district

        return jsonify({"status": "success", "message": "會員資料已成功儲存並同步至資料庫！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": f"更新失敗: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)