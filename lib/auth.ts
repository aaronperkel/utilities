import { redirect } from "next/navigation";
import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getSessionUid } from "@/lib/session";

export interface Person extends RowDataPacket {
  id: number;
  name: string;
  uid: string;
  email: string;
  isAdmin: number;
}

export async function getPersonByUid(uid: string): Promise<Person | null> {
  const rows = await query<Person>(
    "SELECT id, name, uid, email, is_admin AS isAdmin FROM people WHERE uid = ?",
    [uid],
  );
  return rows[0] ?? null;
}

export async function getPersonByEmail(email: string): Promise<Person | null> {
  const rows = await query<Person>(
    "SELECT id, name, uid, email, is_admin AS isAdmin FROM people WHERE LOWER(email) = ? ORDER BY id LIMIT 1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

/** Current people row for the logged-in uid, or null. */
export async function getCurrentPerson(): Promise<Person | null> {
  const uid = await getSessionUid();
  if (!uid) return null;
  return getPersonByUid(uid);
}

/** Halt (redirect to the 403 page) unless the uid is registered in people. */
export async function requireUser(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect("/no-access");
  return person;
}

/** Halt unless the current user is an admin. */
export async function requireAdmin(): Promise<Person> {
  const person = await requireUser();
  if (!person.isAdmin) redirect("/no-access");
  return person;
}

/** For server actions: throw instead of redirect so callers get an error result. */
export async function requireAdminAction(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person || !person.isAdmin) throw new Error("Admin access required.");
  return person;
}

/** name → email map for everyone with a configured address. */
export async function getEmailMap(): Promise<Record<string, string>> {
  const rows = await query<RowDataPacket>(
    "SELECT name, email FROM people WHERE email IS NOT NULL AND email != ''",
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.email]));
}
