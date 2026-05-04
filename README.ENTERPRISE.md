#  Solar Inverter Platform - Enterprise Edition

## Architecture Overview

This platform handles **232+ solar sites** with:
- ✅ BullMQ + Redis queue system
- ✅ 5-10 parallel workers
- ✅ Circuit breaker pattern
- ✅ Automatic retries
- ✅ Real-time monitoring

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Redis

```bash
# Option A: Local
redis-server

# Option B: Docker
docker run -d -p 6379:6379 redis:alpine

# Option C: Cloud (Redis.io, Upstash)
# Update .env with cloud credentials
```

### 3. Configure Environment

```bash
cp .env.enterprise.example .env
# Edit .env with your credentials
```

### 4. Start Everything

```bash
# Terminal 1: Main Server
npm run dev

# Terminal 2: Workers (or run together)
npm run worker
```

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server |
| `npm run worker` | Start worker pool |
| `npm run queue:monitor` | View queue metrics |
| `npm run workers:status` | Check worker health |
| `npm run queue:retry` | Retry failed jobs |
| `npm run db:cleanup` | Clean old metrics |
| `npm run build` | Build for production |
| `npm start` | Run production |

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CRON Scheduler                          │
│                    (Every 5 minutes)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Queue 232 Site Monitoring Jobs                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Queue (BullMQ)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            Worker Pool (5-10 workers parallel)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Circuit Breaker + Retry Logic                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Growatt API                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Save Metrics + Check Alerts                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Email Notifications (Critical Alerts)              │
└─────────────────────────────────────────────────────────────┘
```

## Performance Metrics

### Before (Simple Cron)
- Processing Time: 20-30 minutes
- Fault Tolerance: None
- Parallel Processing: No
- Auto Retry: No
- Scalability: Limited

### After (Enterprise Queue)
- Processing Time: 1-2 minutes 
- Fault Tolerance: Full 
- Parallel Processing: 5-10 workers 
- Auto Retry: 3 attempts 
- Scalability: 1000+ sites 

## API Calls Management

```
232 sites × 12 calls/hour = 2,784 API calls/hour
With 5 workers = ~46 sites per worker
Rate limiting: 10 requests/second max
```

## Monitoring

### Queue Metrics

```bash
npm run queue:monitor
```

Output:
```
 Queue Monitoring Dashboard


 Queue: site-monitoring
├─ Waiting:   180
├─ Active:    5
├─ Completed: 47
├─ Failed:    0
└─ Delayed:   0

✅ Total queues: 3
```

### Worker Status

```bash
npm run workers:status
```

Output:
```
 Worker Status Dashboard

✅ Running - Site Monitoring Worker
✅ Running - Site Sync Worker
✅ Running - Email Notification Worker
```

## Circuit Breaker

Protects against Growatt API failures:

- **Timeout**: 10 seconds
- **Error Threshold**: 50%
- **Reset Time**: 30 seconds

When circuit opens:
1. Stops calling Growatt API
2. Waits 30 seconds
3. Tests with one request
4. Closes if successful

## Data Retention

- **Full Resolution**: 30 days
- **Aggregated**: 90 days
- **Summary**: 365 days

Run cleanup:
```bash
npm run db:cleanup
```

## Environment Variables

### Required
```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
GROWATT_EMAIL=...
GROWATT_PASSWORD=...
JWT_SECRET=...
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Optional
```env
WORKER_CONCURRENCY=5
CIRCUIT_BREAKER_TIMEOUT=10000
METRICS_RETENTION_DAYS=30
```

## Troubleshooting

### Redis Connection Error

```bash
# Check if Redis is running
redis-cli ping

# Should return: PONG
```

### Workers Not Processing

```bash
# Check worker status
npm run workers:status

# Check queue metrics
npm run queue:monitor

# Restart workers
pkill -f "tsx src/workers"
npm run worker
```

### Circuit Breaker Open

This is normal when Growatt API is down. Wait 30 seconds for auto-recovery.

## Production Deployment

### Option 1: Separate Processes

```bash
# Server process
npm start

# Worker process (separate)
npm run worker
```

### Option 2: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

### Option 3: Docker

```bash
# Build
docker build -t solar-platform .

# Run server
docker run -p 3000:3000 solar-platform npm start

# Run workers
docker run solar-platform npm run worker
```

## Scaling

### For 500+ Sites

```env
WORKER_CONCURRENCY=10
MAX_WORKERS=20
```

### For 1000+ Sites

```env
WORKER_CONCURRENCY=15
MAX_WORKERS=30
MONITOR_INTERVAL_MINUTES=10
```

## Security

- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Rate limiting
- ✅ Redis password (production)
- ✅ Circuit breaker
- ✅ Request validation

## Support

For issues, check:
1. `logs/app.log` - Application logs
2. `logs/error.log` - Error logs
3. Queue metrics - `npm run queue:monitor`
4. Worker status - `npm run workers:status`

---

** Built for enterprise-scale solar monitoring**
