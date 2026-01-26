

// 1. สร้างแผนที่
var bounds = [[-90, -180], [90, 180]];

var map = L.map('map', {
    maxBounds: bounds,       // ห้ามลากออกนอกขอบเขต
    maxBoundsViscosity: 1.0, // ความหนืดที่ขอบ (1.0 = แข็ง, ลากออกไม่ได้เลย)
    minZoom: 2,               // ห้าม Zoom out จนเล็กเกินไป (เห็นโลกหลายใบ)
    zoomControl: false       // Disable default zoom control
}).setView([13.0, 101.5], 6);


// Reset Button Logic
document.getElementById('reset-btn').onclick = function () {
    map.setView([13.0, 101.5], 6);
    // Also close sidebar if open? Maybe good UX
    closeSidebar();
};

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19.5,
    noWrap: true,            // ห้ามแสดงแผนที่ซ้ำ (โลกใบเดียว)
    bounds: bounds
}).addTo(map);

// 3. ข้อมูลสถานี
var stations = [
    { name: "CHMA", code: "CHMA", lat: 18.8000, lon: 98.9500 },
    { name: "CADT", code: "CADT", lat: 11.6545, lon: 104.9116 },
    { name: "KMI6", code: "KMI6", lat: 13.7278, lon: 100.7724 },
    { name: "STFD", code: "STFD", lat: 13.7356, lon: 100.6611 },
    { name: "RUTI", code: "RUTI", lat: 14.9889, lon: 102.1206 },
    { name: "CPN1", code: "CPN1", lat: 10.7247, lon: 99.3744 },
    { name: "NUO2", code: "NUO2", lat: 17.9383, lon: 102.6261 },
    { name: "ITC0", code: "ITC0", lat: 11.5705, lon: 104.8994 },
    { name: "HUEV", code: "HUEV", lat: 16.4155, lon: 107.5687 },
    { name: "KKU0", code: "KKU0", lat: 16.4721, lon: 102.8260 }

];

