# Domain: Auth

## Overview
Handles user registration, login, and JWT session management. No OAuth — email/password only.

## Key Files
| File | Role |
|---|---|
| `backend/src/routes/auth.ts` | API endpoints |
| `frontend/src/store/authStore.ts` | Client session state |
| `frontend/src/pages/Auth/LoginPage.tsx` | Login UI |
| `frontend/src/pages/Auth/RegisterPage.tsx` | Register UI |

## Data Model
```
users: id (uuid), name, email, password_hash (bcrypt, 10 rounds), avatar_url, created_at
```
- `avatar_url` auto-generated from `https://ui-avatars.com/api/?name=<name>&background=random`

## API Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | ❌ | Creates user, returns `{ user, token }` |
| `POST` | `/api/auth/login` | ❌ | Returns `{ user, token }` |

- Token: JWT, `expiresIn: '7d'`, signed with `process.env.JWT_SECRET`
- Login returns 401 with `"Invalid credentials"` for both bad email and bad password (no enumeration)

## Frontend State (`authStore`)
```ts
{ user: User | null, token: string | null }
```
- Persisted: `fw_token` + `fw_user` in `localStorage`
- Axios reads `fw_token` automatically via interceptor in `api/client.ts`
- `login(user, token)` — writes localStorage + sets state
- `logout()` — clears localStorage + nulls state → caller navigates to `/login`

## Auth Guard
- `PrivateRoute` in `App.tsx` checks `authStore.token`; redirects to `/login` if falsy
- Backend: `authMiddleware` reads `Authorization: Bearer <token>`, injects `req.user = { id }`

## Constraints
- All non-auth backend routes **must** use `authMiddleware`
- Never expose `password_hash` in API responses
- JWT secret falls back to a hardcoded string in dev — always set `JWT_SECRET` in prod `.env`
