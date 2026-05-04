#  Solar Inverter Monitoring Platform

Enterprise-grade solar inverter monitoring system with Growatt API integration.

## Features

✅ **Secure Authentication** - Role-based access control (Admin/Engineer)  
✅ **Growatt Integration** - Real-time data synchronization  
✅ **Site Monitoring** - Automated health checks every 5 minutes  
✅ **Alert Engine** - Intelligent alerting for critical issues  
✅ **Engineer Assignment** - Workflow management for field work  
✅ **Field Reports** - Mobile-ready reporting system  
✅ **Background Jobs** - Automated data sync and monitoring  

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT + Supabase Auth
- **External API**: Growatt Solar
- **Job Scheduler**: node-cron
- **Logging**: Winston

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Project Structure

```
src/
├── config/          # Configuration files
├── integrations/    # External API integrations (Growatt)
├── jobs/           # Background job schedulers
├── modules/        # Feature modules
│   ├── auth/       # Authentication
│   ├── sites/      # Site management
│   ├── alerts/     # Alert system
│   ├── engineers/  # Engineer management
│   └── reports/    # Field reports
├── middlewares/    # Express middlewares
├── utils/          # Utility functions
├── types/          # TypeScript type definitions
├── routes/         # API route definitions
├── app.ts          # Express app configuration
└── server.ts       # Server entry point
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/profile` - Get profile

### Sites
- `GET /api/v1/sites` - Get all sites
- `GET /api/v1/sites/:id` - Get site details
- `GET /api/v1/sites/:id/metrics` - Get site metrics

### Alerts
- `GET /api/v1/alerts` - Get all alerts
- `GET /api/v1/alerts/critical` - Get critical alerts
- `PATCH /api/v1/alerts/:id/acknowledge` - Acknowledge alert

### Engineers
- `GET /api/v1/engineers` - Get all engineers (Admin)
- `POST /api/v1/engineers/assign` - Assign engineer (Admin)
- `GET /api/v1/engineers/my-assignments` - Get assignments (Engineer)
- `PATCH /api/v1/engineers/assignments/:id/status` - Update status

### Reports
- `POST /api/v1/reports` - Create report (Engineer)
- `GET /api/v1/reports/assignment/:id` - Get reports by assignment
- `GET /api/v1/reports/site/:id` - Get reports by site

## Background Jobs

The platform runs three background jobs:

1. **Site Sync Job** - Syncs sites from Growatt (every 24 hours)
2. **Monitoring Job** - Monitors site health (every 5 minutes)
3. **Alert Job** - Processes alerts (every 3 minutes)

## Security Features

- JWT-based authentication
- Role-based access control
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Request validation with Zod

## Database Schema

See `docs/database-schema.sql` for complete schema.

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Deployment

1. Build the project: `npm run build`
2. Set environment variables on your server
3. Run: `npm start`

## License

MIT

## Support

For support, email support@solarplatform.com