var customIcon = L.icon({
    iconUrl: 'image/gnss-antenna-svgrepo-com (1).svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// 4. Sidebar Logic
var sidebar = document.getElementById('sidebar');
var closeSidebarBtn = document.getElementById('close-sidebar');
var sidebarContent = document.getElementById('sidebar-content');

function openSidebar(s) {
    sidebarContent.innerHTML = `
        <h3>${s.name} (${s.code}) <span id="status-dot-${s.code}" class="status-dot"></span></h3>
        <p class="station-coords">Lat: ${s.lat.toFixed(4)}, Lon: ${s.lon.toFixed(4)}</p>
        <ul class="station-data-list">
            <li>
                <a href="#" onclick="toggleIonosphere(event)">1. Ionosphere &#9662;</a>
                <div id="ionosphere-content" class="accordion-content">
                    <br>
                     <img src="http://localhost:8000/ionospherebystation/${s.name}/latest.jpg" alt="${s.name} View" class="station-image" onclick="openLightbox(this.src)" onerror="this.parentElement.style.display='none'">
                </div>
            </li>
        </ul>
    `;
    sidebar.classList.add('open');
    checkStationStatus(s.name, s.code);
}

function checkStationStatus(stationName, stationCode) {
    var dot = document.getElementById('status-dot-' + stationCode);
    if (!dot) return;

    // Reset classes to avoid accumulation
    dot.classList.remove('status-red', 'status-green', 'status-orange');

    // ใช้ IP แทน localhost ถ้าจะเปิดจากเครื่องอื่น หรือใช้ Relative Path ถ้าอยู่บน Server เดียวกัน
    // กรณีนี้ไฟล์ static อยู่ที่ /ionospherebystation/STATION/latest.jpg
    // ถ้าใช้ Live Server (port 5500) ก็จะเป็น http://127.0.0.1:5500/ionospherebystation/...
    // ถ้าใช้ uvicorn (port 8000) ก็จะเป็น http://localhost:8000/ionospherebystation/...
    // เพื่อความยืดหยุ่น ลองใช้ URL เต็มไปยัง Port 8000 (เพราะเรา mount static ไว้) หรือ Relative ถ้าไฟล์อยู่ที่เดียวกัน
    // ผู้ใช้บอกว่า "เช็คจากไฟล์ในเครื่อง" -> สมมติว่า frontend/backend รันคู่กัน

    // ลองใช้ URL ของ Backend (Port 8000) เพื่อความแน่นอนเรื่องการอ่านไฟล์ที่ Python สร้าง
    var url = `http://localhost:8000/ionospherebystation/${stationName}/latest.jpg`;
    // หรือถ้าอยากลองใช้ Relative Path (กรณี Deploy จริง):
    // var url = `ionospherebystation/${stationName}/latest.jpg`;

    console.log(`Checking status for ${stationName} at ${url}...`);

    fetch(url, { method: 'GET', cache: 'no-store' }) // Add no-store to prevent caching old image
        .then(response => {
            // 1. กรณีหาไฟล์ไม่เจอ (404 Not Found)
            if (!response.ok) {
                console.warn(`${stationName}: Response not OK (${response.status})`);
                dot.classList.add('status-red'); // 🔴 แดง: ไม่มีไฟล์
                return;
            }

            // 2. กรณีเจอไฟล์ (200 OK) 
            var lastModified = response.headers.get('Last-Modified');
            console.log(`${stationName}: Last-Modified header = ${lastModified}`);

            if (lastModified) {
                var fileDate = new Date(lastModified);
                var now = new Date();

                // เปรียบเทียบแค่วัน/เดือน/ปี (ตัดเวลาทิ้ง)
                if (fileDate.toDateString() === now.toDateString()) {
                    console.log(`${stationName}: Status GREEN (Updated today)`);
                    dot.classList.add('status-green'); // 🟢 เขียว: ปกติ (มาวันนี้)
                } else {
                    console.log(`${stationName}: Status ORANGE (Old data: ${fileDate.toDateString()})`);
                    dot.classList.add('status-orange'); // 🟠 ส้ม: ข้อมูลเก่า (ไม่อัปเดต)
                }
            } else {
                console.log(`${stationName}: Status GREEN (No Last-Modified header found, assuming OK)`);
                dot.classList.add('status-green');
            }
        })
        .catch(error => {
            // 3. กรณีเน็ตหลุด หรือ Server ดับ
            console.error(`${stationName}: Network Error:`, error);
            dot.classList.add('status-red'); //  แดง: เชื่อมต่อไม่ได้
        });
}

// Function to toggle Ionosphere section
window.toggleIonosphere = function (e) {
    e.preventDefault();
    var content = document.getElementById('ionosphere-content');
    if (content.style.maxHeight) {
        content.style.maxHeight = null;
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
    }
};

function closeSidebar() {
    sidebar.classList.remove('open');
}

closeSidebarBtn.onclick = closeSidebar;


stations.forEach(function (s) {
    // Remove bindPopup and use click event
    var marker = L.marker([s.lat, s.lon], { icon: customIcon }).addTo(map)
        .bindTooltip(`<b>${s.name} (${s.code})</b>`)
        .on('click', function () {
            openSidebar(s);
            // Center map on marker if desired, but maybe keep it simple for now
            map.setView([s.lat, s.lon], 10);
        });

    s.marker = marker; // เก็บ marker ไว้ใน object เพื่อเรียกใช้ภายหลัง
});

// 5. จัดการ Navbar และ Station List
var stationsBtn = document.getElementById('stations-btn');
var stationsList = document.getElementById('stations-list');

// สร้างลิสต์รายชื่อสถานี
stations.forEach(function (s) {
    var link = document.createElement('a');
    link.href = "#";
    link.textContent = s.name + " (" + s.code + ")";
    link.onclick = function (e) {
        e.preventDefault(); // ป้องกันการดีดขึ้นบนสุดของหน้า

        // เลื่อนแผนที่ไปหาสถานี และเปิด Sidebar
        map.setView([s.lat, s.lon], 10);
        openSidebar(s);

        // ปิด Dropdown
        stationsList.classList.remove('show');
    };
    stationsList.appendChild(link);
});

// Toggle การแสดงผล Dropdown
stationsBtn.onclick = function () {
    stationsList.classList.toggle('show');
};



// 6. Lightbox Functions
var lightbox = document.getElementById('lightbox');
var lightboxImg = document.getElementById('lightbox-img');
var captionText = document.getElementById('caption');
var closeLightboxBtn = document.getElementsByClassName("close-lightbox")[0];

window.openLightbox = function (src) {
    lightbox.style.display = "block";
    lightboxImg.src = src;
    // captionText.innerHTML = src.split('/').pop(); // Optional: Show filename
}

window.closeLightbox = function () {
    lightbox.style.display = "none";
}

// Close when clicking X
if (closeLightboxBtn) {
    closeLightboxBtn.onclick = function () {
        closeLightbox();
    }
}

// Close when clicking outside the image


// Better way: use addEventListener for the previous window click too, or just append logic here.
// Let's rewrite the window click handler to handle both.
document.addEventListener('click', function (event) {
    // Handle Dropdown close
    if (!event.target.matches('#stations-btn')) {
        if (stationsList.classList.contains('show')) {
            stationsList.classList.remove('show');
        }
    }

    // Handle Lightbox close (if clicking background)
    if (event.target == lightbox) {
        closeLightbox();
    }
});