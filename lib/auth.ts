import { redirect } from "next/navigation";
import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getSessionUid } from "@/lib/session";

export interface Person extends RowDataPacket {
  personID: number;
  personName: string;
  uid: string;
  email: string;
  is_admin: number;
}

export async function getPersonByUid(uid: string): Promise<Person | null> {
  const rows = await query<Person>(
    "SELECT personID, personName, uid, email, is_admin FROM tblPeople WHERE uid = ?",
    [uid],
  );
  return rows[0] ?? null;
}

/** Current tblPeople row for the logged-in NetID, or null. */
export async function getCurrentPerson(): Promise<Person | null> {
  const uid = await getSessionUid();
  if (!uid) return null;
  return getPersonByUid(uid);
}

/** Halt (redirect to the 403 page) unless the NetID is registered in tblPeople. */
export async function requireUser(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect("/no-access");
  return person;
}

/** Halt unless the current user is an admin. */
export async function requireAdmin(): Promise<Person> {
  const person = await requireUser();
  if (!person.is_admin) redirect("/no-access");
  return person;
}

/** For server actions: throw instead of redirect so callers get an error result. */
export async function requireAdminAction(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person || !person.is_admin) throw new Error("Admin access required.");
  return person;
}

/** name → email map for everyone with a configured address. */
export async function getEmailMap(): Promise<Record<string, string>> {
  const rows = await query<RowDataPacket>(
    "SELECT personName, email FROM tblPeople WHERE email IS NOT NULL AND email != ''",
  );
  return Object.fromEntries(rows.map((r) => [r.personName, r.email]));
}
