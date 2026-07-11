import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  canAccessRoute,
  parsePermissions,
  type AdminAccess,
} from "@/lib/auth/permissions";

type ProfileGateRow = {
  role: string;
  permissions: unknown;
  is_active: boolean;
};

function buildAccess(userId: string, profile: ProfileGateRow): AdminAccess {
  const role = profile.role === "staff" ? "staff" : "owner";
  return {
    userId,
    role,
    isOwner: role === "owner",
    permissions: parsePermissions(profile.permissions),
    isActive: profile.is_active !== false,
    displayName: null,
    email: null,
  };
}

function forbiddenRedirect(request: NextRequest, reason: "forbidden" | "suspended" = "forbidden") {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/** True for Next.js App Router link prefetch / RSC payload requests. */
function isRscPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    request.nextUrl.searchParams.has("_rsc")
  );
}

/** Supabase SSR stores the session in sb-<project-ref>-auth-token cookies. */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.startsWith("sb-") && name.includes("auth");
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Prefetch requests fire in parallel for every sidebar <Link prefetch> while
  // the user is already on an authenticated admin page. Running two Supabase
  // network round-trips per prefetch (getUser + profiles) saturates Netlify edge
  // concurrency and surfaces as HTTP 503, even though full navigations succeed.
  // Session validity is still enforced in the dashboard layout via getAdminSession;
  // route permissions remain enforced here on real navigations (non-prefetch).
  if (
    isRscPrefetch(request) &&
    path.startsWith("/admin") &&
    !path.startsWith("/admin/login")
  ) {
    if (!hasSupabaseSessionCookie(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      const nextPath = path.startsWith("/") ? path : "/admin";
      if (nextPath.startsWith("/admin") && !nextPath.includes("//")) {
        url.searchParams.set("next", nextPath);
      }
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      const nextPath = path.startsWith("/") ? path : "/admin";
      if (nextPath.startsWith("/admin") && !nextPath.includes("//")) {
        url.searchParams.set("next", nextPath);
      }
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, permissions, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["owner", "staff"].includes(profile.role)) {
      return forbiddenRedirect(request, "forbidden");
    }

    if (profile.is_active === false) {
      return forbiddenRedirect(request, "suspended");
    }

    const access = buildAccess(user.id, profile as ProfileGateRow);
    if (!canAccessRoute(access, path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.searchParams.set("error", "forbidden");
      return NextResponse.redirect(url);
    }
  }

  if (path === "/admin/login" && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (
      profile &&
      ["owner", "staff"].includes(profile.role) &&
      profile.is_active !== false
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
