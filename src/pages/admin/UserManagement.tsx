import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { UserProfile, Role, Status, AnalyticsEvent } from '../../types';
import { Edit2, MessageCircle, X, Check, Search, ArrowUp, ArrowDown, Clock, MousePointerClick, Film, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';

type SortField = 'createdAt' | 'displayName' | 'phone' | 'expiryDate';
type SortOrder = 'asc' | 'desc';

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditingOverlay, setIsEditingOverlay] = useState(false);
  const [userAnalytics, setUserAnalytics] = useState<{ moviesClicked: number, linksClicked: number, viewedMovies: string[], clickedLinks: string[] }>({ moviesClicked: 0, linksClicked: 0, viewedMovies: [], clickedLinks: [] });
  const [assignedContentTitles, setAssignedContentTitles] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ ...doc.data() } as UserProfile));
      
      // Auto-expire users whose expiry date has passed
      const now = new Date();
      data.forEach(user => {
        if (user.status === 'active' && user.expiryDate) {
          const expiryDate = new Date(user.expiryDate);
          // Add 24 hours to make it expire at the end of the day
          const expiryEnd = new Date(expiryDate.getTime() + 24 * 60 * 60 * 1000);
          if (now > expiryEnd) {
            updateDoc(doc(db, 'users', user.uid), { status: 'expired' }).catch(console.error);
          }
        }
      });

      setUsers(data);
      setLoading(false);
    }, (error) => {
      console.error("Users snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsub();
  }, []);

  const fetchUserAnalytics = async (user: UserProfile) => {
    try {
      const q = query(
        collection(db, 'analytics'), 
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      let movies = 0;
      let links = 0;
      
      // We want to keep track of all events to sort them by timestamp
      const events: AnalyticsEvent[] = [];
      snapshot.forEach(doc => {
        events.push(doc.data() as AnalyticsEvent);
      });

      // Sort events by timestamp descending to get latest first
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const viewedMovies = new Set<string>();
      const clickedLinks = new Set<string>();

      events.forEach(data => {
        if (data.type === 'content_click') {
          movies++;
          if (data.contentTitle && viewedMovies.size < 5) {
            viewedMovies.add(data.contentTitle);
          }
        }
        if (data.type === 'link_click') {
          links++;
          if (data.contentTitle && clickedLinks.size < 5) {
            const linkName = data.linkName || 'Link';
            clickedLinks.add(`${data.contentTitle} - ${linkName}`);
          }
        }
      });
      setUserAnalytics({ 
        moviesClicked: movies, 
        linksClicked: links, 
        viewedMovies: Array.from(viewedMovies), 
        clickedLinks: Array.from(clickedLinks) 
      });

      if (user.role === 'selected_content' && user.assignedContent && user.assignedContent.length > 0) {
        // Fetch titles for assigned content
        const contentSnapshot = await getDocs(collection(db, 'content'));
        const titles: string[] = [];
        contentSnapshot.forEach(doc => {
          if (user.assignedContent!.includes(doc.id)) {
            titles.push(doc.data().title);
          }
        });
        setAssignedContentTitles(titles);
      } else {
        setAssignedContentTitles([]);
      }
    } catch (error) {
      console.error("Error fetching user analytics:", error);
      handleFirestoreError(error, OperationType.LIST, 'analytics/content');
    }
  };

  const handleRowClick = (user: UserProfile, e: React.MouseEvent) => {
    // Prevent opening overlay if clicking on inputs, selects, or buttons
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    if (editingId === user.uid) return;
    
    setSelectedUser(user);
    fetchUserAnalytics(user);
  };

  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setEditingId(user.uid);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      phone: user.phone || '',
      expiryDate: user.expiryDate ? user.expiryDate.split('T')[0] : '',
      role: user.role,
      status: user.status,
    });
    setIsEditingOverlay(true);
  };

  const handleSave = () => {
    if (!editingId) return;
    try {
      const updateData: any = {
        displayName: editForm.displayName,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        status: editForm.status,
      };
      
      if (editForm.expiryDate) {
        updateData.expiryDate = new Date(editForm.expiryDate).toISOString();
      } else {
        updateData.expiryDate = null;
      }

      const currentEditingId = editingId;
      setEditingId(null);
      setIsEditingOverlay(false);
      setSelectedUser(null);

      updateDoc(doc(db, 'users', currentEditingId), updateData).catch(error => {
        console.error('Error updating user:', error);
        setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user' });
      });
    } catch (error) {
      console.error('Error updating user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user' });
    }
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    const currentDeleteConfirm = deleteConfirm;
    setDeleteConfirm(null);
    
    updateDoc(doc(db, 'users', currentDeleteConfirm), {
      status: 'suspended' // Soft delete by suspending
    }).then(() => {
      setAlertConfig({ isOpen: true, title: 'Success', message: 'User suspended successfully' });
    }).catch(error => {
      console.error('Error suspending user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to suspend user' });
    });
  };

  const sendWhatsAppReminder = (user: UserProfile) => {
    if (!user.phone) {
      setAlertConfig({ isOpen: true, title: 'Missing Phone Number', message: 'User does not have a phone number set.' });
      return;
    }
    
    const expiryStr = user.expiryDate ? format(new Date(user.expiryDate), 'MMM dd, yyyy') : 'soon';
    const message = `Hello ${user.displayName || 'there'},\n\nThis is a friendly reminder from MovizNow that your membership will expire on ${expiryStr}. Please renew to continue enjoying our movies and series!`;
    const encodedMessage = encodeURIComponent(message);
    const phone = user.phone.replace(/\D/g, ''); // Remove non-digits
    
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUsers(filteredAndSortedUsers.map(u => u.uid));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleSelectUser = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUsers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleBulkStatusChange = (status: 'active' | 'pending' | 'suspended' | 'expired') => {
    if (!window.confirm(`Are you sure you want to change the status of ${selectedUsers.length} users to ${status}?`)) return;
    
    const currentSelected = [...selectedUsers];
    setSelectedUsers([]);
    
    const batch = writeBatch(db);
    currentSelected.forEach(uid => {
      const userRef = doc(db, 'users', uid);
      batch.update(userRef, { status });
    });
    batch.commit().catch(error => {
      console.error('Error updating users:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update users' });
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 inline ml-1" /> : <ArrowDown className="w-4 h-4 inline ml-1" />;
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(u => 
        (u.displayName?.toLowerCase() || '').includes(lower) ||
        (u.email?.toLowerCase() || '').includes(lower) ||
        (u.phone?.toLowerCase() || '').includes(lower)
      );
    }
    if (filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole);
    }
    if (filterStatus !== 'all') {
      result = result.filter(u => u.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'displayName':
          comparison = (a.displayName || '').localeCompare(b.displayName || '');
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'expiryDate':
          const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
          const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
          comparison = dateA - dateB;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [users, searchTerm, filterRole, filterStatus, sortField, sortOrder]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Membership Management</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search users by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500"
          />
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0">
          {selectedUsers.length > 0 && (
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
              <span className="text-sm text-zinc-400">{selectedUsers.length} selected</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStatusChange(e.target.value as any);
                    e.target.value = '';
                  }
                }}
                className="bg-transparent border-none text-sm focus:outline-none text-emerald-500 font-medium cursor-pointer"
              >
                <option value="">Bulk Actions</option>
                <option value="active">Set Active</option>
                <option value="pending">Set Pending</option>
                <option value="expired">Set Expired</option>
                <option value="suspended">Suspend</option>
              </select>
            </div>
          )}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 min-w-[140px]"
          >
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="temporary">Temporary</option>
            <option value="selected_content">Selected Content</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 min-w-[140px]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/50 text-zinc-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-4 w-12">
                    <input 
                      type="checkbox" 
                      checked={selectedUsers.length === filteredAndSortedUsers.length && filteredAndSortedUsers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                    />
                  </th>
                  <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('displayName')}>
                  User Info <SortIcon field="displayName" />
                </th>
                <th className="px-4 md:px-6 py-4">Role</th>
                <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('expiryDate')}>
                  Expiry Date <SortIcon field="expiryDate" />
                </th>
                <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-white transition-colors" onClick={() => toggleSort('createdAt')}>
                  Joined <SortIcon field="createdAt" />
                </th>
                <th className="px-4 md:px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredAndSortedUsers.map((user) => (
                <tr key={user.uid} onClick={(e) => handleRowClick(user, e)} className="hover:bg-zinc-800/50 transition-colors cursor-pointer">
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={selectedUsers.includes(user.uid)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectUser(user.uid, e as any);
                      }}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                    />
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || 'User'} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold shrink-0">
                          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          {user.displayName || 'No Name'}
                        </div>
                        <div className="text-zinc-400 text-xs mt-0.5">{user.email}</div>
                        <div className="text-zinc-500 text-xs mt-0.5 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                          {user.phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-500' : 
                          user.role === 'data_editor' ? 'bg-indigo-500/10 text-indigo-500' :
                          user.role === 'temporary' ? 'bg-orange-500/10 text-orange-500' : 
                          user.role === 'selected_content' ? 'bg-pink-500/10 text-pink-500' :
                          'bg-blue-500/10 text-blue-500'}`}
                      >
                        {user.role === 'selected_content' ? 'Selected Content' : user.role.replace('_', ' ')}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                        ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                          user.status === 'expired' ? 'bg-red-500/10 text-red-500' : 
                          'bg-yellow-500/10 text-yellow-500'}`}
                      >
                        {user.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <span className="text-zinc-300">
                      {user.expiryDate ? format(new Date(user.expiryDate), 'MMM dd, yyyy') : '-'}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-zinc-400">
                    {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-4 md:px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          sendWhatsAppReminder(user);
                        }}
                        className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Send WhatsApp Reminder"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(user);
                        }} 
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(user.uid);
                        }} 
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAndSortedUsers.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No users found matching your filters.
          </div>
        )}
      </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-6 border-b border-zinc-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{isEditingOverlay ? 'Edit User' : 'User Details'}</h2>
              <button onClick={() => { setSelectedUser(null); setIsEditingOverlay(false); }} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1">
              {isEditingOverlay ? (
                <div className="p-4 md:p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={editForm.displayName || ''}
                      onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Phone</label>
                    <input
                      type="text"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Role</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="user">User</option>
                      <option value="temporary">Temporary</option>
                      <option value="selected_content">Selected Content</option>
                      <option value="data_editor">Data Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Status })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={editForm.expiryDate || ''}
                      onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 md:p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt={selectedUser.displayName || 'User'} className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-2xl font-bold text-emerald-500 shrink-0">
                        {selectedUser.displayName ? selectedUser.displayName.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedUser.displayName || 'No Name'}</h3>
                      <p className="text-zinc-400 text-sm">{selectedUser.email}</p>
                      <p className="text-zinc-400 text-sm">{selectedUser.phone || 'No Phone'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div className="text-zinc-500 text-xs uppercase font-bold mb-1">Role</div>
                      <div className="capitalize font-medium text-emerald-400">{selectedUser.role.replace('_', ' ')}</div>
                    </div>
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div className="text-zinc-500 text-xs uppercase font-bold mb-1">Status</div>
                      <div className="capitalize font-medium text-white">{selectedUser.status}</div>
                    </div>
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 col-span-2">
                      <div className="text-zinc-500 text-xs uppercase font-bold mb-1">Accessible Movies</div>
                      <div className="capitalize font-medium text-white">
                        {selectedUser.role === 'admin' || selectedUser.role === 'data_editor' ? 'All' :
                         selectedUser.role === 'user' ? (selectedUser.status === 'active' ? 'All' : 'None') :
                         (selectedUser.assignedContent?.length || 0)}
                      </div>
                      {selectedUser.role === 'selected_content' && assignedContentTitles.length > 0 && (
                        <div className="mt-2 text-sm text-zinc-400">
                          {assignedContentTitles.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div className="text-zinc-500 text-xs uppercase font-bold mb-1">Joined</div>
                      <div className="font-medium text-white">{format(new Date(selectedUser.createdAt), 'MMM dd, yyyy')}</div>
                    </div>
                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div className="text-zinc-500 text-xs uppercase font-bold mb-1">Expiry Date</div>
                      <div className="font-medium text-white">{selectedUser.expiryDate ? format(new Date(selectedUser.expiryDate), 'MMM dd, yyyy') : 'N/A'}</div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 pt-6">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Activity Overview</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <div className="flex items-center gap-3 text-zinc-300">
                          <Clock className="w-5 h-5 text-emerald-500" />
                          <span>Time in App</span>
                        </div>
                        <span className="font-bold text-white">{selectedUser.timeSpent || 0} mins</span>
                      </div>
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 text-zinc-300">
                            <Film className="w-5 h-5 text-emerald-500" />
                            <span>Movies Clicked</span>
                          </div>
                          <span className="font-bold text-white">{userAnalytics.moviesClicked}</span>
                        </div>
                        {userAnalytics.viewedMovies.length > 0 && (
                          <div className="text-xs text-zinc-400 mt-2 pl-8">
                            {userAnalytics.viewedMovies.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 text-zinc-300">
                            <MousePointerClick className="w-5 h-5 text-emerald-500" />
                            <span>Links Clicked</span>
                          </div>
                          <span className="font-bold text-white">{userAnalytics.linksClicked}</span>
                        </div>
                        {userAnalytics.clickedLinks.length > 0 && (
                          <div className="text-xs text-zinc-400 mt-2 pl-8">
                            {userAnalytics.clickedLinks.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-zinc-800 flex gap-4 shrink-0">
              {isEditingOverlay ? (
                <>
                  <button
                    onClick={() => { setIsEditingOverlay(false); setSelectedUser(null); }}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      sendWhatsAppReminder(selectedUser);
                      setSelectedUser(null);
                    }}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Send Reminder
                  </button>
                  <button
                    onClick={() => {
                      handleEdit(selectedUser);
                    }}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-5 h-5" />
                    Edit User
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Suspend User"
        message="Are you sure you want to suspend this user? They will no longer be able to access the application."
        confirmText="Suspend"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
