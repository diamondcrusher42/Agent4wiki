# .gitignore

# Node/TypeScript
node_modules/
dist/
build/
*.tsbuildinfo

# OS Files
.DS_Store
Thumbs.db

# Master Credentials (Redundancy check)
.env
*.pem
*.key

# ==========================================
# THE STATE VAULT (CRITICAL SECURITY ZONE)
# ==========================================
# Ignore everything inside the state directory...
state/*

# ...EXCEPT the folder structures themselves so Git preserves the architecture
!state/.gitkeep
!state/keychain/.gitkeep
!state/keychain/kids/.gitkeep
!state/memory/.gitkeep
!state/user_agent/.gitkeep
!state/worktrees/.gitkeep

# Ensure Clones don't accidentally commit their injected .env files 
# if they somehow bypass the worktree sandbox (Defense in Depth)
state/worktrees/*/.env