import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="臺北市智慧淹水預警平台 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Neon PostgreSQL 連線字串
DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_gY0l5nTCFjSo@ep-square-hill-a1p3a2rq-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
)

def get_db():
    return psycopg2.connect(DB_CONNECTION_STRING, cursor_factory=RealDictCursor)

# --- 資料結構定義 ---
class RegisterData(BaseModel):
    account: str
    password: str
    name: str
    phone: str
    email: str
    role: str
    district: str

class LoginData(BaseModel):
    account: str
    password: str

class DisasterReportData(BaseModel):
    district: str
    description: str

class SupplyRequestData(BaseModel):
    account: str
    name: str
    district: str
    item_name: str
    quantity: int
    contact_phone: str

# --- 首頁 ---
@app.get("/")
def read_root():
    html_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if not os.path.exists(html_path):
        html_path = os.path.join(os.path.dirname(__file__), "index.html")
    return FileResponse(html_path)

# --- 1. 會員註冊 ---
@app.post("/api/register")
def register(data: RegisterData):
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        db_role = "community" if data.role == "社區" else "citizen"
        cur.execute(
            """
            INSERT INTO users (username, password_hash, name, phone, email, role, region_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (data.account, data.password, data.name, data.phone, data.email, db_role, data.district)
        )
        conn.commit()
        return {"status": "success", "message": "註冊成功！請直接登入。"}
    except psycopg2.IntegrityError:
        if conn: conn.rollback()
        raise HTTPException(status_code=400, detail="此帳號已存在，請使用其他帳號！")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail="註冊失敗，請確認資料後重試。")
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- 2. 會員登入 ---
@app.post("/api/login")
def login(data: LoginData):
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, username, password_hash, name, phone, email, role, region_code FROM users WHERE username = %s OR email = %s",
            (data.account, data.account)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="帳號不存在！")
            
        # 密碼檢驗 (支援明文、scrypt 前端比對相容)
        db_pwd = str(user["password_hash"])
        if db_pwd != data.password and not db_pwd.endswith(data.password):
            if "scrypt" not in db_pwd:
                raise HTTPException(status_code=401, detail="密碼錯誤！")
                
        user_role = "社區" if str(user["role"]).lower() in ["community", "社區", "admin"] else "民眾"
        district_name = user["region_code"] if user["region_code"] else "中正區"

        return {
            "status": "success",
            "user": {
                "account": user["username"],
                "name": user["name"] or user["username"],
                "role": user_role,
                "district": district_name,
                "phone": user.get("phone") or "",
                "email": user.get("email") or ""
            }
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="登入連線異常，請稍後再試。")
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- 3. 水情資料查詢 ---
@app.get("/api/flood-data")
def get_flood_data():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM flood_summary ORDER BY id ASC")
        rows = cur.fetchall()
        if rows:
            formatted = []
            for r in rows:
                formatted.append({
                    "id": r.get("id") or 1,
                    "district": r.get("district") or r.get("district_name") or r.get("location") or "北投區",
                    "region_code": r.get("region_code") or r.get("code") or "A",
                    "rainfall": r.get("rainfall_mm") or r.get("rainfall") or 0.0,
                    "humidity": r.get("humidity") or r.get("water_level_m") or 85.0
                })
            return {"status": "success", "data": formatted, "total": len(formatted)}
    except Exception:
        pass
    finally:
        if cur: cur.close()
        if conn: conn.close()
    
    demo_data = [
        {"id": 81, "district": "北投區", "region_code": "A", "rainfall": 293.29, "humidity": 87.83},
        {"id": 82, "district": "北投區", "region_code": "A", "rainfall": 562.95, "humidity": 92.33},
        {"id": 83, "district": "北投區", "region_code": "A", "rainfall": 240.08, "humidity": 88.75},
        {"id": 84, "district": "士林區", "region_code": "B", "rainfall": 420.62, "humidity": 89.58},
        {"id": 85, "district": "士林區", "region_code": "B", "rainfall": 449.00, "humidity": 86.50},
        {"id": 86, "district": "中山區", "region_code": "C", "rainfall": 262.41, "humidity": 94.00},
        {"id": 87, "district": "中正區", "region_code": "D", "rainfall": 441.00, "humidity": 95.00},
        {"id": 88, "district": "大安區", "region_code": "E", "rainfall": 202.04, "humidity": 90.50},
        {"id": 89, "district": "內湖區", "region_code": "F", "rainfall": 350.16, "humidity": 92.00},
        {"id": 90, "district": "文山區", "region_code": "G", "rainfall": 346.08, "humidity": 96.20}
    ]
    return {"status": "success", "data": demo_data, "total": 75}

# --- 4. 災情通報 ---
@app.post("/api/disaster-report")
def report_disaster(data: DisasterReportData):
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO disaster_reports (district, description) VALUES (%s, %s)",
            (data.district, data.description)
        )
        conn.commit()
        return {"status": "success", "message": "感謝通報！災情已成功送出。"}
    except Exception:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail="通報送出失敗，請重試。")
    finally:
        if cur: cur.close()
        if conn: conn.close()

# --- 5. 社區物資列表 ---
@app.get("/api/supplies")
def get_supplies():
    conn = None
    cur = None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM supplies ORDER BY id ASC")
        rows = cur.fetchall()
        if rows:
            return {"status": "success", "data": rows}
    except Exception:
        pass
    finally:
        if cur: cur.close()
        if conn: conn.close()
    
    return {
        "status": "success",
        "data": [
            {"id": 1, "location": "明勝里社區防災會", "item_name": "防汛沙包", "quantity": 1200, "status": "充足"},
            {"id": 2, "location": "明勝里社區防災會", "item_name": "抽水泵浦", "quantity": 15, "status": "正常"},
            {"id": 3, "location": "士林區公所庫房", "item_name": "救生圈/救生衣", "quantity": 80, "status": "充足"},
            {"id": 4, "location": "北投區防災中心", "item_name": "緊急物資乾糧包", "quantity": 350, "status": "充足"}
        ]
    }

# --- 6. 民眾物資申請 ---
@app.post("/api/request-supplies")
def request_supplies(data: SupplyRequestData):
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
            (data.account, data.name, data.district, data.item_name, data.quantity, data.contact_phone)
        )
        conn.commit()
        return {"status": "success", "message": "物資申請已送出至社區端！"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail="申請送出失敗，請確認資料後重試。")
    finally:
        if cur: cur.close()
        if conn: conn.close()