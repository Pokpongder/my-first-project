// map.js - Core map initialization, sidebar, filters, and markers

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
    closeSidebar();
};

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19.5,
    noWrap: true,
    bounds: bounds
}).addTo(map);

// 3. ข้อมูลสถานี
var stations = [
    // --- Original Stations ---
    { name: "CM01", code: "KMITL", lat: 18.8000, lon: 98.9500 },
    { name: "CADT", code: "KMITL", lat: 11.6545, lon: 104.9116 },
    { name: "KMIT6", code: "KMITL", lat: 13.7278, lon: 100.7724 },
    { name: "STFD", code: "KMITL", lat: 13.7356, lon: 100.6611 },
    { name: "RUT1", code: "KMITL", lat: 14.9889, lon: 102.1206 },
    { name: "CPN1", code: "KMITL", lat: 10.7247, lon: 99.3744 },
    { name: "NUO2", code: "KMITL", lat: 18.0400, lon: 102.6347 },
    { name: "ITC0", code: "KMITL", lat: 11.5705, lon: 104.8994 },
    { name: "HUEV", code: "KMITL", lat: 16.4155, lon: 107.5687 },
    { name: "KKU0", code: "KMITL", lat: 16.4721, lon: 102.8260 },

    // --- DPT Stations ---
    { name: "NKSW", code: "DPT", lat: 15.690637, lon: 100.114112 },
    { name: "UTTD", code: "DPT", lat: 17.630094, lon: 100.096343 },
    { name: "CHAN", code: "DPT", lat: 12.610310, lon: 102.102411 },
    { name: "SPBR", code: "DPT", lat: 14.518875, lon: 100.130580 },
    { name: "DPT9", code: "DPT", lat: 13.756782, lon: 100.573200 },
    { name: "PJRK", code: "DPT", lat: 11.811621, lon: 99.796348 },
    { name: "SRTN", code: "DPT", lat: 9.132225, lon: 99.331361 },
    { name: "NKNY", code: "DPT", lat: 14.212003, lon: 101.202211 },
    { name: "SOKA", code: "DPT", lat: 7.206694, lon: 100.596121 },
    { name: "UDON", code: "DPT", lat: 17.412732, lon: 102.780704 },
    { name: "CNBR", code: "DPT", lat: 13.406019, lon: 100.997652 },
    { name: "NKRM", code: "DPT", lat: 14.992119, lon: 102.129470 },
    { name: "LPBR", code: "DPT", lat: 14.800907, lon: 100.651246 },
    { name: "SISK", code: "DPT", lat: 15.116122, lon: 104.285676 },
    { name: "CHMA", code: "DPT", lat: 18.84, lon: 98.97 }
];

var DPT_NAMES = ["NKRM", "NKNY", "DPT9", "LPBR", "CHAN", "CNBR", "SISK", "NKSW", "SOKA",
    "SRTN", "UDON", "SPBR", "UTTD", "PJRK", "CHMA"];

stations.forEach(function (s) {
    s.group = DPT_NAMES.includes(s.name) ? 'dpt' : 'kmitl';
});

