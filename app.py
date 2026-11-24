import os
import json
import math
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "flood_system_secret_key_2026")

CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_BbAq2rUeTQD9@ep-sweet-dawn-azygay6t-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

TAIPEI_TZ = timezone(timedelta(hours=8))
WEEKLY_QUOTA_LIMIT = 30  # 每人每週申請總數量上限（每週一 00:00 台北時間重置）

def get_db():
    return psycopg2.connect(DB_CONNECTION_STRING, cursor_factory=RealDictCursor)

def get_taipei_week_start_utc_naive():
    """計算台北時間 (UTC+8) 本週一 00:00:00，轉為資料庫無時區時間比對"""
    now_tpe = datetime.now(TAIPEI_TZ)
    monday_tpe = (now_tpe - timedelta(days=now_tpe.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    next_monday_tpe = monday_tpe + timedelta(days=7)
    return monday_tpe.replace(tzinfo=None), next_monday_tpe.strftime("%Y-%m-%d 00:00")

def calc_user_weekly_used(cur, username, user_name):
    week_start, next_reset_str = get_taipei_week_start_utc_naive()
    cur.execute("""
        SELECT items_json, quantity, status
        FROM supplies_requests
        WHERE (user_account = %s OR user_name = %s)
          AND status <> '已婉拒'
          AND created_at >= %s
    """, (username, user_name, week_start))
    rows = cur.fetchall()
    used_total = 0
    for r in rows:
        items = r.get("items_json")
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except Exception:
                items = None
        if isinstance(items, list) and len(items) > 0:
            for it in items:
                used_total += int(it.get("quantity", 0))
        else:
            used_total += int(r.get("quantity") or 0)
    return used_total, next_reset_str

def generate_custom_order_no(cur, prefix="REQ"):
    today_str = datetime.now(TAIPEI_TZ).strftime("%Y%m%d")
    search_pattern = f"{prefix}-{today_str}-%"
    cur.execute(
        "SELECT COUNT(*) AS count FROM supplies_requests WHERE order_no LIKE %s",
        (search_pattern,)
    )
    result = cur.fetchone()
    seq_num = (result["count"] if result else 0) + 1
    return f"{prefix}-{today_str}-{seq_num:03d}"

RED_ORANGE_ZONES = [
    {"name": "北投低窪警戒區", "district": "北投區", "level": "red", "level_text": "嚴重 (紅區)", "lat": 25.1325, "lon": 121.4988, "radius_km": 2.5},
    {"name": "大同延平北路段", "district": "大同區", "level": "orange", "level_text": "偏高 (橘區)", "lat": 25.0655, "lon": 121.5145, "radius_km": 2.2},
    {"name": "中山低窪警戒區", "district": "中山區", "level": "orange", "level_text": "偏高 (橘區)", "lat": 25.0685, "lon": 121.5325, "radius_km": 2.0}
]

DISTRICT_COORDS = {
    "北投區": (25.1325, 121.4988),
    "士林區": (25.0920, 121.5260),
    "中山區": (25.0685, 121.5325),
    "大同區": (25.0655, 121.5145),
    "內湖區": (25.0830, 121.5868),
    "松山區": (25.0500, 121.5575),
    "中正區": (25.0385, 121.5190),
    "大安區": (25.0315, 121.5435),
    "信義區": (25.0305, 121.5720),
    "南港區": (25.0550, 121.6070),
    "文山區": (24.9852, 121.5768)
}

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def check_red_orange_zone(lat, lon):
    if lat is None or lon is None:
        return None
    try:
        u_lat = float(lat)
        u_lon = float(lon)
        for zone in RED_ORANGE_ZONES:
            dist = haversine_km(u_lat, u_lon, zone["lat"], zone["lon"])
            if dist <= zone["radius_km"]:
                return zone
    except Exception:
        return None
    return None

# ================= 頁面路由與權限控管 =================

@app.route("/")
def index():
    return render_template("index.html")

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
                if account.lower() == "admin" and password == "123456":
                    session["user_id"] = 1
                    session["username"] = "admin"
                    session["name"] = "系統管理員"
                    session["phone"] = "0912-345-678"
                    session["role"] = "community"
                    session["district"] = "大同區"
                    session["volunteer_skills"] = ""
                    flash("管理員登入成功！", "success")
                    return redirect(url_for("citizen_disaster"))

                cur.execute(
                    "SELECT user_id, username, password_hash, name, phone, email, role, region_code FROM users WHERE username = %s OR email = %s",
                    (account, account)
                )
                user = cur.fetchone()

                if not user:
                    flash("帳號不存在，請先註冊！", "danger")
                    return redirect(url_for("auth"))

                db_pwd = str(user.get("password_hash") or "").strip()
                if db_pwd != password and not db_pwd.endswith(password):
                    flash("密碼錯誤，請重新輸入！", "danger")
                    return redirect(url_for("auth"))

                cur.execute("SELECT skills FROM volunteers WHERE user_id = %s", (user["user_id"],))
                vol_row = cur.fetchone()

                session["user_id"] = user["user_id"]
                session["username"] = user["username"]
                session["name"] = user.get("name") or user["username"]
                session["phone"] = user.get("phone") or "0912-345-678"
                session["role"] = "community" if str(user.get("role", "")).lower() in ["community", "社區", "admin"] else "citizen"
                session["district"] = user.get("region_code") or "中山區"
                session["volunteer_skills"] = vol_row["skills"] if vol_row else ""

                flash(f"歡迎登入，{session['name']}！", "success")
                return redirect(url_for("citizen_disaster"))

            elif action == "register":
                name = request.form.get("name", "").strip()
                phone = request.form.get("phone", "").strip()
                email = request.form.get("email", "").strip()
                role = "community" if request.form.get("role") == "社區" else "citizen"
                district = request.form.get("district", "中山區")
                is_vol = request.form.get("is_volunteer") == "yes"
                skills_list = request.form.getlist("skills")
                skills_str = ",".join(skills_list)

                try:
                    cur.execute(
                        """
                        INSERT INTO users (username, password_hash, name, phone, email, role, region_code)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING user_id
                        """,
                        (account, password, name, phone, email, role, district)
                    )
                    new_user = cur.fetchone()

                    if is_vol and new_user:
                        cur.execute(
                            """
                            INSERT INTO volunteers (user_id, username, name, phone, district, skills, license_info, status, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, '註冊互助志工', '待命中', NOW(), NOW())
                            ON CONFLICT (user_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                phone = EXCLUDED.phone,
                                district = EXCLUDED.district,
                                skills = EXCLUDED.skills,
                                status = '待命中',
                                updated_at = NOW()
                            """,
                            (new_user["user_id"], account, name, phone, district, skills_str)
                        )

                    conn.commit()
                    flash("註冊成功！請直接登入。", "success")
                except psycopg2.IntegrityError:
                    if conn: conn.rollback()
                    flash("此帳號已被註冊，請更換帳號！", "warning")
                return redirect(url_for("auth"))

        except Exception as e:
            if conn: conn.rollback()
            flash(f"資料庫連線逾時，請稍後重試 ({str(e)[:40]})", "danger")
            return redirect(url_for("auth"))
        finally:
            if cur: cur.close()
            if conn: conn.close()

    return render_template("auth.html")

@app.route("/logout")
def logout():
    session.clear()
    flash("您已安全登出系統。", "info")
    return redirect(url_for("index"))

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

@app.route("/community/manage")
def community_manage():
    if "username" not in session or session.get("role") != "community":
        flash("權限不足：此專區僅限【管理端身分】進入！", "danger")
        return redirect(url_for("citizen_disaster"))
    return render_template("community_manage.html")

@app.route("/community/demand")
def community_demand():
    if "username" not in session or session.get("role") != "community":
        flash("權限不足：此專區僅限【管理端身分】進入！", "danger")
        return redirect(url_for("citizen_disaster"))
    return render_template("community_demand.html")

@app.route("/subsidy")
def subsidy_resource():
    if "username" not in session:
        return redirect(url_for("auth"))
    return render_template("subsidy_resource.html")

# ================= REST API =================

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
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/disaster-report", methods=["GET", "POST"])
def api_disaster_report():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()

        if request.method == "POST":
            data = request.json or {}
            district = data.get("district", session.get("district", "中山區"))
            location = data.get("location", "").strip()
            description = data.get("description", "").strip()
            image_url = data.get("image_url", "").strip()
            report_type = data.get("report_type", "積淹水災情")
            user_id = session.get("user_id", 1)

            today_str = datetime.now(TAIPEI_TZ).strftime("%Y%m%d")
            try:
                cur.execute("SELECT COUNT(*) AS count FROM disaster_reports WHERE report_no LIKE %s", (f"RPT-{today_str}-%",))
                cnt_res = cur.fetchone()
                seq = (cnt_res["count"] if cnt_res else 0) + 1
            except Exception:
                seq = 1
            report_no = f"RPT-{today_str}-{seq:03d}"

            cur.execute(
                """
                INSERT INTO disaster_reports (
                    user_id, region_code, location_description, 
                    report_type, description, image_url, status, 
                    reported_at, updated_at, report_no, user_name, 
                    district, severity, urgency, is_task_open
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, %s, %s, %s, %s, %s)
                RETURNING report_id
                """,
                (
                    user_id,
                    district,
                    location,
                    report_type,
                    description,
                    image_url,
                    "通報受理",
                    report_no,
                    session.get("name", "王小明"),
                    district,
                    "待評估",
                    "一般",
                    True
                )
            )
            conn.commit()
            return jsonify({
                "status": "success",
                "message": "災情通報已成功送出！",
                "report_no": report_no
            })

        elif request.method == "GET":
            scope = request.args.get("scope", "mine")
            user_id = session.get("user_id")
            user_name = session.get("name")

            if scope == "all":
                cur.execute("""
                    SELECT report_id, 
                           COALESCE(report_no, 'RPT-' || report_id::text) as report_no,
                           COALESCE(user_name, '市民') as user_name,
                           COALESCE(NULLIF(district, ''), NULLIF(region_code, ''), '中山區') as district,
                           COALESCE(location_description, '') as location_description,
                           COALESCE(report_type, '一般通報') as report_type,
                           description, image_url,
                           COALESCE(status, '通報受理') as status,
                           COALESCE(assigned_volunteer, '') as assigned_volunteer,
                           TO_CHAR(COALESCE(reported_at, NOW()), 'YYYY-MM-DD HH24:MI') as reported_at_str
                    FROM disaster_reports
                    ORDER BY report_id DESC LIMIT 200
                """)
            else:
                cur.execute("""
                    SELECT report_id, 
                           COALESCE(report_no, 'RPT-' || report_id::text) as report_no,
                           COALESCE(user_name, '市民') as user_name,
                           COALESCE(NULLIF(district, ''), NULLIF(region_code, ''), '中山區') as district,
                           COALESCE(location_description, '') as location_description,
                           COALESCE(report_type, '一般通報') as report_type,
                           description, image_url,
                           COALESCE(status, '通報受理') as status,
                           COALESCE(assigned_volunteer, '') as assigned_volunteer,
                           TO_CHAR(COALESCE(reported_at, NOW()), 'YYYY-MM-DD HH24:MI') as reported_at_str
                    FROM disaster_reports
                    WHERE user_id = %s OR user_name = %s
                    ORDER BY report_id DESC LIMIT 100
                """, (user_id, user_name))
            
            rows = cur.fetchall()
            return jsonify({"status": "success", "data": rows})

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 災情審核與派案（移除緊急程度評定，直接核定指派志工）
@app.route("/api/disaster-report/audit", methods=["POST"])
def api_audit_disaster_report():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        data = request.json or {}
        report_no = data.get("report_no")
        action = data.get("action", "dispatch")
        volunteer = data.get("volunteer", "志工機動隊")

        new_status = "派員現場" if action == "dispatch" else "已結案"
        cur.execute("""
            UPDATE disaster_reports 
            SET status = %s, assigned_volunteer = %s, updated_at = NOW()
            WHERE report_no = %s OR report_id::text = %s
        """, (new_status, volunteer, str(report_no), str(report_no)))

        cur.execute("""
            INSERT INTO volunteer_tasks (report_id, title, description, district, location, required_volunteers, assigned_user, status, reward_points)
            SELECT COALESCE(report_no, report_id::text), '【緊急災情支援】' || description, description, district, location_description, 1, %s, '執行中 (待申請者驗收)', 20
            FROM disaster_reports 
            WHERE (report_no = %s OR report_id::text = %s)
            AND NOT EXISTS (
                SELECT 1 FROM volunteer_tasks WHERE report_id = %s OR report_id = report_no
            )
        """, (volunteer, str(report_no), str(report_no), str(report_no)))

        conn.commit()
        return jsonify({"status": "success", "message": f"案件 {report_no} 審核完成！已派工：{volunteer}"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/registered-volunteers", methods=["GET"])
def api_registered_volunteers():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT volunteer_id, user_id, username, name,
                   COALESCE(NULLIF(phone, ''), '0912-000-000') AS phone,
                   COALESCE(NULLIF(district, ''), '中山區') AS district,
                   COALESCE(skills, '') AS volunteer_skills,
                   COALESCE(license_info, '註冊互助志工') AS license_info,
                   CASE 
                     WHEN status LIKE '%待命%' THEN '待命中'
                     ELSE COALESCE(NULLIF(status, ''), '待命中')
                   END AS status
            FROM volunteers
            ORDER BY volunteer_id ASC
        """)
        rows = cur.fetchall()
        return jsonify({"status": "success", "data": rows})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

# 查詢個人本週物資申請額度與上限（每週一 00:00 台北時間重置）
@app.route("/api/supply-quota", methods=["GET"])
def api_supply_quota():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        current_user = session.get("username", "guest")
        current_name = session.get("name", "王小明")
        used_total, next_reset_str = calc_user_weekly_used(cur, current_user, current_name)
        return jsonify({
            "status": "success",
            "weekly_limit": WEEKLY_QUOTA_LIMIT,
            "weekly_used": used_total,
            "remaining": max(0, WEEKLY_QUOTA_LIMIT - used_total),
            "next_reset_tpe": next_reset_str
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/supply-request", methods=["GET", "POST"])
def api_supply_request():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()

        if request.method == "POST":
            data = request.json or {}
            items = data.get("items", [])
            contact_phone = data.get("contact_phone", "")
            detail_address = data.get("detail_address", "").strip()
            district = data.get("district", session.get("district", "中山區"))
            lat = data.get("latitude")
            lon = data.get("longitude")

            matched_zone = check_red_orange_zone(lat, lon)
            if not matched_zone:
                return jsonify({
                    "status": "error",
                    "message": "您目前所在位置不在紅色（嚴重）或橘色（偏高）淹水警戒區域內，僅限災害發生區域可提出需求申請！"
                }), 403

            if not items:
                return jsonify({"status": "error", "message": "申請清單不可為空！"}), 400

            current_user = session.get("username", "guest")
            current_name = session.get("name", "王小明")
            used_total, next_reset_str = calc_user_weekly_used(cur, current_user, current_name)

            this_request_total = sum(int(it.get("quantity", 0)) for it in items)
            if used_total + this_request_total > WEEKLY_QUOTA_LIMIT:
                remain = max(0, WEEKLY_QUOTA_LIMIT - used_total)
                return jsonify({
                    "status": "error",
                    "message": f"超過本週物資申請上限（每週上限 {WEEKLY_QUOTA_LIMIT} 單位，您本週已用 {used_total}，剩餘可申請 {remain}，將於每週一 00:00 重置）！"
                }), 400

            type_set = []
            item_desc_list = []
            for it in items:
                raw_t = str(it.get("resource_type") or "物").strip()
                t_char = "物"
                if "人" in raw_t or "HUM" in raw_t.upper(): t_char = "人"
                elif "機" in raw_t or "EQP" in raw_t.upper(): t_char = "機"
                
                if t_char not in type_set:
                    type_set.append(t_char)
                item_desc_list.append(f"{it.get('item_name')} {it.get('quantity')}{it.get('unit', '個')}")

            main_prefix = "REQ"
            if len(type_set) == 1:
                main_prefix = {"人": "HUM", "機": "EQP", "物": "MAT"}[type_set[0]]

            order_no = generate_custom_order_no(cur, main_prefix)
            combined_type_str = ",".join(type_set)
            combined_item_str = "、".join(item_desc_list)

            cur.execute(
                """
                INSERT INTO supplies_requests (
                    order_no, resource_type, user_account, user_name, 
                    district, item_name, quantity, contact_phone, detail_address,
                    latitude, longitude, status, items_json, target_community
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, order_no, created_at
                """,
                (
                    order_no,
                    combined_type_str,
                    current_user,
                    current_name,
                    matched_zone["district"],
                    combined_item_str,
                    this_request_total,
                    contact_phone,
                    detail_address,
                    lat,
                    lon,
                    "收到申請",
                    json.dumps(items, ensure_ascii=False),
                    f"{matched_zone['district']}防汛備災中心"
                )
            )
            created_row = cur.fetchone()
            conn.commit()

            return jsonify({
                "status": "success", 
                "message": "調度申請已成功建立！",
                "order_no": created_row["order_no"],
                "item_name": combined_item_str,
                "items_json": items
            })

        elif request.method == "GET":
            scope = request.args.get("scope", "mine")
            current_user = session.get("username", "guest")
            current_name = session.get("name", "王小明")

            if scope == "all" and session.get("role") == "community":
                cur.execute("""
                    SELECT id, order_no, resource_type, user_name, district, 
                           item_name, quantity, contact_phone, 
                           COALESCE(detail_address, '') as detail_address, 
                           status, items_json, target_community,
                           created_at
                    FROM supplies_requests
                    ORDER BY id DESC
                    LIMIT 100
                """)
            else:
                cur.execute("""
                    SELECT id, order_no, resource_type, user_name, district, 
                           item_name, quantity, contact_phone, 
                           COALESCE(detail_address, '') as detail_address, 
                           status, items_json, target_community,
                           created_at
                    FROM supplies_requests
                    WHERE user_account = %s OR user_name = %s
                    ORDER BY id DESC
                    LIMIT 100
                """, (current_user, current_name))

            rows = cur.fetchall()
            for r in rows:
                if r.get("created_at"):
                    r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M")
                if r.get("items_json") and isinstance(r["items_json"], str):
                    try:
                        r["items_json"] = json.loads(r["items_json"])
                    except Exception:
                        pass
            return jsonify({"status": "success", "data": rows})

    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/supply-request/audit", methods=["POST"])
def api_audit_supply_request():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        data = request.json or {}
        order_no = data.get("order_no")
        action = data.get("action", "approve")

        if action == "approve":
            cur.execute("SELECT items_json, district FROM supplies_requests WHERE order_no = %s", (order_no,))
            req_row = cur.fetchone()
            if req_row and req_row.get("items_json"):
                items = req_row["items_json"]
                dist = req_row.get("district") or "大同區"
                if isinstance(items, str):
                    items = json.loads(items)
                
                for it in items:
                    it_name = it.get("item_name")
                    qty = int(it.get("quantity", 0))
                    cur.execute("""
                        UPDATE supplies 
                        SET quantity = GREATEST(0, quantity - %s), updated_at = NOW()
                        WHERE supply_id = (
                            SELECT supply_id FROM supplies 
                            WHERE item_name LIKE %s AND current_location LIKE %s 
                            LIMIT 1
                        )
                    """, (qty, f"%{it_name}%", f"%{dist}%"))

            cur.execute("UPDATE supplies_requests SET status = '審核核發' WHERE order_no = %s", (order_no,))
            msg = f"訂單 {order_no} 已審核核發，庫存已同步扣減！"
        else:
            cur.execute("UPDATE supplies_requests SET status = '已婉拒' WHERE order_no = %s", (order_no,))
            msg = f"訂單 {order_no} 已婉拒申請。"

        conn.commit()
        return jsonify({"status": "success", "message": msg})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/volunteer-tasks", methods=["GET", "POST"])
def api_volunteer_tasks():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        if request.method == "GET":
            cur.execute("""
                SELECT task_id, report_id, title, description, district, location,
                       required_volunteers, COALESCE(status, '招募中') as status,
                       reward_points, assigned_user, applicant_confirmed,
                       TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') as time_str
                FROM volunteer_tasks
                ORDER BY task_id DESC
            """)
            rows = cur.fetchall()
            return jsonify({"status": "success", "data": rows})
        elif request.method == "POST":
            data = request.json or {}
            task_id = data.get("task_id")
            volunteer_user = session.get("name") or "王小明"
            cur.execute("""
                UPDATE volunteer_tasks 
                SET assigned_user = %s, status = '執行中 (待申請者驗收)'
                WHERE task_id = %s
            """, (volunteer_user, task_id))
            conn.commit()
            return jsonify({"status": "success", "message": f"接案成功！志工 {volunteer_user} 前往現場支援中！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/volunteer-tasks/confirm-complete", methods=["POST"])
def api_confirm_volunteer_task():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        data = request.json or {}
        task_id = data.get("task_id")

        cur.execute("""
            UPDATE volunteer_tasks 
            SET status = '已完成 (點數已結算)', applicant_confirmed = TRUE, completed_at = NOW()
            WHERE task_id = %s
            RETURNING reward_points, assigned_user
        """, (task_id,))
        task_info = cur.fetchone()
        conn.commit()

        if task_info:
            return jsonify({
                "status": "success", 
                "message": f"驗收確認成功！已核發 +{task_info['reward_points']} 點與 +50 EXP 給志工【{task_info['assigned_user']}】！",
                "reward_points": task_info["reward_points"]
            })
        return jsonify({"status": "error", "message": "找不到該任務"}), 404
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/volunteer-tasks/create", methods=["POST"])
def api_create_volunteer_task():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        data = request.json or {}
        title = data.get("title", "").strip()
        location = data.get("location", "").strip()
        district = data.get("district", session.get("district", "中山區"))
        points = int(data.get("reward_points", 20))
        desc = data.get("description", "")

        cur.execute("""
            INSERT INTO volunteer_tasks (report_id, title, description, district, location, required_volunteers, status, reward_points, created_at)
            VALUES ('管理端排班', %s, %s, %s, %s, 1, '招募中', %s, NOW())
            RETURNING task_id
        """, (title, desc, district, location, points))
        conn.commit()
        return jsonify({"status": "success", "message": "志工任務已成功發布並同步至前台大廳！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/community-resources", methods=["GET", "POST", "DELETE"])
def api_community_resources():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        if request.method == "GET":
            cur.execute("""
                SELECT supply_id AS id, owner_id, item_name, 
                       COALESCE(item_type, '物') AS item_type, 
                       quantity, COALESCE(unit, '個') AS unit, 
                       COALESCE(current_location, '備災中心') AS current_location,
                       TO_CHAR(COALESCE(updated_at, NOW()), 'YYYY-MM-DD HH24:MI') AS updated_at_str
                FROM supplies 
                ORDER BY supply_id ASC
            """)
            rows = cur.fetchall()
            return jsonify({"status": "success", "data": rows})
        elif request.method == "POST":
            d = request.json or {}
            owner_id = session.get("user_id", 1)
            item_name = d.get("name", "").strip()
            item_type = d.get("item_type", "物").strip()
            quantity = int(d.get("quantity", 1))
            unit = d.get("unit", "包").strip()
            current_location = d.get("location", "大同區防汛備災中心").strip()

            cur.execute(
                """
                INSERT INTO supplies (owner_id, item_name, item_type, quantity, unit, current_location, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING supply_id
                """,
                (owner_id, item_name, item_type, quantity, unit, current_location)
            )
            conn.commit()
            return jsonify({"status": "success", "message": "物資項目已成功入庫！"})
        elif request.method == "DELETE":
            res_id = request.args.get("id")
            cur.execute("DELETE FROM supplies WHERE supply_id = %s", (res_id,))
            conn.commit()
            return jsonify({"status": "success", "message": "項目已成功刪除！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/supply-recommend", methods=["GET"])
def api_supply_recommend():
    target_dist = request.args.get("target_district", "大同區").strip()
    item_name = request.args.get("item_name", "高密度防汛沙包").strip()

    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT supply_id, item_name, quantity, unit, current_location
            FROM supplies
            WHERE item_name LIKE %s
        """, (f"%{item_name}%",))
        rows = cur.fetchall()

        target_lat, target_lon = DISTRICT_COORDS.get(target_dist, (25.0655, 121.5145))

        candidates = []
        for r in rows:
            loc = r.get("current_location") or ""
            src_dist = None
            for d_name in DISTRICT_COORDS.keys():
                if d_name in loc:
                    src_dist = d_name
                    break
            if not src_dist or src_dist == target_dist:
                continue

            qty = int(r.get("quantity") or 0)
            if qty <= 0:
                continue

            src_lat, src_lon = DISTRICT_COORDS[src_dist]
            dist_km = round(haversine_km(src_lat, src_lon, target_lat, target_lon), 2)

            candidates.append({
                "district": src_dist,
                "location": loc,
                "item_name": r["item_name"],
                "quantity": qty,
                "unit": r.get("unit") or "個",
                "distance_km": dist_km
            })

        candidates.sort(key=lambda x: (-x["quantity"], x["distance_km"]))

        return jsonify({
            "status": "success",
            "target_district": target_dist,
            "item_name": item_name,
            "recommendations": candidates[:5]
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/supply-transfer", methods=["POST"])
def api_supply_transfer():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        d = request.json or {}
        from_dist = d.get("from_district", "").strip()
        to_dist = d.get("to_district", "").strip()
        item_name = d.get("item_name", "").strip()
        qty = int(d.get("quantity", 10))

        cur.execute("""
            UPDATE supplies 
            SET quantity = GREATEST(0, quantity - %s), updated_at = NOW()
            WHERE supply_id = (
                SELECT supply_id FROM supplies 
                WHERE item_name LIKE %s AND current_location LIKE %s 
                LIMIT 1
            )
        """, (qty, f"%{item_name}%", f"%{from_dist}%"))

        cur.execute("""
            UPDATE supplies 
            SET quantity = quantity + %s, updated_at = NOW()
            WHERE supply_id = (
                SELECT supply_id FROM supplies 
                WHERE item_name LIKE %s AND current_location LIKE %s 
                LIMIT 1
            )
        """, (qty, f"%{item_name}%", f"%{to_dist}%"))

        conn.commit()
        return jsonify({"status": "success", "message": f"已完成【{from_dist} → {to_dist}】({item_name} x{qty}) 跨區調撥！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/user-profile/update", methods=["POST"])
def api_update_user_profile():
    if "user_id" not in session:
        return jsonify({"status": "error", "message": "請先登入！"}), 401
    data = request.json or {}
    new_name = data.get("name", "").strip()
    new_username = data.get("username", "").strip()
    new_password = data.get("password", "").strip()
    new_district = data.get("district", "中山區")
    skills_list = data.get("skills", [])
    skills_str = ",".join(skills_list)
    user_id = session["user_id"]
    phone = session.get("phone", "0912-345-678")

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
            """, (new_name, new_username, new_password, new_district, user_id))
        else:
            cur.execute("""
                UPDATE users 
                SET name = %s, username = %s, region_code = %s
                WHERE user_id = %s
            """, (new_name, new_username, new_district, user_id))

        if len(skills_list) > 0:
            cur.execute("""
                INSERT INTO volunteers (user_id, username, name, phone, district, skills, license_info, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, '註冊互助志工', '待命中', NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    name = EXCLUDED.name,
                    district = EXCLUDED.district,
                    skills = EXCLUDED.skills,
                    status = '待命中',
                    updated_at = NOW()
            """, (user_id, new_username, new_name, phone, new_district, skills_str))
        else:
            cur.execute("DELETE FROM volunteers WHERE user_id = %s", (user_id,))

        conn.commit()
        session["name"] = new_name
        session["username"] = new_username
        session["district"] = new_district
        session["volunteer_skills"] = skills_str
        return jsonify({"status": "success", "message": "會員資料與志工設定已成功儲存！"})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": f"更新失敗: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

@app.route("/api/messages", methods=["GET", "POST"])
def api_messages():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        if request.method == "POST":
            d = request.json or {}
            content = d.get("content", "").strip()
            category = d.get("category", "即時路況")
            tags = d.get("tags", "")
            user_name = session.get("name", "王小明")
            district = session.get("district", "中山區")
            cur.execute("""
                INSERT INTO message_board (user_name, district, category, content, tags)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_name, district, category, content, tags))
            conn.commit()
            return jsonify({"status": "success", "message": "留言已成功張貼至資料庫！"})
        elif request.method == "GET":
            cur.execute("""
                SELECT id, user_name, district, category, content, tags, 
                       to_char(created_at, 'YYYY-MM-DD HH24:MI') as time_str
                FROM message_board 
                ORDER BY id DESC LIMIT 50
            """)
            rows = cur.fetchall()
            return jsonify({"status": "success", "data": rows})
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)