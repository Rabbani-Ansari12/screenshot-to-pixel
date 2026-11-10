/**
 * Mock authentication. Only the Owner and Employees log in; providers,
 * transporters, drivers and customers never do.
 * TODO(backend): replace with Supabase Auth (supabase.auth.signInWithPassword) and
 * load permissions from the employees / role_permissions tables.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Permission, Role } from "@/types";
import { useEmployees } from "@/hooks/queries";
import { setActingUser } from "@/services/core";
import { ALL_PERMISSIONS } from "./permissions";

interface SessionUser {
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
}

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  permissions: Permission[];
  isOwner: boolean;
  can: (permission: Permission | "owner") => boolean;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  switchRole: (role: Role) => void;
}

const KEY = "meridian-session";
const DEMO_USERS: Record<Role, SessionUser> = {
  Owner: {
    employeeId: "EMP-001",
    name: "Aarav Mehta",
    email: "aarav@meridiansupply.in",
    role: "Owner",
    designation: "Owner",
  },
  Employee: {
    employeeId: "EMP-002",
    name: "Neha Kulkarni",
    email: "neha@meridiansupply.in",
    role: "Employee",
    designation: "Operations Manager",
  },
};

const AuthContext = createContext<AuthState | null>(null);

function save(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const { data: employees } = useEmployees();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (user) setActingUser(user.name);
  }, [user]);

  const permissions = useMemo<Permission[]>(() => {
    if (!user) return [];
    if (user.role === "Owner") return ALL_PERMISSIONS;
    return employees?.find((e) => e.id === user.employeeId)?.permissions ?? ["view_records"];
  }, [user, employees]);

  const can = useCallback(
    (permission: Permission | "owner") => {
      if (!user) return false;
      if (user.role === "Owner") return true;
      if (permission === "owner") return false;
      return permissions.includes(permission);
    },
    [user, permissions],
  );

  const login = useCallback(
    async (email: string, role: Role) => {
      await new Promise((r) => setTimeout(r, 600));
      const match = employees?.find(
        (e) => e.email.toLowerCase() === email.trim().toLowerCase() && e.active,
      );
      const next: SessionUser = match
        ? {
            employeeId: match.id,
            name: match.name,
            email: match.email,
            role: match.role,
            designation: match.designation,
          }
        : DEMO_USERS[role];
      setUser(next);
      save(next);
    },
    [employees],
  );

  const logout = useCallback(() => {
    setUser(null);
    save(null);
  }, []);

  const switchRole = useCallback((role: Role) => {
    const next = DEMO_USERS[role];
    setUser(next);
    save(next);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      permissions,
      isOwner: user?.role === "Owner",
      can,
      login,
      logout,
      switchRole,
    }),
    [user, ready, permissions, can, login, logout, switchRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