function createStatusIcon(color) {
    return L.divIcon({
        className: 'marker-status-dot',
        html: `<div style="width:16px; height:16px; border-radius:50%; background:${color}; border:1px solid white; box-shadow:0 0 6px rgba(0,0,0,0.35);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12]
    });
}

var iconGray = createStatusIcon('#aaa');
var iconGreen = createStatusIcon('#2ecc71');
var iconRed = createStatusIcon('#e74c3c');

// --- Filter Logic ---
var currentFilter = 'all';

function applyFilter(group) {
    currentFilter = group;
    stations.forEach(function (s) {
        if (!s.marker) return;
        var el = s.marker.getElement();
        if (!el) return;

        if (group === 'all' || s.group === group) {
            el.classList.remove('marker-faded');
        } else {
            el.classList.add('marker-faded');
        }
    });
}

document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter(btn.dataset.filter);
    });
});

// 4. Sidebar Logic
var sidebar = document.getElementById('sidebar');
var closeSidebarBtn = document.getElementById('close-sidebar');
var sidebarContent = document.getElementById('sidebar-content');

function closeSidebar() {
    sidebar.classList.remove('open');
}
closeSidebarBtn.onclick = closeSidebar;

function openSidebar(s) {
    var info = STATION_INFO[s.name];
    var infoHtml = info ? `
        <ul class="station-info-list">
            <li><strong>Organization:</strong> ${info.Organization || '-'}</li>
            <li><strong>Country:</strong> ${info.Country || '-'}</li>
            <li><strong>Latitude:</strong> ${info.Latitude || '-'}</li>
            <li><strong>Longitude:</strong> ${info.Longitude || '-'}</li>
            <li><strong>Navigation:</strong> ${info.Navigation || '-'}</li>
            <li><strong>Format:</strong> ${info.Format || '-'}</li>
            <li><strong>Receiver:</strong> ${info.Receiver || '-'}</li>
        </ul>` : `<p style="color:red;">Info not found</p>`;

    sidebarContent.innerHTML = `
        <h3>${s.name} (${s.code}) <span id="status-dot-${s.name}" class="status-dot"></span></h3>
        <p class="station-coords">Lat: ${s.lat.toFixed(4)}, Lon: ${s.lon.toFixed(4)}</p>
        <div id="station-info-container">
            <h4>Station Info</h4>
            <div id="station-info-content">${infoHtml}</div>
        </div>
        <div id="station-actions-container" style="margin-top: 15px; display: flex; gap: 8px;">
            <button id="sat-monitor-btn" style="flex: 4;">Satellite Monitor</button>
            <button id="compare-station-btn" class="btn-secondary" style="flex: 1; padding: 10px; border-radius: 5px;">Compare</button>
        </div>
    `;
    sidebar.classList.add('open');
    checkStationStatus(s.name);

    document.getElementById('sat-monitor-btn').onclick = () => window.openSatelliteMonitor(s.name);
    document.getElementById('compare-station-btn').onclick = () => window.openComparisonWizard(s.name);
}

function checkStationStatus(stationName) {
    var dotSidebar = document.getElementById('status-dot-' + stationName);
    var dotNav = document.getElementById('status-dot-nav-' + stationName);
    var station = stations.find(s => s.name === stationName);

    function updateStatus(colorClass, markerIcon) {
        [dotSidebar, dotNav].forEach(dot => {
            if (dot) {
                dot.classList.remove('status-red', 'status-green', 'status-orange', 'status-gray');
                dot.classList.add(colorClass);
            }
        });
        if (station && station.marker) {
            station.marker.setIcon(markerIcon);
            station.marker.setZIndexOffset(colorClass === 'status-green' ? 1000 : 0);
            var el = station.marker.getElement();
            if (el && currentFilter !== 'all' && station.group !== currentFilter) {
                el.classList.add('marker-faded');
            }
        }
    }

    var apiHost = window.location.hostname;
    fetch(`http://${apiHost}:8000/ntrip-status/${stationName}`, { cache: 'no-store' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && data.status === 'green') updateStatus('status-green', iconGreen);
            else updateStatus('status-red', iconRed);
        })
        .catch(() => updateStatus('status-red', iconRed));
}

stations.forEach(function (s) {
    s.marker = L.marker([s.lat, s.lon], { icon: iconGray }).addTo(map)
        .bindTooltip(`<b>${s.name} (${s.code})</b>`)
        .on('click', function () {
            openSidebar(s);
            map.setView([s.lat, s.lon], 10);
        });
});

// 5. Navbar and Station List
var stationsBtn = document.getElementById('stations-btn');
var stationsList = document.getElementById('stations-list');

stations.forEach(function (s) {
    var link = document.createElement('a');
    link.href = "#";
    link.innerHTML = `${s.name} (${s.code}) <span id="status-dot-nav-${s.name}" class="status-dot status-gray"></span>`;
    link.onclick = function (e) {
        e.preventDefault();
        map.setView([s.lat, s.lon], 10);
        openSidebar(s);
        stationsList.classList.remove('show');
    };
    stationsList.appendChild(link);
    checkStationStatus(s.name);
});

stationsBtn.onclick = () => stationsList.classList.toggle('show');

document.addEventListener('click', function (event) {
    if (!event.target.matches('#stations-btn') && stationsList.classList.contains('show')) {
        stationsList.classList.remove('show');
    }
});
