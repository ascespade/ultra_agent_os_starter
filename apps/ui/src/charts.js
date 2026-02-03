// Professional Charts Library for Ultra Agent OS Dashboard
class UltraCharts {
  constructor() {
    this.colors = {
      primary: '#4a9eff',
      success: '#10b981',
      warning: '#f97316',
      error: '#ef4444',
      info: '#3b82f6',
      muted: '#64748b'
    };
    
    this.gradients = {
      primary: ['#667eea', '#764ba2'],
      success: ['#43e97b', '#38f9d7'],
      warning: ['#f093fb', '#f5576c'],
      error: ['#ff6b6b', '#ee5a24'],
      info: ['#4facfe', '#00f2fe']
    };
  }

  // Line Chart for time series data
  createLineChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const defaultOptions = {
      padding: 40,
      gridLines: true,
      showPoints: true,
      smooth: true,
      animation: true
    };

    const config = { ...defaultOptions, ...options };
    
    return new LineChart(ctx, data, config);
  }

  // Bar Chart for categorical data
  createBarChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const defaultOptions = {
      padding: 40,
      barWidth: 0.6,
      showValues: true,
      animation: true
    };

    const config = { ...defaultOptions, ...options };
    
    return new BarChart(ctx, data, config);
  }

  // Pie Chart for proportional data
  createPieChart(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const defaultOptions = {
      showLabels: true,
      showPercentages: true,
      animation: true
    };

    const config = { ...defaultOptions, ...options };
    
    return new PieChart(ctx, data, config);
  }

  // Gauge Chart for metrics
  createGaugeChart(canvasId, value, max, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const defaultOptions = {
      min: 0,
      max: max,
      thresholds: [
        { value: max * 0.3, color: this.colors.error },
        { value: max * 0.7, color: this.colors.warning },
        { value: max, color: this.colors.success }
      ],
      showValue: true,
      animation: true
    };

    const config = { ...defaultOptions, ...options };
    
    return new GaugeChart(ctx, value, config);
  }
}

// Line Chart Implementation
class LineChart {
  constructor(ctx, data, options) {
    this.ctx = ctx;
    this.data = data;
    this.options = options;
    this.padding = options.padding || 40;
    this.animationProgress = 0;
    
    this.init();
  }

  init() {
    if (this.options.animation) {
      this.animate();
    } else {
      this.draw();
    }
  }

  animate() {
    const duration = 1000;
    const startTime = Date.now();
    
    const animationLoop = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      this.animationProgress = Math.min(elapsed / duration, 1);
      
      this.draw();
      
      if (this.animationProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    };
    
    animationLoop();
  }

  draw() {
    const { width, height } = this.ctx.canvas;
    const chartWidth = width - 2 * this.padding;
    const chartHeight = height - 2 * this.padding;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    if (this.options.gridLines) {
      this.drawGrid(chartWidth, chartHeight);
    }
    
    // Draw axes
    this.drawAxes(chartWidth, chartHeight);
    
    // Draw data
    this.drawData(chartWidth, chartHeight);
    
    // Draw points
    if (this.options.showPoints) {
      this.drawPoints(chartWidth, chartHeight);
    }
  }

