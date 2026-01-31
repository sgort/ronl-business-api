## 🔄 Daily Workflow

### Morning (Start Work)

```bash
# 1. Check Docker is running
docker ps

# 2. If not running, start Docker services
npm run docker:up

# 3. Start dev servers
npm run dev

# 4. Open browser: http://localhost:5173
```

### During Development

### Making Frontend Changes:

- ✅ Files auto-reload (Vite HMR)
- No restart needed!

### Making Backend Changes:

- ✅ Files auto-reload (tsx watch)
- No restart needed!

### Making Shared Types Changes:

```bash
# Terminal 2
npm run build --workspace=@ronl/shared

# Then both frontend and backend auto-reload
```

### Git Operations:

```bash
# Terminal 2 (keep npm run dev running in Terminal 1)
git status
git add .
git commit -m "feat: add something"
git push

# Husky hooks run automatically on commit/push
```

### Check Logs:

```bash
# Terminal 2
docker-compose logs -f keycloak
docker-compose logs -f postgres

# Press Ctrl+C to exit
```

### Evening (End Work)

```bash
# Terminal 1: Stop dev servers
Ctrl+C

# Optional: Stop Docker (saves resources)
npm run docker:down

# Or keep Docker running for tomorrow
```

### 🔧 Common Commands

### View Logs

```bash
# Backend logs - visible in Terminal 1 where npm run dev runs
# Frontend logs - also in Terminal 1

# Docker logs
npm run docker:logs              # All services
npm run docker:logs:keycloak     # Just Keycloak
npm run docker:logs:postgres     # Just PostgreSQL
```

### Restart Services

### Restart Dev Servers:

```bash
# Terminal 1
Ctrl+C
npm run dev
```

### Restart Docker Service:

```bash
# Terminal 2
docker-compose restart keycloak
docker-compose restart postgres
```

### Full Reset:

```bash
# Stop everything
Ctrl+C  # (in Terminal 1)
npm run docker:down

# Remove all data (clean slate)
npm run docker:down:volumes

# Start fresh
npm run docker:up
npm run dev
```

### 🎯 Best Practices

### ✅ DO:

- Keep Docker running all day (background)
- Keep npm run dev running while coding
- Use Terminal 2 for git/docker commands
- Let hot-reload do its magic (don't restart unless needed)

### ❌ DON'T:

- Don't restart dev servers for every change
- Don't stop Docker between coding sessions
- Don't run npm install while dev is running (use Terminal 2)
