# ASHIVAM TECHNOLOGIES E-NEWS — DATABASE INTEGRITY REPORT

**Date:** November 16, 2026  
**Target:** Neon PostgreSQL Serverless (`@prisma/adapter-pg`)  
**Lead:** Principal Database & Systems Engineer  

---

## 1. Schema & Architecture Overview

The database architecture employs PostgreSQL 16 hosted on Neon Serverless with connection pooling (`ep-bold-shadow-bdx60ifg-pooler.c-8.us-east-2.aws.neon.tech`). Prisma ORM manages schema definitions, typed client generation, and migrations.

### Key Entities
- `User` & `Session`: Identity, credential hashes, and cryptographic refresh tokens.
- `Article`, `Category`, `Tag`, `ArticleTag`: Publication graph with many-to-many tag relations and hierarchical categories.
- `ArticleRevision`: Immutable revision history tracking editorial changes and diffs.
- `Comment`: Reader commentary with moderation state and parent-child nesting.
- `MediaAsset`: Digital asset library with metadata, blurhash, and storage keys.
- `NewsletterSubscriber` & `NewsletterDelivery`: Email publication workflow with verified double-opt-in state and idempotency tracking.
- `AuditLog`: Tamper-evident ledger of administrative and editorial operations.

---

## 2. Index Optimization & Performance Analysis

| Table | Index Columns | Index Type | Query Purpose |
|---|---|---|---|
| `Article` | `to_tsvector('english', title \|\| ' ' \|\| excerpt)` | **GIN** | Full-text search across article title and excerpts |
| `Article` | `[status, publishedAt DESC]` | **B-Tree Composite** | High-speed retrieval for homepage, category feeds, and archives |
| `Article` | `[slug]` | **Unique B-Tree** | O(1) slug lookup for canonical article rendering |
| `Article` | `[authorId, status]` | **B-Tree Composite** | Author dashboard query acceleration |
| `Comment` | `[articleId, status, createdAt]` | **B-Tree Composite** | Paginated retrieval of approved comments per story |
| `NewsletterDelivery` | `[campaignId, subscriberId]` | **Unique Compound** | Guarantees zero duplicate email deliveries per campaign |
| `User` | `[email]` | **Unique B-Tree** | Constant-time identity resolution on login |
| `Session` | `[tokenHash]` | **Unique B-Tree** | Instant token verification and revocation |

---

## 3. Data Integrity & Constraint Safety

1. **Foreign Key Integrity:**
   - Deletion of an `Article` cascades properly to `ArticleTag` and `ArticleRevision`.
   - Rejection/Deletion of users preserves audit logs through nullable user references with system action fallbacks.
2. **PostgreSQL Full-Text Search:**
   - Utilizes native PostgreSQL GIN index with `to_tsvector` and `plainto_tsquery`, eliminating external search engine dependencies while delivering sub-millisecond query responses.
3. **Connection Pooling Safety:**
   - Serverless functions interact with the pooler endpoint to prevent connection exhaustion under spiky traffic.
   - Database operations use prepared statements to prevent SQL injection vulnerabilities.