  drawGrid(chartWidth, chartHeight) {
    this.ctx.strokeStyle = '#e5e7eb';
    this.ctx.lineWidth = 0.5;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = this.padding + (chartHeight / 5) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding, y);
      this.ctx.lineTo(this.padding + chartWidth, y);
      this.ctx.stroke();
    }
    
    // Vertical grid lines
    for (let i = 0; i <= this.data.labels.length - 1; i++) {
      const x = this.padding + (chartWidth / (this.data.labels.length - 1)) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, this.padding);
      this.ctx.lineTo(x, this.padding + chartHeight);
      this.ctx.stroke();
    }
  }

  drawAxes(chartWidth, chartHeight) {
    this.ctx.strokeStyle = '#374151';
    this.ctx.lineWidth = 2;
    
    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.padding + chartHeight);
    this.ctx.lineTo(this.padding + chartWidth, this.padding + chartHeight);
    this.ctx.stroke();
    
    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.padding);
    this.ctx.lineTo(this.padding, this.padding + chartHeight);
    this.ctx.stroke();
  }

  drawData(chartWidth, chartHeight) {
    const datasets = this.data.datasets;
    const maxValue = Math.max(...datasets.flatMap(ds => ds.data));
    
    datasets.forEach((dataset, datasetIndex) => {
      this.ctx.strokeStyle = dataset.color || '#4a9eff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      
      dataset.data.forEach((value, index) => {
        const x = this.padding + (chartWidth / (this.data.labels.length - 1)) * index;
        const y = this.padding + chartHeight - (value / maxValue) * chartHeight * this.animationProgress;
        
        if (index === 0) {
          this.ctx.moveTo(x, y);
        } else {
          if (this.options.smooth) {
            const prevX = this.padding + (chartWidth / (this.data.labels.length - 1)) * (index - 1);
            const prevY = this.padding + chartHeight - (dataset.data[index - 1] / maxValue) * chartHeight * this.animationProgress;
            const cp1x = prevX + (x - prevX) / 2;
            const cp1y = prevY;
            const cp2x = prevX + (x - prevX) / 2;
            const cp2y = y;
            this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
      });
      
      this.ctx.stroke();
    });
  }

  drawPoints(chartWidth, chartHeight) {
    const datasets = this.data.datasets;
    const maxValue = Math.max(...datasets.flatMap(ds => ds.data));
    
    datasets.forEach((dataset) => {
      this.ctx.fillStyle = dataset.color || '#4a9eff';
      
      dataset.data.forEach((value, index) => {
        const x = this.padding + (chartWidth / (this.data.labels.length - 1)) * index;
        const y = this.padding + chartHeight - (value / maxValue) * chartHeight * this.animationProgress;
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      });
    });
  }
}

// Bar Chart Implementation
class BarChart {
  constructor(ctx, data, options) {
    this.ctx = ctx;
    this.data = data;
    this.options = options;
    this.padding = options.padding || 40;
    this.animationProgress = 0;
    
    this.init();
  }

  init() {
    if (this.options.animation) {
      this.animate();
    } else {
      this.draw();
    }
  }

  animate() {
    const duration = 1000;
    const startTime = Date.now();
    
    const animationLoop = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      this.animationProgress = Math.min(elapsed / duration, 1);
      
      this.draw();
      
      if (this.animationProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    };
    
    animationLoop();
  }

  draw() {
    const { width, height } = this.ctx.canvas;
    const chartWidth = width - 2 * this.padding;
    const chartHeight = height - 2 * this.padding;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Draw axes
    this.drawAxes(chartWidth, chartHeight);
    
    // Draw bars
    this.drawBars(chartWidth, chartHeight);
    
    // Draw values
    if (this.options.showValues) {
      this.drawValues(chartWidth, chartHeight);
    }
  }

  drawAxes(chartWidth, chartHeight) {
    this.ctx.strokeStyle = '#374151';
    this.ctx.lineWidth = 2;
    
    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.padding + chartHeight);
    this.ctx.lineTo(this.padding + chartWidth, this.padding + chartHeight);
    this.ctx.stroke();
    
    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.padding);
    this.ctx.lineTo(this.padding, this.padding + chartHeight);
    this.ctx.stroke();
  }

  drawBars(chartWidth, chartHeight) {
    const barWidth = (chartWidth / this.data.labels.length) * this.options.barWidth;
    const barSpacing = (chartWidth / this.data.labels.length) * (1 - this.options.barWidth) / 2;
    const maxValue = Math.max(...this.data.datasets[0].data);
    
    this.data.datasets[0].data.forEach((value, index) => {
      const x = this.padding + (chartWidth / this.data.labels.length) * index + barSpacing;
      const barHeight = (value / maxValue) * chartHeight * this.animationProgress;
      const y = this.padding + chartHeight - barHeight;
      
      // Create gradient
      const gradient = this.ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, this.data.datasets[0].color || '#4a9eff');
      gradient.addColorStop(1, this.adjustColor(this.data.datasets[0].color || '#4a9eff', -30));
      
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(x, y, barWidth, barHeight);
    });
  }

  drawValues(chartWidth, chartHeight) {
    const maxValue = Math.max(...this.data.datasets[0].data);
    
    this.ctx.fillStyle = '#374151';
    this.ctx.font = '12px Inter';
    this.ctx.textAlign = 'center';
    
    this.data.datasets[0].data.forEach((value, index) => {
      const x = this.padding + (chartWidth / this.data.labels.length) * index + (chartWidth / this.data.labels.length) / 2;
      const y = this.padding + chartHeight - (value / maxValue) * chartHeight * this.animationProgress - 5;
      
      this.ctx.fillText(value.toString(), x, y);
    });
  }

  adjustColor(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}

