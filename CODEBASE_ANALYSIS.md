# Codebase Analysis: Confusing & Bloated Areas

## 1. **CRITICAL: Auth System is Fragmented** ⚠️

**The Problem:**
You have 5 different auth-related files doing overlapping things:
- `lib/auth/get-current-user.ts` - Complex, handles "effective roles" with view-as functionality
- `lib/auth/simple-check.ts` - NEW, simpler version I created today
- `lib/auth/product-access.ts` - Queries product access tables
- `lib/auth/user-features.ts` - Checks user features
- `lib/auth/get-default-route-for-roles.ts` - Routes based on roles

**The Confusion:**
- `get-current-user.ts` defines 5 roles: admin, coach, athlete, solo_plan_holder, creator
- `simple-check.ts` defines only 3: admin, coach, athlete
- Different parts of the codebase use different role sets → type mismatches and bugs
- 27 places use auth functions; unclear which one to use
- The "view-as-role" feature (admin viewing as coach) adds complexity that most features don't need

**What to do:**
1. **Consolidate to ONE auth file** that handles all cases
2. **Define role types in one place** (currently defined in 2+ places)
3. **Remove the view-as-role cookie complexity** unless it's critical (seems to only be used in Navbar)
4. **Simple rule:** layouts use `requireAuth()`, API routes use `getCurrentUser()` + manual checks

---

## 2. **Giant Components (2000-3000+ lines)** 📦

**The Problem:**
These files are unmaintainable and hard to test:
- `app/coach/plan/[planId]/page.tsx` - **3180 lines**
- `app/coach/program-templates/[templateId]/edit/page.tsx` - **2942 lines**  
- `app/plan/profile/page.tsx` - **2573 lines**
- `app/athlete/profile/page.tsx` - **2550 lines**
- `app/coach/program-templates/[templateId]/page.tsx` - **2508 lines**

**Why this matters:**
- Hard to find bugs
- Impossible to test individual pieces
- Every change risks breaking something
- New developers can't understand the flow

**What to do:**
Break these into smaller, focused components. Example for the plan page:
```
app/coach/plan/[planId]/
├── page.tsx (orchestrator, ~100 lines)
├── components/
│   ├── PlanHeader.tsx
│   ├── WeeksList.tsx
│   ├── SessionForm.tsx
│   └── ActionButtons.tsx
```

---

## 3. **Repetitive Data Fetching Patterns**

**The Problem:**
Many pages fetch similar data in similar ways. Example:

`app/coach/athlete-overview/page.tsx` and `app/coach/plan/[planId]/page.tsx` both:
1. Get athlete profile
2. Get athlete races/events
3. Get plan data
4. Transform and display

This is repeated code that could be extracted to utilities.

**What to do:**
Create data-fetching utilities in `lib/data/`:
```typescript
// lib/data/athleteData.ts
export async function getAthleteWithRaces(athleteId: string) {
  // Fetch profile + races in one place
}

export async function getPlanWithSessions(planId: string) {
  // Fetch plan + sessions in one place
}
```

---

## 4. **Navbar is Doing Too Much (448 lines)** 📊

**The Problem:**
`components/Navbar.tsx` is responsible for:
- Checking user auth
- Loading all user roles
- Loading all user features
- Checking for unread messages (multiple queries)
- Building nav item permissions
- Rendering 100+ nav items conditionally

**Why this matters:**
- Every page load triggers all these queries
- If Navbar fails, entire app is broken
- Hard to debug navigation issues
- The unread message checks are queries for EVERY logged-in page view

**What to do:**
1. Split into smaller components:
   - `NavSidebar.tsx` - Just rendering
   - `useNavData.ts` - Data fetching (can be cached)
   - `UnreadBadge.tsx` - Separate unread logic

