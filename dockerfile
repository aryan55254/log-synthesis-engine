# Stage 1: Build the source tree and compile TypeScript assets
FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies if any native compilation steps trigger down the wire
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy codebase assets and run the compiler sequence
COPY . .
RUN npm run build

# ---

# Stage 2: Production execution environment
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# CRUCIAL: Copy package.json to the runtime context so Node resolves `"type": "module"` correctly
COPY package*.json ./

# Install ONLY production dependencies to keep the image footprint ultra-lean
RUN npm ci --only=production

# Copy the compiled ECMAScript distribution layers from your builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Execute your Fastify master thread daemon process
CMD ["node", "dist/index.js"]