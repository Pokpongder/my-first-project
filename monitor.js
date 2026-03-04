// monitor.js - Satellite Monitor WebSocket and Chart logic

var activeMonitors = {};

class SatelliteMonitor {
    constructor(stationName) {
        this.stationName = stationName;
        this.socket = null;
        this.chart = null;
        this.lastTime = null;
        this.data = {
            labels: [],
            datasets: [
                { label: 'GPS', data: [], borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.5)', tension: 0.1, borderWidth: 2 },
                { label: 'GLONASS', data: [], borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.5)', tension: 0.1, borderDash: [5, 5], borderWidth: 2 },
                { label: 'Galileo', data: [], borderColor: 'rgba(255, 206, 86, 1)', backgroundColor: 'rgba(255, 206, 86, 0.5)', tension: 0.1, borderDash: [2, 2], borderWidth: 2 },
                { label: 'BeiDou', data: [], borderColor: 'rgba(75, 192, 192, 1)', backgroundColor: 'rgba(75, 192, 192, 0.5)', tension: 0.1, borderDash: [10, 5], borderWidth: 2 }
            ]
        };

        this.createWindow();
        this.initChart();
        this.connect();
    }

    createWindow() {
        var modalId = `sat-modal-${this.stationName}`;
        var div = document.createElement('div');
        div.id = modalId;
        div.className = 'sat-modal';
        div.style.display = 'flex';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';

        div.innerHTML = `
            <div id="${modalId}-header" class="sat-modal-header">
                <span class="sat-modal-title">📡 Satellite Monitor - ${this.stationName}</span>
                <div class="sat-modal-controls">
                    <button class="min-btn">-</button>
                    <button class="close-btn">X</button>
                </div>
            </div>
            <div id="${modalId}-content" class="sat-modal-content">
                <div class="chart-container">
                    <canvas id="satChart-${this.stationName}"></canvas>
                </div>
                <div id="sat-log-${this.stationName}" class="sat-log-container">
                    <div class="log-entry">Waiting for connection...</div>
                </div>
            </div>
        `;

        document.body.appendChild(div);

        div.querySelector('.close-btn').onclick = () => this.close();
        div.querySelector('.min-btn').onclick = () => this.minimize();

        div.onmousedown = () => {
            document.querySelectorAll('.sat-modal').forEach(m => m.style.zIndex = 2000);
            div.style.zIndex = 2001;
        };

        window.makeDraggable(div, `${modalId}-header`);
    }

    initChart() {
        var ctx = document.getElementById(`satChart-${this.stationName}`).getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: this.data,
            options: {
                scales: { y: { beginAtZero: true, suggestedMax: 15 } },
                elements: { point: { radius: 0 } },
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { usePointStyle: false, boxWidth: 20 } } },
                interaction: { mode: 'index', intersect: false },
            }
        });
    }

    connect() {
        var apiHost = window.location.hostname;
        var wsUrl = `ws://${apiHost}:8000/ws/sat-data/${this.stationName}`;
        this.log("Connecting...");
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => this.log("Connected!");
        this.socket.onmessage = (event) => {
            var data = JSON.parse(event.data);
            if (data.status === "connected") return;
            if (data.error) {
                this.log("Error: " + data.error);
                return;
            }

            if (data.time && data.sats) {
                if (this.lastTime === data.time) return;
                this.lastTime = data.time;

                this.log(`[${data.time}] GPS:${data.sats.GPS} GLO:${data.sats.GLONASS} GAL:${data.sats.Galileo} BDS:${data.sats.BeiDou}`);

                this.data.labels.push(data.time);
                this.data.datasets[0].data.push(data.sats.GPS);
                this.data.datasets[1].data.push(data.sats.GLONASS);
                this.data.datasets[2].data.push(data.sats.Galileo);
                this.data.datasets[3].data.push(data.sats.BeiDou);

                if (this.data.labels.length > 100) {
                    this.data.labels.shift();
                    this.data.datasets.forEach(ds => ds.data.shift());
                }
                this.chart.update('none');
            }
        };

        this.socket.onclose = () => this.log("Disconnected.");
        this.socket.onerror = (err) => {
            this.log("WebSocket Error.");
            console.error(err);
        };
    }

    log(msg) {
        var div = document.getElementById(`sat-log-${this.stationName}`);
        if (!div) return;
        var isScrolledToBottom = div.scrollHeight - div.clientHeight <= div.scrollTop + 50;

        var entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerText = msg;
        div.appendChild(entry);

        if (isScrolledToBottom) div.scrollTop = div.scrollHeight;
    }

    minimize() {
        var modal = document.getElementById(`sat-modal-${this.stationName}`);
        var content = document.getElementById(`${modal.id}-content`);

        if (content.style.display !== 'none') {
            content.style.display = 'none';
            modal.dataset.prevHeight = modal.style.height;
            modal.style.height = 'auto';
            modal.style.minHeight = '0px';
            modal.style.resize = 'none';
        } else {
            content.style.display = 'flex';
            modal.style.height = modal.dataset.prevHeight || 'auto';
            modal.style.minHeight = '100px';
            modal.style.resize = 'both';
        }
    }

    close() {
        if (this.socket) this.socket.close();
        var modal = document.getElementById(`sat-modal-${this.stationName}`);
        if (modal) modal.remove();
        delete activeMonitors[this.stationName];
    }
}

// Ensure function is attached to window to be accessible from map.js
window.openSatelliteMonitor = function (stationName) {
    if (activeMonitors[stationName]) {
        var modal = document.getElementById(`sat-modal-${stationName}`);
        if (modal) {
            document.querySelectorAll('.sat-modal').forEach(m => m.style.zIndex = 2000);
            modal.style.zIndex = 2001;
        }
        return;
    }
    activeMonitors[stationName] = new SatelliteMonitor(stationName);
}

window.makeDraggable = function (element, headerId) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    var header = document.getElementById(headerId);

    if (header) {
        header.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        if (element.style.transform.includes('translate')) {
            var rect = element.getBoundingClientRect();
            element.style.transform = 'none';
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
        }

        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;

        document.querySelectorAll('.sat-modal').forEach(m => m.style.zIndex = 2000);
        element.style.zIndex = 2001;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
