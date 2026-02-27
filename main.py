import os
import shutil
import asyncio
import socket
import base64
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pyrtcm import RTCMReader
import json
import time
import threading
from dotenv import load_dotenv

load_dotenv()


#NTRIP Caster Config 
NTRIP_CAST = os.getenv("NTRIP_CAST", "161.246.18.204")
NTRIP_PORT = int(os.getenv("NTRIP_PORT", 2101))
NTRIP_USER = os.getenv("NTRIP_USER", "")
NTRIP_PASSWORD = os.getenv("NTRIP_PASSWORD", "")
NTRIP_TIMEOUT = int(os.getenv("NTRIP_TIMEOUT", 5))

ALL_MOUNTPOINTS = ["CHMA", "CADT", "KMIT6", "STFD", "RUT1", "CPN1", "NUO2", "ITC0", "HUEV", "KKU0","NKRM", "NKNY", "CHMA", "DPT9", "LPBR", "CHAN", "CNBR", "SISK", "NKSW", "SOKA",
                    "SRTN", "UDON", "SPBR", "UTTD", "PJRK","CM01"]

def check_ntrip_mountpoint(mountpoint: str) -> str:
    """
    ลองเชื่อมต่อ ntripcaster และรับ RTCM data
    Return "green" ถ้าเชื่อมต่อสำเร็จและมี data, "red" ถ้าไม่ได้
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(NTRIP_TIMEOUT)

    try:
        sock.connect((NTRIP_CAST, NTRIP_PORT))
    except Exception as e:
        print(f"[{mountpoint}] ❌ Connection Failed: {e}")
        return "red"

    auth_str = f"{NTRIP_USER}:{NTRIP_PASSWORD}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()

    headers = (
        f"GET /{mountpoint} HTTP/1.0\r\n"
        f"User-Agent: NTRIP Python Client\r\n"
        f"Authorization: Basic {auth_b64}\r\n"
        f"Accept: */*\r\n"
        f"Connection: close\r\n"
        "\r\n"
    )

    try:
        sock.sendall(headers.encode())

        # อ่าน Header Response
        response = b""
        while True:
            chunk = sock.recv(1)
            if not chunk:
                break
            response += chunk
            if b"\r\n\r\n" in response:
                break

        header_str = response.decode(errors='ignore')

        if "ICY 200 OK" not in header_str and "HTTP/1.0 200 OK" not in header_str:
            print(f"[{mountpoint}] ❌ Auth/Mount Failed: {header_str.strip()}")
            return "red"

        # ลองอ่าน data สักนิดเพื่อยืนยันว่ามี stream จริง
        data = sock.recv(1024)
        if data and len(data) > 0:
            print(f"[{mountpoint}] ✅ RTCM data received ({len(data)} bytes)")
            return "green"
        else:
            print(f"[{mountpoint}] ⚠️ Connected but no data")
            return "red"

    except socket.timeout:
        print(f"[{mountpoint}] ⚠️ Timeout waiting for data")
        return "red"
    except Exception as e:
        print(f"[{mountpoint}] ⚠️ Error: {e}")
        return "red"
    finally:
        sock.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown (nothing specific needed)

app = FastAPI(docs_url="/docs", redoc_url="/redoc", lifespan=lifespan)

origins = ["*"] # Allow all origins for local network access

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Last-Modified"],
)

# --- NTRIP Status Endpoints ---
@app.get("/ntrip-status/{mountpoint}")
async def get_ntrip_status(mountpoint: str):
    """เช็คสถานะการเชื่อมต่อ RTCM ของสถานีเดียว"""
    loop = asyncio.get_event_loop()
    status = await loop.run_in_executor(None, check_ntrip_mountpoint, mountpoint)
    return JSONResponse({"mountpoint": mountpoint, "status": status})


@app.get("/ntrip-status-all")
async def get_all_ntrip_status():
    """เช็คสถานะการเชื่อมต่อ RTCM ของทุกสถานีพร้อมกัน"""
    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, check_ntrip_mountpoint, mp) for mp in ALL_MOUNTPOINTS]
    results = await asyncio.gather(*tasks)
    statuses = {mp: status for mp, status in zip(ALL_MOUNTPOINTS, results)}
    return JSONResponse(statuses)


# --- WebSocket for Satellite Monitoring (Broadcaster Pattern) ---
class SatelliteMonitorManager:
    def __init__(self, mountpoint: str):
        self.mountpoint = mountpoint
        self.active_wevbsockets: list[WebSocket] = []
        self.stats = {
            "GPS": 0, "GLONASS": 0, "Galileo": 0, "BeiDou": 0,
            "connected": False,
            "error": None
        }
        self.stop_event = threading.Event()
        self.thread = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_wevbsockets.append(websocket)
        print(f"[Broadcaster] Client connected to {self.mountpoint}. Total clients: {len(self.active_wevbsockets)}")

        # Start the background thread if it's the first connection
        if len(self.active_wevbsockets) == 1:
            self.stop_event.clear()
            self.stats["error"] = None
            self.thread = threading.Thread(target=self._start_reading_ntrip, daemon=True)
            self.thread.start()

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_wevbsockets:
            self.active_wevbsockets.remove(websocket)
        print(f"[Broadcaster] Client disconnected from {self.mountpoint}. Total clients: {len(self.active_wevbsockets)}")

        # Stop the background thread if no clients are listening
        if len(self.active_wevbsockets) == 0:
            self.stop_event.set()
            if self.thread:
                self.thread.join(timeout=2)
                self.thread = None
            print(f"[Broadcaster] Shutting down connection for {self.mountpoint}")

    async def broadcast(self, data: dict):
        for ws in self.active_wevbsockets:
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[Broadcaster] Error sending to a client: {e}")
                # Do not immediately disconnect here, wait for WebSocketDisconnect

    def _start_reading_ntrip(self):
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect((NTRIP_CAST, NTRIP_PORT))
            
            auth_str = f"{NTRIP_USER}:{NTRIP_PASSWORD}"
            auth_b64 = base64.b64encode(auth_str.encode()).decode()
            headers = (
                f"GET /{self.mountpoint} HTTP/1.0\r\n"
                f"User-Agent: NTRIP Python Monitor\r\n"
                f"Authorization: Basic {auth_b64}\r\n"
                f"Accept: */*\r\n"
                f"Connection: close\r\n"
                "\r\n"
            )
            sock.sendall(headers.encode())

            response = b""
            while not self.stop_event.is_set():
                chunk = sock.recv(1)
                if not chunk: break
                response += chunk
                if b"\r\n\r\n" in response: break
            
            header_str = response.decode(errors='ignore')
            if "200 OK" not in header_str:
                self.stats["error"] = f"Connection failed: {header_str.strip()}"
                return

            self.stats["connected"] = True
            print(f"[Broadcaster Thread] {self.mountpoint} Connected!")

            ntrip_reader = RTCMReader(sock)
            for (raw_data, parsed_data) in ntrip_reader:
                if self.stop_event.is_set(): break
                if parsed_data:
                    msg_id = parsed_data.identity
                    if msg_id == "1077": self.stats["GPS"] = bin(parsed_data.DF394).count('1')
                    elif msg_id == "1087": self.stats["GLONASS"] = bin(parsed_data.DF394).count('1')
                    elif msg_id == "1097": self.stats["Galileo"] = bin(parsed_data.DF394).count('1')
                    elif msg_id == "1127": self.stats["BeiDou"] = bin(parsed_data.DF394).count('1')

        except Exception as e:
            print(f"[Broadcaster Thread] Error for {self.mountpoint}: {e}")
            self.stats["error"] = str(e)
        finally:
            if sock: sock.close()
            self.stats["connected"] = False
            print(f"[Broadcaster Thread] {self.mountpoint} Stopped.")

active_monitors: dict[str, SatelliteMonitorManager] = {}

@app.websocket("/ws/sat-data/{mountpoint}")
async def websocket_endpoint(websocket: WebSocket, mountpoint: str):
    if mountpoint not in active_monitors:
        active_monitors[mountpoint] = SatelliteMonitorManager(mountpoint)
    
    manager = active_monitors[mountpoint]
    await manager.connect(websocket)

    try:
        # Wait up to 10s for the background thread to connect
        for _ in range(10):
            if manager.stats["connected"] or manager.stats["error"]: break
            await asyncio.sleep(1)
        
        if manager.stats["error"]:
            await websocket.send_json({"error": manager.stats["error"]})
            # Do not return here, we still want to gracefully handle disconnect
        elif not manager.stats["connected"]:
            await websocket.send_json({"error": "Timeout connecting to NTRIP Caster"})
        else:
            await websocket.send_json({"status": "connected", "message": f"Monitoring {mountpoint}..."})

        # Keep connection alive while broadcasting data handling happens via another task
        # Actually, in FastAPI, one websocket connection loop is typical.
        # So we create a tight loop here to poll the `manager.stats` every 1 second
        # If the manager is running, it will update stats.
        last_sent_time = None
        while True:
            await asyncio.sleep(1)
            
            # If an error happens while running
            if manager.stats["error"]:
                await websocket.send_json({"error": manager.stats["error"]})
                break

            current_time = datetime.now().strftime("%H:%M:%S")
            if current_time != last_sent_time:
                last_sent_time = current_time
                data = {
                    "time": current_time,
                    "sats": {k: v for k, v in manager.stats.items() if k in ["GPS", "GLONASS", "Galileo", "BeiDou"]}
                }
                await websocket.send_json(data)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS] Exception for {mountpoint}: {e}")
        manager.disconnect(websocket)


