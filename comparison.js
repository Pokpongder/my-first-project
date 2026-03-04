// comparison.js - Handles the Comparison Wizard and Chart Sync Logic

var activeComparators = {};

window.openComparisonWizard = function (baseStationName) {
    if (document.getElementById('comparison-wizard-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'comparison-modal-overlay';
    overlay.id = 'comparison-wizard-overlay';

    var content = document.createElement('div');
    content.className = 'comparison-content';
    content.style.width = '600px';
    content.style.maxHeight = '90vh';

    content.innerHTML = `
        <h3>Compare with ${baseStationName}</h3>
        
        <div style="display: flex; gap: 20px; height: 300px;">
            <div style="flex: 1; display: flex; flex-direction: column;">
                <p style="margin-top:0; font-weight:bold;">1. Select Station</p>
                <input type="text" id="station-search" placeholder="Search..." style="margin-bottom: 5px; padding: 5px; width: 100%; box-sizing: border-box;">
                <ul class="station-select-list" id="compare-station-list" style="border: 1px solid #ccc; flex: 1;"></ul>
            </div>

            <div style="flex: 1; display: flex; flex-direction: column;">
                <p style="margin-top:0; font-weight:bold;">2. Select Systems</p>
                <div class="system-checkbox-group" style="margin-top: 5px; flex: 1;">
                    <label class="system-checkbox-label"><input type="checkbox" value="GPS" checked> GPS</label>
                    <label class="system-checkbox-label"><input type="checkbox" value="GLONASS" checked> GLONASS</label>
                    <label class="system-checkbox-label"><input type="checkbox" value="Galileo" checked> Galileo</label>
                    <label class="system-checkbox-label"><input type="checkbox" value="BeiDou" checked> BeiDou</label>
                </div>
                
                <div style="margin-top: auto; text-align: right;">
                    <button class="btn-secondary" id="wizard-cancel-btn">Cancel</button>
                    <button class="btn-primary" id="wizard-start-btn" disabled>Start Comparison</button>
                </div>
            </div>
        </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeWizard();
    });

    var selectedTargetStation = null;
    var startBtn = document.getElementById('wizard-start-btn');
    var list = document.getElementById('compare-station-list');
    var searchInput = document.getElementById('station-search');

    function renderStationList(filterText = '') {
        list.innerHTML = '';
        stations.forEach(s => {
            if (s.name === baseStationName) return;
            if (filterText && !s.name.toLowerCase().includes(filterText.toLowerCase()) && !s.code.toLowerCase().includes(filterText.toLowerCase())) return;

            var li = document.createElement('li');
            li.className = 'station-select-item';
            if (s.name === selectedTargetStation) {
                li.style.backgroundColor = '#e2e6ea';
                li.style.fontWeight = 'bold';
            }
            li.innerHTML = `<span>${s.name}</span> <span style="color:#888; font-size:12px;">${s.code}</span>`;
            li.onclick = () => {
                selectedTargetStation = s.name;
                startBtn.disabled = false;
                renderStationList(filterText);
            };
            list.appendChild(li);
        });
    }

    renderStationList();
    searchInput.oninput = (e) => renderStationList(e.target.value);
    document.getElementById('wizard-cancel-btn').onclick = closeWizard;

    startBtn.onclick = () => {
        var selectedSystems = [];
        document.querySelectorAll('.system-checkbox-group input:checked').forEach(cb => selectedSystems.push(cb.value));

        if (!selectedTargetStation) return alert("Please select a station to compare with.");
        if (selectedSystems.length === 0) return alert("Please select at least one satellite system.");

        startComparison(baseStationName, selectedTargetStation, selectedSystems);
        closeWizard();
    };

    function closeWizard() {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    }
}

function startComparison(station1, station2, systems) {
    var id = `${station1}-${station2}`;
    if (activeComparators[id]) return;
    activeComparators[id] = new StationComparator(station1, station2, systems);
}

class StationComparator {
    constructor(station1, station2, systems) {
        this.s1 = station1;
        this.s2 = station2;
        this.systems = systems;
        this.id = `${station1}-${station2}`;

        this.socket1 = null;
        this.socket2 = null;
        this.chart = null;

        this.data = {
            labels: [],
            datasets: []
        };

        this.colorsS1 = { 'GPS': 'rgba(255, 99, 132, 1)', 'GLONASS': 'rgba(54, 162, 235, 1)', 'Galileo': 'rgba(255, 206, 86, 1)', 'BeiDou': 'rgba(75, 192, 192, 1)' };
        this.colorsS2 = { 'GPS': 'rgba(153, 102, 255, 1)', 'GLONASS': 'rgba(46, 204, 113, 1)', 'Galileo': 'rgba(230, 126, 34, 1)', 'BeiDou': 'rgba(255, 105, 180, 1)' };

        this.systems.forEach(sys => {
            // Station 1 (Solid, Primary)
            this.data.datasets.push({
                label: `${this.s1} - ${sys}`,
                data: [], // Will hold {x: "HH:MM:SS", y: value} objects
                borderColor: this.colorsS1[sys],
                backgroundColor: this.colorsS1[sys].replace('1)', '0.5)'),
                tension: 0.1,
                borderWidth: 2,
                pointRadius: 0
            });

            // Station 2 (Dashed, Distinct Color)
            this.data.datasets.push({
                label: `${this.s2} - ${sys}`,
                data: [], // Will hold {x: "HH:MM:SS", y: value} objects
                borderColor: this.colorsS2[sys],
                backgroundColor: this.colorsS2[sys].replace('1)', '0.5)'),
                tension: 0.1,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0
            });
        });

        this.createWindow();
        this.initChart();
        this.connect();
    }

    createWindow() {
        var modalId = `comp-modal-${this.id}`;
        var div = document.createElement('div');
        div.id = modalId;
        div.className = 'sat-modal';
        div.style.width = '600px';
        div.style.display = 'flex';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';

        div.innerHTML = `
            <div id="${modalId}-header" class="sat-modal-header" style="background: #6f42c1;">
                <span class="sat-modal-title">⚔️ Compare: ${this.s1} vs ${this.s2}</span>
                <div class="sat-modal-controls">
                    <button class="close-btn">X</button>
                </div>
            </div>
            <div id="${modalId}-content" class="sat-modal-content">
                <div class="chart-container" style="height: 300px;">
                    <canvas id="compChart-${this.id}"></canvas>
                </div>
                <div style="font-size:12px; margin-top:5px; text-align:center; color:#555;">
                    Live Data Comparison (${this.systems.join(', ')})
                </div>
            </div>
        `;

        document.body.appendChild(div);

        div.querySelector('.close-btn').onclick = () => this.close();
        div.onmousedown = () => {
            document.querySelectorAll('.sat-modal').forEach(m => m.style.zIndex = 2000);
            div.style.zIndex = 2001;
        };

        window.makeDraggable(div, `${modalId}-header`);
    }

    initChart() {
        var ctx = document.getElementById(`compChart-${this.id}`).getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: this.data,
            options: {
                scales: {
                    y: { beginAtZero: true, suggestedMax: 15 },
                    x: {
                        type: 'category',
                        display: true, // Displaying it now helps verify sync
                        ticks: { maxTicksLimit: 10 }
                    }
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { usePointStyle: true, boxWidth: 10 } }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                animation: false
            }
        });
    }

    connect() {
        var apiHost = window.location.hostname;
        this.socket1 = new WebSocket(`ws://${apiHost}:8000/ws/sat-data/${this.s1}`);
        this.socket1.onmessage = (e) => this.handleMessage(e, this.s1);

        this.socket2 = new WebSocket(`ws://${apiHost}:8000/ws/sat-data/${this.s2}`);
        this.socket2.onmessage = (e) => this.handleMessage(e, this.s2);
    }

    handleMessage(event, stationName) {
        var data = JSON.parse(event.data);
        if (!data.sats || !data.time) return;

        // Ensure the global labels array knows about this timestamp
        if (!this.data.labels.includes(data.time)) {
            this.data.labels.push(data.time);
            this.data.labels.sort(); // Very basic sort assuming HH:MM:SS within same day
        }

        // Keep maximum 50 labels window
        if (this.data.labels.length > 50) {
            var removedLabel = this.data.labels.shift();
            // Cleanup old data points from all datasets
            this.data.datasets.forEach(ds => {
                ds.data = ds.data.filter(point => point.x !== removedLabel && point.x >= this.data.labels[0]);
            });
        }

        this.updateChartData(stationName, data);
    }

    updateChartData(stationName, data) {
        this.systems.forEach((sys, i) => {
            var val = data.sats[sys];
            var datasetIndex = (i * 2) + (stationName === this.s1 ? 0 : 1);

            // Push an {x, y} coordinate object instead of just y.
            // This tells Chart.js EXACTLY where on the category axis to plot this.
            this.data.datasets[datasetIndex].data.push({
                x: data.time,
                y: val
            });
        });

        this.chart.update('none');
    }

    close() {
        if (this.socket1) this.socket1.close();
        if (this.socket2) this.socket2.close();

        var modal = document.getElementById(`comp-modal-${this.id}`);
        if (modal) modal.remove();

        delete activeComparators[this.id];
    }
}
