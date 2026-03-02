# Changelog

## 2026-03-02

### Bug Fixes
1. Fix Prisma client not initializing on Railway deployment — moved `prisma` to production dependencies and added `prisma generate` to the build script
