from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras
import os

app = FastAPI(title="臺北市智慧淹水預警系統 API")

# 掛載靜態檔案 (CSS, JS)
# app.mount("/static", StaticFiles(directory="static"), name="static")

# 雲端 Neon PostgreSQL 連線字串
DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL", 
    "postgresql://neondb_owner:npg_BbAq2rUeTQD9@ep-sweet-dawn-azygay6t.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
)

def get_db_connection():
    return psycopg2.connect(DB_CONNECTION_STRING, cursor_factory=psycopg2.extras.RealDictCursor)

# --- 資料模型 (Pydantic Schemas) ---
class RegisterSchema(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[str] = "citizen"

class LoginSchema(BaseModel):
    username: str
    password: str

class DisasterReportSchema(BaseModel):
    user_id: Optional[int] = None
    region: str
    description: str

class SupplyRequestSchema(BaseModel):
    community_name: str
    item_name: str
    quantity: int

# --- API Routes ---

@app.get("/", response_class=HTMLResponse)
def read_root():
    return FileResponse("templates/index.html")

# 1. 讀取氣象與水文即時監測資料 (對接 flood_summary 表格)
@app.get("/api/flood-data")
def get_flood_data():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # 精準查詢 flood_summary 資料表
        cursor.execute("SELECT * FROM flood_summary ORDER BY id ASC;")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"status": "success", "count": len(rows), "data": rows}
    except Exception as e:
        if conn:
            conn.close()
        return {"status": "error", "message": str(e)}

# 2. 民眾端 - 災情通報 API
@app.post("/api/disaster-report")
def report_disaster(data: DisasterReportSchema):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS disaster_reports (
                id SERIAL PRIMARY KEY,
                user_id INT,
                region VARCHAR(50),
                description TEXT,
                status VARCHAR(20) DEFAULT '待處理',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute(
            "INSERT INTO disaster_reports (user_id, region, description) VALUES (%s, %s, %s);",
            (data.user_id, data.region, data.description)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "災情通報已成功送出！應變中心將儘速處理。"}
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": f"通報失敗: {str(e)}"}

# 3. 社區物資端 - 物資清單與需求申請 API
@app.get("/api/supplies")
def get_supplies():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS supplies (
                id SERIAL PRIMARY KEY,
                community_name VARCHAR(100),
                item_name VARCHAR(100),
                quantity INT,
                status VARCHAR(20) DEFAULT '儲備中',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cursor.execute("SELECT * FROM supplies ORDER BY id DESC;")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"status": "success", "data": rows}
    except Exception as e:
        if conn:
            conn.close()
        return {"status": "error", "message": str(e)}

@app.post("/api/supplies")
def request_supply(data: SupplyRequestSchema):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS supplies (
                id SERIAL PRIMARY KEY,
                community_name VARCHAR(100),
                item_name VARCHAR(100),
                quantity INT,
                status VARCHAR(20) DEFAULT '申請中',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cursor.execute(
            "INSERT INTO supplies (community_name, item_name, quantity, status) VALUES (%s, %s, %s, '申請中');",
            (data.community_name, data.item_name, data.quantity)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "社區物資需求已成功提交至調度中心！"}
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": f"申請失敗: {str(e)}"}

# 4. 會員註冊 API (對應 users 資料表)
@app.post("/api/register")
def register_user(data: RegisterSchema):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE username = %s;", (data.username,))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return {"status": "error", "message": "此帳號已被註冊！"}
        
        insert_query = """
            INSERT INTO users (username, password_hash, name, email, role, region_code) 
            VALUES (%s, %s, %s, %s, %s, 'TPE');
        """
        cursor.execute(insert_query, (data.username, data.password, data.username, data.email or data.username, data.role or 'citizen'))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "註冊成功！請重新登入。"}
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": f"註冊失敗: {str(e)}"}

# 5. 會員登入 API
@app.post("/api/login")
def login_user(data: LoginSchema):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id, username, name, role FROM users WHERE username = %s AND password_hash = %s;", 
            (data.username, data.password)
        )
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if user:
            display_name = user.get("name") or user.get("username")
            return {
                "status": "success", 
                "message": "登入成功！", 
                "username": display_name,
                "role": user.get("role", "citizen")
            }
        else:
            return {"status": "error", "message": "帳號或密碼錯誤！"}
    except Exception as e:
        if conn:
            conn.close()
        return {"status": "error", "message": str(e)}