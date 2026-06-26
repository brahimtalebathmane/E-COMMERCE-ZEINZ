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

export async function middleware(request: NextRequest) {
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

  const path = request.nextUrl.pathname;

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
