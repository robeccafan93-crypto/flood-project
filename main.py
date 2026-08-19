import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="臺北市智慧淹水預警系統 API")

templates = Jinja2Templates(directory="templates")

DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_gY0l5nTCFjSo@ep-square-hill-a1p3a2rq-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
)

def get_db_connection():
    return psycopg2.connect(DB_CONNECTION_STRING, cursor_factory=RealDictCursor)

# --- 資料模型 ---
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

# --- 頁面路由 ---
@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- 會員註冊 (直接對應現有的 users 欄位) ---
@app.post("/api/register")
def register(data: RegisterData):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (username, password_hash, name, phone, email, role, region_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (data.account, data.password, data.name, data.phone, data.email, data.role, data.district)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "註冊成功"}
    except psycopg2.IntegrityError:
        raise HTTPException(status_code=400, detail="該帳號已被註冊")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- 會員登入 ---
@app.post("/api/login")
def login(data: LoginData):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT user_id, username, name, phone, email, role, region_code FROM users WHERE username = %s AND password_hash = %s",
        (data.account, data.password)
    )
    user = cur.fetchone()
    cur.close()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    return {
        "status": "success",
        "user": {
            "account": user["username"],
            "name": user["name"],
            "role": user["role"],
            "district": user["region_code"]
        }
    }

# --- 水情資料查詢 ---
@app.get("/api/flood-data")
def get_flood_data():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM flood_summary ORDER BY id ASC")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"status": "success", "data": rows}

# --- 災情通報 ---
@app.post("/api/disaster-report")
def report_disaster(data: DisasterReportData):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO disaster_reports (district, description) VALUES (%s, %s)",
        (data.district, data.description)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "success", "message": "通報已送出"}

# --- 社區物資列表 ---
@app.get("/api/supplies")
def get_supplies():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM supplies ORDER BY id ASC")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"status": "success", "data": rows}

# --- 民眾物資申請 ---
@app.post("/api/request-supplies")
def request_supplies(data: SupplyRequestData):
    conn = get_db_connection()
    cur = conn.cursor()
    # 建立暫存需求表（若不存在會自動建）
    cur.execute("""
        CREATE TABLE IF NOT EXISTS supplies_requests (
            id SERIAL PRIMARY KEY,
            user_account VARCHAR(100),
            user_name VARCHAR(100),
            district VARCHAR(50),
            item_name VARCHAR(100),
            quantity INT,
            contact_phone VARCHAR(50),
            status VARCHAR(50) DEFAULT '處理中',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute(
        """
        INSERT INTO supplies_requests (user_account, user_name, district, item_name, quantity, contact_phone)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (data.account, data.name, data.district, data.item_name, data.quantity, data.contact_phone)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "success", "message": "物資申請已送出至社區端"}