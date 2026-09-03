import { apiFetch } from "@/lib/api";
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Key, Plus, Trash2, X } from "lucide-react";

const adminSchema = z.object({
  admin_name: z.string().min(2, "Name required"),
  admin_role: z.enum(["major_admin", "whole_admin"]),
  major_id: z.string().optional(),
  gmail: z.string().email("Valid email required"),
  password: z.string().min(8, "Minimum 8 characters"),
}).refine((data) => data.admin_role !== "major_admin" || !!data.major_id, {
  message: "Major selection required for Major Admin",
  path: ["major_id"],
});

const majorSchema = z.object({ major: z.string().min(2, "Major required") });
type AdminFormData = z.infer<typeof adminSchema>;
type MajorFormData = z.infer<typeof majorSchema>;

interface Major { major_id: number; major: string; }
interface AdminAccount { admin_id: number; admin_name: string; admin_role: string; major?: string; admin_gmail: string; }
type ConfirmState = { title: string; message: string; action: () => Promise<void> } | null;

const Developer: React.FC = () => {
  const [, setLocation] = useLocation();
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [majors, setMajors] = useState<Major[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [notice, setNotice] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [passwordAccount, setPasswordAccount] = useState<AdminAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const {
    register: registerAdmin,
    handleSubmit: handleAdminSubmit,
    watch: watchAdmin,
    reset: resetAdmin,
    formState: { errors: adminErrors },
  } = useForm<AdminFormData>({
    resolver: zodResolver(adminSchema),
    defaultValues: { admin_role: "major_admin" },
  });

  const {
    register: registerMajor,
    handleSubmit: handleMajorSubmit,
    reset: resetMajor,
    formState: { errors: majorErrors },
  } = useForm<MajorFormData>({ resolver: zodResolver(majorSchema) });

  const selectedRole = watchAdmin("admin_role");

  const readError = async (res: Response, fallback: string) => {
    try { const data = await res.json(); return data.detail || fallback; }
    catch { return fallback; }
  };

  const refreshData = async () => {
    try {
      const majorRes = await apiFetch("/api/developer/majors", { credentials: "include" });
      if (majorRes.status === 401 || majorRes.status === 403) {
        setAuthorized(false);
        setLocation("/developer");
        return;
      }
      if (!majorRes.ok) throw new Error(await readError(majorRes, "Unable to load majors"));

      const accountRes = await apiFetch("/api/developer/accounts", { credentials: "include" });
      if (accountRes.status === 401 || accountRes.status === 403) {
        setAuthorized(false);
        setLocation("/developer");
        return;
      }
      if (!accountRes.ok) throw new Error(await readError(accountRes, "Unable to load admin accounts"));

      const majorData = await majorRes.json();
      const accountData = await accountRes.json();
      setMajors(majorData.majors || []);
      setAccounts(accountData.accounts || []);
      setAuthorized(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to load developer data");
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => { refreshData(); }, []);

  const onAddMajor = async (data: MajorFormData) => {
    const fd = new FormData();
    fd.append("major", data.major);
    const res = await apiFetch("/api/developer/majors", { method: "POST", body: fd, credentials: "include" });
    if (res.status === 401 || res.status === 403) return setLocation("/developer");
    if (!res.ok) return setNotice(await readError(res, "Unable to add major"));
    resetMajor();
    setNotice("Major added successfully. Default titles were created automatically.");
    await refreshData();
  };

  const onCreateAdmin = async (data: AdminFormData) => {
    const fd = new FormData();
    fd.append("admin_name", data.admin_name);
    fd.append("admin_role", data.admin_role);
    fd.append("gmail", data.gmail);
    fd.append("password", data.password);
    if (data.admin_role === "major_admin" && data.major_id) fd.append("major_id", data.major_id);

    const res = await apiFetch("/api/developer/accounts", { method: "POST", body: fd, credentials: "include" });
    if (res.status === 401 || res.status === 403) return setLocation("/developer");
    if (!res.ok) return setNotice(await readError(res, "Unable to create account"));
    resetAdmin({ admin_role: "major_admin", admin_name: "", gmail: "", password: "", major_id: "" });
    setNotice("Admin account created successfully.");
    await refreshData();
  };

  const deleteMajor = (major: Major) => setConfirmState({
    title: "Delete Major",
    message: `Delete ${major.major}? This cannot be undone.`,
    action: async () => {
      const res = await apiFetch(`/api/developer/majors/${major.major_id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await readError(res, "Unable to delete major"));
      setNotice("Major deleted successfully.");
      await refreshData();
    },
  });

  const deleteAccount = (account: AdminAccount) => setConfirmState({
    title: "Delete Admin Account",
    message: `Delete ${account.admin_name}'s account? This cannot be undone.`,
    action: async () => {
      const res = await apiFetch(`/api/developer/accounts/${account.admin_id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await readError(res, "Unable to delete account"));
      setNotice("Admin account deleted successfully.");
      await refreshData();
    },
  });

  const runConfirmed = async () => {
    if (!confirmState) return;
    setBusy(true);
    try { await confirmState.action(); setConfirmState(null); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Action failed"); setConfirmState(null); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (!passwordAccount) return;
    if (newPassword.length < 8) return setNotice("New password must contain at least 8 characters.");
    const fd = new FormData();
    fd.append("admin_name", passwordAccount.admin_name);
    fd.append("gmail", passwordAccount.admin_gmail);
    fd.append("password", newPassword);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/developer/accounts/${passwordAccount.admin_id}`, { method: "PUT", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await readError(res, "Unable to change password"));
      setNotice("Password changed successfully. It cannot be changed again today.");
      setPasswordAccount(null);
      setNewPassword("");
      await refreshData();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to change password"); }
    finally { setBusy(false); }
  };

  if (checkingAuth || !authorized) return null;

  return (
    <div className="min-h-screen text-[#182033]">
      <div className="max-w-[1120px] mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Developer Dashboard</h1>

        {notice && (
          <div className="mb-5 bg-white border border-[#e7ebf2] rounded-xl p-4 flex justify-between gap-4 shadow-sm">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}><X size={18} /></button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white border border-[#e7ebf2] rounded-[20px] p-[22px] shadow-sm space-y-4">
            <h2 className="text-xl font-bold">Majors</h2>
            <form onSubmit={handleMajorSubmit(onAddMajor)} className="space-y-3">
              <input {...registerMajor("major")} placeholder="Major name" className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white" />
              {majorErrors.major && <p className="text-red-500 text-sm">{majorErrors.major.message}</p>}
              <button type="submit" className="green-bg text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 hover:bg-slate-800 cursor-pointer">
                <Plus size={16} /> Add Major
              </button>
            </form>

            {majors.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="border-b border-[#edf0f5]"><th className="p-3">Major</th><th className="p-3">Action</th></tr></thead>
                  <tbody>{majors.map((m) => (
                    <tr key={m.major_id} className="border-b border-[#edf0f5]">
                      <td className="p-3">{m.major}</td>
                      <td className="p-3"><button type="button" onClick={() => deleteMajor(m)} className="bg-[#b42318] text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-red-700 text-sm cursor-pointer"><Trash2 size={14} /> Delete</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#e7ebf2] rounded-[20px] p-[22px] shadow-sm space-y-4">
            <h2 className="text-xl font-bold">Admin Accounts</h2>
            <form onSubmit={handleAdminSubmit(onCreateAdmin)} className="space-y-3">
              <input {...registerAdmin("admin_name")} placeholder="Display name" className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white" />
              {adminErrors.admin_name && <p className="text-red-500 text-sm">{adminErrors.admin_name.message}</p>}

              <select {...registerAdmin("admin_role")} className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white">
                <option value="major_admin">Major Admin (also organizes own major)</option>
                <option value="whole_admin">Whole Admin (candidate management + organizer)</option>
              </select>

              <select {...registerAdmin("major_id")} disabled={selectedRole !== "major_admin"} className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white disabled:opacity-45 disabled:cursor-not-allowed">
                <option value="">Select Major</option>
                {majors.filter((m) => m.major_id !== 0).map((m) => <option key={m.major_id} value={m.major_id}>{m.major}</option>)}
              </select>
              {adminErrors.major_id && <p className="text-red-500 text-sm">{adminErrors.major_id.message}</p>}

              <input {...registerAdmin("gmail")} type="email" placeholder="Email" className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white" />
              {adminErrors.gmail && <p className="text-red-500 text-sm">{adminErrors.gmail.message}</p>}

              <input {...registerAdmin("password")} type="password" placeholder="Password" className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white" />
              {adminErrors.password && <p className="text-red-500 text-sm">{adminErrors.password.message}</p>}

              <button type="submit" className="green-bg text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 cursor-pointer">Create Account</button>
            </form>

            {accounts.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="border-b border-[#edf0f5]"><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Major</th><th className="p-3">Email</th><th className="p-3">Action</th></tr></thead>
                  <tbody>{accounts.map((acc) => (
                    <tr key={acc.admin_id} className="border-b border-[#edf0f5]">
                      <td className="p-3">{acc.admin_name}</td><td className="p-3">{acc.admin_role}</td><td className="p-3">{acc.major || "—"}</td><td className="p-3">{acc.admin_gmail}</td>
                      <td className="p-3"><div className="flex gap-2">
                        <button type="button" onClick={() => { setPasswordAccount(acc); setNewPassword(""); }} className="green-bg text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-600 text-sm cursor-pointer"><Key size={14} /> Change Password</button>
                        <button type="button" onClick={() => deleteAccount(acc)} className="bg-[#b42318] text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-red-700 text-sm cursor-pointer"><Trash2 size={14} /> Delete</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {confirmState && <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50"><div className="bg-white border border-[#e7ebf2] rounded-2xl p-6 max-w-md w-full shadow-xl"><h3 className="text-xl font-bold mb-2">{confirmState.title}</h3><p className="text-[#667085] mb-6">{confirmState.message}</p><div className="flex justify-end gap-3"><button disabled={busy} onClick={() => setConfirmState(null)} className="px-4 py-2 rounded-lg border border-[#d6dbe5]">Cancel</button><button disabled={busy} onClick={runConfirmed} className="px-4 py-2 rounded-lg bg-[#b42318] text-white">{busy ? "Working..." : "Confirm"}</button></div></div></div>}

      {passwordAccount && <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-4 z-50"><div className="bg-white border border-[#e7ebf2] rounded-2xl p-6 max-w-md w-full shadow-xl"><h3 className="text-xl font-bold mb-2">Change Password</h3><p className="text-[#667085] mb-4">Change password for {passwordAccount.admin_name}.</p><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (8+ characters)" className="w-full p-3 border border-[#d6dbe5] rounded-lg bg-white mb-6" /><div className="flex justify-end gap-3"><button disabled={busy} onClick={() => { setPasswordAccount(null); setNewPassword(""); }} className="px-4 py-2 rounded-lg border border-[#d6dbe5]">Cancel</button><button disabled={busy} onClick={changePassword} className="px-4 py-2 rounded-lg green-bg text-white">{busy ? "Saving..." : "Confirm"}</button></div></div></div>}
    </div>
  );
};

export default Developer;