2. Cache the nav data (user roles/features don't change often)
3. Debounce or lazy-load the unread message checks

---

## 5. **Product Access System is Tacked On**

**The Problem:**
`lib/auth/product-access.ts` queries a new `user_product_access` table, but:
- It's only imported in 4 places
- Login page calls it, but it's slow (queries products relationship)
- The table schema doesn't match the code (code expects `products(code)`, table has `product_code` column)
- Confuses role-based access (user_roles) with feature-based access (user_product_access)

**What to do:**
1. Fix the mismatch: either use `product_code` directly or fix the join
2. Cache the result in session/cookies
3. Document WHY this exists separately from user_roles
4. Or consolidate: add product_code to user_roles instead of separate table

---

## 6. **Login Page is Doing Too Much**

**The Problem:**
`app/login/page.tsx`:
- Authenticates with Supabase ✓
- Loads user roles ✓
- Loads product access ✗ (slow, unnecessary at login)
- Routes based on role ✓

The product access check happens on EVERY login and slows down the flow.

**What to do:**
- Load product access AFTER redirecting (in a background effect, not blocking login)
- Or move to a simple flag on the user that's checked once

---

## 7. **Inconsistent Error Handling**

**The Problem:**
Some files use:
- `if (error) return []` - silently fail
- `if (error) throw error` - error page
- `if (error) setErrorMessage()` - show to user
- No error handling at all - crash

**What to do:**
Define a pattern:
- **Layouts/route protection:** throw (error page is appropriate)
- **Data fetching in pages:** setError (user-friendly message)
- **Utilities:** throw (let caller decide)

---

## 8. **Type Definitions Scattered**

**The Problem:**
Type definitions are everywhere:
- `AppRole` defined in `get-current-user.ts`
- `AppRole` also defined in `simple-check.ts` (different set!)
- `ProductCode` in `product-access.ts`
- `UserFeature` in `user-features.ts`
- Custom types inline in 20+ components

**What to do:**
Create `lib/types/auth.ts`:
```typescript
export type AppRole = "admin" | "coach" | "athlete" | "solo_plan_holder";
export type ProductCode = "solo_16_week_plan" | ...;
export type UserFeature = "race_info" | ...;
```

Then import from one place.

---

## 9. **Supabase Client Duplication**

**The Problem:**
You create Supabase clients in:
- Layouts
- Pages
- Components (client-side)
- API routes
- Server actions

No consistent pattern for when to use `createClient()` vs reusing one.

**What to do:**
- Use `createClient()` once per server request in layouts
- Pass down via context if needed
- Never create multiple instances in same request

---

## 10. **Navigation Logic is Complex**

**The Problem:**
`lib/auth/get-default-route-for-roles.ts` delegates to `lib/auth/product-access.ts` which checks:
- Roles
- Product access
- Feature flags

Then `components/Navbar.tsx` independently checks:
- Roles
- Nav permissions
- Feature flags

**Result:** Two different code paths deciding what user can see. They might diverge.

**What to do:**
Create one source of truth for "what can this user do":
```typescript
// lib/auth/userAccess.ts
export async function getUserAccess(user: User) {
  return {
    roles: [...],
    features: [...],
    canAccessCoach: boolean,
    canAccessAdmin: boolean,
    // etc
  }
}
```

---

## Summary: Quick Wins

**Easy fixes (do first):**
1. Consolidate auth files → single source of truth
2. Add `lib/types/auth.ts` with all type definitions
3. Break 2000+ line components into smaller pieces (focus on plan editor first)

**Medium effort (do next):**
1. Extract data-fetching utilities to `lib/data/`
2. Create consistent error handling pattern
3. Optimize Navbar with lazy loading and caching

**Larger refactor (consider):**
1. Unify access control: roles + product access + features into one system
2. Implement proper caching for user data
3. Move from "check auth in layout" to "check in wrapper component"

---

## Files to Refactor First (by priority)

1. `lib/auth/` - Consolidate all 5 files into 2 (one for auth checks, one for current user data)
2. `app/coach/plan/[planId]/page.tsx` - Split into components
3. `app/coach/program-templates/[templateId]/edit/page.tsx` - Split into components
4. `components/Navbar.tsx` - Split responsibilities