// Pie Chart Implementation
class PieChart {
  constructor(ctx, data, options) {
    this.ctx = ctx;
    this.data = data;
    this.options = options;
    this.animationProgress = 0;
    
    this.init();
  }

  init() {
    if (this.options.animation) {
      this.animate();
    } else {
      this.draw();
    }
  }

  animate() {
    const duration = 1000;
    const startTime = Date.now();
    
    const animationLoop = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      this.animationProgress = Math.min(elapsed / duration, 1);
      
      this.draw();
      
      if (this.animationProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    };
    
    animationLoop();
  }

  draw() {
    const { width, height } = this.ctx.canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Calculate total
    const total = this.data.datasets[0].data.reduce((sum, value) => sum + value, 0);
    
    // Draw pie slices
    let currentAngle = -Math.PI / 2;
    
    this.data.datasets[0].data.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI * this.animationProgress;
      
      // Draw slice
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      this.ctx.closePath();
      
      this.ctx.fillStyle = this.data.datasets[0].backgroundColor[index] || '#4a9eff';
      this.ctx.fill();
      
      // Draw label
      if (this.options.showLabels && this.animationProgress === 1) {
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 12px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const percentage = ((value / total) * 100).toFixed(1);
        this.ctx.fillText(`${this.data.labels[index]}`, labelX, labelY - 8);
        
        if (this.options.showPercentages) {
          this.ctx.fillText(`${percentage}%`, labelX, labelY + 8);
        }
      }
      
      currentAngle += sliceAngle;
    });
  }
}

// Gauge Chart Implementation
class GaugeChart {
  constructor(ctx, value, options) {
    this.ctx = ctx;
    this.value = value;
    this.options = options;
    this.animationProgress = 0;
    
    this.init();
  }

  init() {
    if (this.options.animation) {
      this.animate();
    } else {
      this.draw();
    }
  }

  animate() {
    const duration = 1000;
    const startTime = Date.now();
    
    const animationLoop = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      this.animationProgress = Math.min(elapsed / duration, 1);
      
      this.draw();
      
      if (this.animationProgress < 1) {
        requestAnimationFrame(animationLoop);
      }
    };
    
    animationLoop();
  }

  draw() {
    const { width, height } = this.ctx.canvas;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 40;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);
    
    // Draw background arc
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25);
    this.ctx.strokeStyle = '#e5e7eb';
    this.ctx.lineWidth = 20;
    this.ctx.stroke();
    
    // Draw colored segments
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;
    
    this.options.thresholds.forEach((threshold, index) => {
      const prevThreshold = index > 0 ? this.options.thresholds[index - 1].value : this.options.min;
      const thresholdAngle = startAngle + ((threshold.value - this.options.min) / (this.options.max - this.options.min)) * totalAngle;
      const prevAngle = startAngle + ((prevThreshold - this.options.min) / (this.options.max - this.options.min)) * totalAngle;
      
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, prevAngle, thresholdAngle);
      this.ctx.strokeStyle = threshold.color;
      this.ctx.lineWidth = 20;
      this.ctx.stroke();
    });
    
    // Draw value arc
    const valueAngle = startAngle + ((this.value - this.options.min) / (this.options.max - this.options.min)) * totalAngle * this.animationProgress;
    
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, startAngle, valueAngle);
    this.ctx.strokeStyle = this.getThresholdColor(this.value);
    this.ctx.lineWidth = 20;
    this.ctx.stroke();
    
    // Draw value text
    if (this.options.showValue) {
      this.ctx.fillStyle = '#374151';
      this.ctx.font = 'bold 24px Inter';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      const displayValue = Math.round(this.value * this.animationProgress);
      this.ctx.fillText(displayValue.toString(), centerX, centerY);
      
      this.ctx.font = '12px Inter';
      this.ctx.fillText(this.options.unit || '', centerX, centerY + 20);
    }
  }

  getThresholdColor(value) {
    for (let i = this.options.thresholds.length - 1; i >= 0; i--) {
      if (value >= this.options.thresholds[i].value) {
        return this.options.thresholds[i].color;
      }
    }
    return this.options.thresholds[0].color;
  }
}

// Export for use in dashboard
window.UltraCharts = UltraCharts;
