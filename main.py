import os
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(docs_url="/docs", redoc_url="/redoc")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000/","http://127.0.0.1:5500","http://localhost:8080/","http://localhost:5500/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_PATH = "D:\GoaRound\my-first-project\imagetest"
# BASE_PATH = r"\\192.168.1.254\ftp_access_only\GNSS\pic_stations"

@app.api_route("/api/latest-image/{station_name}", methods=["GET"])
async def get_latest_station_image(station_name: str):
    try:
        # 1. หาวันที่ปัจจุบันเพื่อระบุปี (เช่น 2026)
        current_year = str(datetime.now().year)
        
        # 2. ประกอบ Path: pic_stations / ชื่อสถานี / ปีปัจจุบัน
        target_folder = Path(BASE_PATH) / station_name / current_year
        
        # 3. เช็คว่ามีโฟลเดอร์สถานีนี้และปีนี้จริงไหม
        if not target_folder.exists():
            raise HTTPException(status_code=404, detail=f"ไม่พบโฟลเดอร์ของสถานี {station_name} ในปี {current_year}")

        # 4. หาไฟล์ .jpg ทั้งหมด
        files = list(target_folder.glob("*.jpg"))
        
        if not files:
            raise HTTPException(status_code=404, detail="ไม่พบไฟล์รูปภาพในโฟลเดอร์นี้")

        # 5. คัดเลือกไฟล์ที่ใหม่ที่สุด (Latest Modified)
        latest_file = max(files, key=os.path.getmtime)

        # 6. ส่งรูปกลับไป
        return FileResponse(latest_file)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาด: {str(e)}")