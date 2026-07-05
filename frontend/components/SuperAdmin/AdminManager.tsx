import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../lib/hooks/useAuth';
import { UserPlus, ShieldOff, ShieldCheck, Mail, Key, Ghost } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AdminUser {
  id: string;
  username: string;
  role: string;
  status: 'active' | 'suspended';
  last_seen_at: string;
  created_at: string;
}

export default function AdminManager() {
  const { token, userId } = useAuth();
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const fetchAdmins = async () => {
    try {
      const res = await axios.get('/api/superadmin/admins', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdmins(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchAdmins();
  }, [token]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/superadmin/create-admin', 
        { email: newEmail, password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewEmail('');
      setNewPassword('');
      setIsCreating(false);
      fetchAdmins();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create admin');
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    if (id === userId) return alert("You cannot suspend yourself.");
    try {
      const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await axios.put(`/api/superadmin/admins/${id}/status`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchAdmins();
    } catch (err) {
      console.error(err);
    }
  };

  const ghostLogin = (adminId: string) => {
    alert(`Ghost login feature for tenant ${adminId} requires complex session swapping. Coming in next phase!`);
  };

  const resetPassword = async (adminId: string) => {
    if (!confirm('Are you sure you want to reset this admin\'s password? Their data will be preserved.')) return;
    try {
      const res = await axios.post(`/api/superadmin/admins/${adminId}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Password reset successfully!\n\nGive this temporary password to the tenant:\n\n${res.data.temporaryPassword}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reset password');
    }
  };

  if (loading) return <div className="text-slate-400">Loading admins...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Tenant Administrators</h2>
          <p className="text-sm text-slate-400">Manage all admin panels and access rights</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <UserPlus size={18} />
          Create Admin
        </button>
      </div>

      {isCreating && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl animate-fade-in-up">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Provision New Admin Tenant</h3>
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Tenant Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="email" 
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-slate-200 focus:border-emerald-500 outline-none"
                    placeholder="admin@tenant.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Temporary Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-slate-200 focus:border-emerald-500 outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
              >
                Provision Tenant
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/50 border-b border-slate-800">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tenant / Username</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Created</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {admins.map(admin => (
              <tr key={admin.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400 font-bold uppercase">
                      {admin.username.substring(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">{admin.username}</div>
                      <div className="text-xs text-slate-500 font-mono">{admin.id.split('-')[0]}...</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    admin.role === 'superadmin' ? 'bg-purple-500/10 text-purple-400' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {admin.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${
                    admin.status === 'active' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${admin.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                    {admin.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {admin.role !== 'superadmin' && (
                      <button 
                        onClick={() => resetPassword(admin.id)}
                        title="Reset Password"
                        className="p-2 bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 rounded-lg transition-colors"
                      >
                        <Key size={16} />
                      </button>
                    )}
                    {admin.role !== 'superadmin' && (
                      <button 
                        onClick={() => ghostLogin(admin.id)}
                        title="Ghost Login (Impersonate)"
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                      >
                        <Ghost size={16} />
                      </button>
                    )}
                    {admin.id !== userId && (
                      <button 
                        onClick={() => toggleStatus(admin.id, admin.status)}
                        title={admin.status === 'active' ? 'Suspend Access' : 'Restore Access'}
                        className={`p-2 rounded-lg transition-colors ${
                          admin.status === 'active' 
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        {admin.status === 'active' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No tenant admins found. Create one above!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
