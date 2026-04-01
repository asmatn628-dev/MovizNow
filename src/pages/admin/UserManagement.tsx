import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch, deleteDoc, setDoc } from 'firebase/firestore';
import { UserProfile, Role, Status, AnalyticsEvent } from '../../types';
import { Edit2, MessageCircle, X, Check, Search, ArrowUp, ArrowDown, Clock, MousePointerClick, Film, Trash2, Tv, Plus, Loader2, ArrowRight, UserPlus, Calendar, Heart, Bookmark } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { formatDateToMonthDDYYYY } from '../../utils/contentUtils';
import { useAuth } from '../../contexts/AuthContext';
import { smartSearch } from '../../utils/searchUtils';

import { useLocation, useNavigate } from 'react-router-dom';

type SortField = 'createdAt' | 'displayName' | 'phone' | 'expiryDate';
type SortOrder = 'asc' | 'desc';

export default function UserManagement() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const managedByFilter = searchParams.get('managedBy');

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
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [userAnalytics, setUserAnalytics] = useState<{ moviesClicked: number, linksClicked: number, viewedMovies: string[], clickedLinks: string[] }>({ moviesClicked: 0, linksClicked: 0, viewedMovies: [], clickedLinks: [] });
  const [userRequests, setUserRequests] = useState<any[]>([]);
  const [assignedContentTitles, setAssignedContentTitles] = useState<string[]>([]);
  const [allContent, setAllContent] = useState<any[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isContentPickerOpen, setIsContentPickerOpen] = useState(false);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [contentSearchTerm, setContentSearchTerm] = useState('');
  
  // Add Pending User State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [searchPendingQuery, setSearchPendingQuery] = useState('');
  const [searchedPendingUser, setSearchedPendingUser] = useState<UserProfile | null>(null);
  const [searchPendingError, setSearchPendingError] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({ email: '', phone: '', role: 'user' as Role, expiryDate: '' });
  const [managers, setManagers] = useState<Record<string, string>>({});

  useEffect(() => {
    let q = collection(db, 'users') as any;
    if (profile?.role === 'user_manager' || profile?.role === 'manager') {
      q = query(collection(db, 'users'), where('managedBy', '==', profile.uid));
    } else if ((profile?.role === 'admin' || profile?.role === 'owner') && managedByFilter) {
      q = query(collection(db, 'users'), where('managedBy', '==', managedByFilter));
    }

    const unsub = onSnapshot(q, async (snapshot: any) => {
      const data = snapshot.docs.map((doc: any) => {
        const userData = { ...doc.data() } as UserProfile;
        return userData;
      });
      
      const now = new Date();
      let batches = [writeBatch(db)];
      let currentBatchIndex = 0;
      let operationCount = 0;
      let hasUpdates = false;

      data.forEach((user: UserProfile, index: number) => {
        const docRef = snapshot.docs[index].ref;
        let needsUpdate = false;
        const updates: any = {};
        
        // Auto-assign owner role to asmatn628@gmail.com
        if (user.email === 'asmatn628@gmail.com' && user.role !== 'owner') {
          updates.role = 'owner';
          updates.expiryDate = 'Lifetime';
          user.role = 'owner';
          user.expiryDate = 'Lifetime';
          needsUpdate = true;
        }
        
        // Auto-expire users whose expiry date has passed
        if (user.status === 'active' && user.expiryDate && user.role !== 'owner') {
          const expiryDate = new Date(user.expiryDate);
          // Add 24 hours to make it expire at the end of the day
          const expiryEnd = new Date(expiryDate.getTime() + 24 * 60 * 60 * 1000);
          if (now > expiryEnd) {
            updates.status = 'expired';
            user.status = 'expired';
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          if (operationCount === 500) {
            batches.push(writeBatch(db));
            currentBatchIndex++;
            operationCount = 0;
          }
          batches[currentBatchIndex].update(docRef, updates);
          operationCount++;
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        try {
          await Promise.all(batches.map(b => b.commit()));
        } catch (error) {
          console.error("Error committing auto-updates batch:", error);
        }
      }

      setUsers(data);
      setLoading(false);
    }, (error: any) => {
      console.error("Users snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsub();
  }, [profile, managedByFilter]);

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'owner') {
      const fetchManagers = async () => {
        try {
          const { getDocs } = await import('firebase/firestore');
          const q = query(collection(db, 'users'), where('isUserManager', '==', true));
          const snapshot = await getDocs(q);
          const managersData: Record<string, string> = {};
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            managersData[doc.id] = data.displayName || data.email || 'Unknown Manager';
          });
          setManagers(managersData);
        } catch (error) {
          console.error("Error fetching managers:", error);
        }
      };
      fetchManagers();
    }
  }, [profile]);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const { getDocs } = await import('firebase/firestore');
        const snapshot = await getDocs(collection(db, 'content'));
        setAllContent(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching content:", error);
      }
    };
    fetchContent();
  }, []);

  const fetchUserAnalytics = async (user: UserProfile) => {
    setIsAnalyticsLoading(true);
    setUserAnalytics({ moviesClicked: 0, linksClicked: 0, viewedMovies: [], clickedLinks: [] });
    setUserRequests([]);
    setAssignedContentTitles([]);
    try {
      // Fetch Movie Requests
      const requestsQ = query(
        collection(db, 'movie_requests'),
        where('userId', '==', user.uid)
      );
      const requestsSnapshot = await getDocs(requestsQ);
      const requestsData = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserRequests(requestsData);

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
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const handleRowClick = (user: UserProfile, e: React.MouseEvent) => {
    // Prevent opening overlay if clicking on inputs, selects, or buttons
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    if (editingId === user.uid) return;
    
    setSelectedUser(user);
    setAssignedIds(new Set(user.assignedContent || []));
    fetchUserAnalytics(user);
  };

  const handleEdit = (user: UserProfile) => {
    if (user.role === 'owner') return;
    if (user.uid === profile?.uid) return; // Owner cannot edit themselves
    setSelectedUser(user);
    setEditingId(user.uid);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      phone: user.phone || '',
      expiryDate: user.expiryDate ? user.expiryDate.split('T')[0] : '',
      role: user.role,
      status: user.status,
      permissions: user.permissions || [],
    });
    setIsEditingOverlay(true);
  };

  const handleSave = async () => {
    if (!editingId || !selectedUser || selectedUser.role === 'owner') return;
    try {
      const updateData: any = {
        displayName: editForm.displayName,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        status: editForm.status,
        permissions: editForm.permissions || [],
      };
      
      // Set isUserManager flag if role is user_manager or manager
      if (editForm.role === 'user_manager' || editForm.role === 'manager') {
        updateData.isUserManager = true;
      }
      
      if (editForm.expiryDate) {
        updateData.expiryDate = new Date(editForm.expiryDate).toISOString();
      } else {
        updateData.expiryDate = null;
      }

      const currentEditingId = editingId;
      const previousRole = selectedUser.role;
      const newRole = editForm.role;

      setEditingId(null);
      setIsEditingOverlay(false);
      setSelectedUser(null);

      await updateDoc(doc(db, 'users', currentEditingId), updateData);

      // Handle User Manager role changes
      if (previousRole === 'user_manager' && newRole !== 'user_manager') {
        // Expire all managed users
        const q = query(collection(db, 'users'), where('managedBy', '==', currentEditingId));
        const snapshot = await getDocs(q);
        const updatePromises = snapshot.docs.map(userDoc => {
          const userData = userDoc.data() as UserProfile;
          return updateDoc(doc(db, 'users', userDoc.id), {
            status: 'expired',
            previousStatus: userData.status || 'active'
          });
        });
        await Promise.all(updatePromises);
      } else if (previousRole !== 'user_manager' && newRole === 'user_manager') {
        // Restore all managed users
        const q = query(collection(db, 'users'), where('managedBy', '==', currentEditingId));
        const snapshot = await getDocs(q);
        const updatePromises = snapshot.docs.map(userDoc => {
          const userData = userDoc.data() as UserProfile;
          if (userData.previousStatus) {
            return updateDoc(doc(db, 'users', userDoc.id), {
              status: userData.previousStatus,
              previousStatus: null
            });
          }
          return Promise.resolve();
        });
        await Promise.all(updatePromises);
      }

    } catch (error) {
      console.error('Error updating user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user' });
    }
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    const userToDelete = users.find(u => u.uid === deleteConfirm);
    if (userToDelete?.role === 'owner') {
      setDeleteConfirm(null);
      return;
    }
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
    
    let message = '';
    const name = user.displayName || 'there';
    const now = new Date();
    
    // Check if today is the joining date
    const isJoiningDate = user.createdAt && new Date(user.createdAt).toDateString() === now.toDateString();
    const welcomeText = isJoiningDate ? 'Welcome to MovizNow App. ' : '';
    const membershipType = user.role === 'trial' ? 'Trial' : 'membership';
    
    if (user.expiryDate) {
      const expiryDate = new Date(user.expiryDate);
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const expiryStr = formatDateToMonthDDYYYY(user.expiryDate);

      if (diffDays > 3) {
        message = `Hello ${name},\n\n${welcomeText}Your ${membershipType} for MovizNow app will expire on ${expiryStr}.\n\nThank You`;
      } else {
        message = `Hello ${name},\n\n${welcomeText}Your ${membershipType} for MovizNow app is expiring very soon on ${expiryStr}. Please renew to continue enjoying our services.\n\nThank You`;
      }
    } else {
      message = `Hello ${name},\n\n${welcomeText}This is a friendly reminder regarding your MovizNow ${membershipType}.\n\nThank You`;
    }

    const encodedMessage = encodeURIComponent(message);
    const phone = user.phone.replace(/\D/g, ''); // Remove non-digits
    
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const handleAddContent = async (contentId: string) => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    try {
      const currentAssigned = selectedUser.assignedContent || [];
      if (currentAssigned.includes(contentId)) return;
      
      const nextAssigned = [...currentAssigned, contentId];
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
      // Update local state for immediate feedback
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
      setContentSearch('');
    } catch (error) {
      console.error("Error adding content:", error);
    }
  };

  const handleRemoveContent = async (contentId: string) => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    try {
      const nextAssigned = (selectedUser.assignedContent || []).filter(id => id !== contentId);
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
      // Update local state
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
    } catch (error) {
      console.error("Error removing content:", error);
    }
  };

  const handleSaveAccess = async () => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    try {
      const nextAssigned = Array.from(assignedIds);
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
      // Update local state
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
      setIsContentPickerOpen(false);
      
      // Update titles
      const titles: string[] = [];
      allContent.forEach(item => {
        if (nextAssigned.includes(item.id)) {
          titles.push(item.title);
        }
      });
      setAssignedContentTitles(titles);
    } catch (error) {
      console.error('Error updating access:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update access' });
    }
  };

  const toggleContent = (contentId: string, seasons?: any[]) => {
    const newSet = new Set(assignedIds);
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    } else {
      newSet.add(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    }
    setAssignedIds(newSet);
  };

  const toggleSeason = (contentId: string, seasonId: string, allSeasons: any[]) => {
    const newSet = new Set(assignedIds);
    const seasonKey = `${contentId}:${seasonId}`;
    
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      allSeasons.forEach(s => {
        if (s.id !== seasonId) {
          newSet.add(`${contentId}:${s.id}`);
        }
      });
    } else if (newSet.has(seasonKey)) {
      newSet.delete(seasonKey);
    } else {
      newSet.add(seasonKey);
      let allSelected = true;
      for (const s of allSeasons) {
        if (s.id !== seasonId && !newSet.has(`${contentId}:${s.id}`)) {
          allSelected = false;
          break;
        }
      }
      if (allSelected) {
        allSeasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
        newSet.add(contentId);
      }
    }
    setAssignedIds(newSet);
  };

  const handleUpdateRequestStatus = async (requestId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'movie_requests', requestId), { status });
      // Refresh user requests
      setUserRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));
    } catch (error) {
      console.error("Error updating request status:", error);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      await deleteDoc(doc(db, 'movie_requests', requestId));
      setUserRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error("Error deleting request:", error);
    }
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
      setSelectedUsers(filteredAndSortedUsers.filter(u => u.role !== 'owner').map(u => u.uid));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleSelectUser = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const user = users.find(u => u.uid === uid);
    if (user?.role === 'owner') return;
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
      const user = users.find(u => u.uid === uid);
      if (user?.role !== 'owner') {
        const userRef = doc(db, 'users', uid);
        batch.update(userRef, { status });
      }
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
    result = result.filter(u => u.role !== 'owner');
    
    if (searchTerm) {
      result = smartSearch(result, searchTerm, ['displayName', 'email', 'phone']);
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

  const handleSearchPendingUser = async () => {
    if (!searchPendingQuery) {
      setSearchPendingError('Please enter an email or phone number.');
      return;
    }
    setSearchPendingError(null);
    setSearchedPendingUser(null);

    try {
      // Search by email
      let q = query(collection(db, 'users'), where('email', '==', searchPendingQuery), where('status', '==', 'pending'));
      let snapshot = await getDocs(q);
      
      // If not found by email, search by phone
      if (snapshot.empty) {
        q = query(collection(db, 'users'), where('phone', '==', searchPendingQuery), where('status', '==', 'pending'));
        snapshot = await getDocs(q);
      }

      if (snapshot.empty) {
        setSearchPendingError('User not found or is already active.');
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data() as UserProfile;

      setSearchedPendingUser(userData);
      setNewUserForm({
        email: userData.email || '',
        phone: userData.phone || '',
        role: userData.role || 'user',
        expiryDate: userData.expiryDate ? new Date(userData.expiryDate).toISOString().split('T')[0] : ''
      });
    } catch (error) {
      console.error("Error searching user:", error);
      setSearchPendingError('An error occurred while searching.');
    }
  };

  const handleClaimPendingUser = async () => {
    if (!searchedPendingUser) return;
    try {
      const updateData: any = {
        role: newUserForm.role,
        managedBy: profile?.uid,
      };
      if (newUserForm.expiryDate) {
        updateData.expiryDate = new Date(newUserForm.expiryDate).toISOString();
      }
      await updateDoc(doc(db, 'users', searchedPendingUser.uid), updateData);
      setIsAddUserModalOpen(false);
      setSearchedPendingUser(null);
      setSearchPendingQuery('');
      setAlertConfig({ isOpen: true, title: 'Success', message: 'User successfully claimed and updated.' });
    } catch (error) {
      console.error("Error claiming user:", error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user.' });
    }
  };

  const handleAddUser = async () => {
    if (!newUserForm.email && !newUserForm.phone) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Please provide either an email or a phone number.' });
      return;
    }

    try {
      const newUserId = `pending_${Date.now()}`;
      const newUserData: any = {
        uid: newUserId,
        email: newUserForm.email || `${newUserForm.phone}@pending.local`,
        phone: newUserForm.phone || '',
        role: newUserForm.role,
        status: 'pending',
        createdAt: new Date().toISOString(),
        isUserManager: newUserForm.role === 'user_manager' || newUserForm.role === 'manager'
      };

      if (newUserForm.expiryDate) {
        newUserData.expiryDate = new Date(newUserForm.expiryDate).toISOString();
      }

      if (profile?.role === 'user_manager' || profile?.role === 'manager') {
        newUserData.managedBy = profile.uid;
      }

      await setDoc(doc(db, 'users', newUserId), newUserData);
      
      setIsAddUserModalOpen(false);
      setNewUserForm({ email: '', phone: '', role: 'user', expiryDate: '' });
      setAlertConfig({ isOpen: true, title: 'Success', message: 'Pending user added successfully.' });
    } catch (error) {
      console.error('Error adding user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to add user.' });
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Membership Management</h1>
          {managedByFilter && (
            <button
              onClick={() => {
                searchParams.delete('managedBy');
                navigate(`${location.pathname}?${searchParams.toString()}`);
              }}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-lg transition-colors"
            >
              Clear Manager Filter
            </button>
          )}
        </div>
        { (profile?.role === 'user_manager' || profile?.role === 'manager') && (
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold transition-colors"
          >
            <UserPlus className="w-5 h-5" />
            Add User
          </button>
        )}
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
                {(profile?.role === 'admin' || profile?.role === 'owner') && (
                  <option value="suspended">Suspend</option>
                )}
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
            <option value="trial">Trial</option>
            <option value="selected_content">Selected Content</option>
            {(profile?.role === 'admin' || profile?.role === 'owner') && (
              <>
                <option value="temporary">Temporary</option>
                <option value="content_manager">Content Manager</option>
                <option value="user_manager">User Manager</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </>
            )}
            {/* Removed Owner option */}
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
                <th className="px-4 md:px-6 py-4">Last Active</th>
                {(profile?.role === 'admin' || profile?.role === 'owner') && (
                  <th className="px-4 md:px-6 py-4">Managed By</th>
                )}
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
                    {user.role !== 'owner' && (
                      <input 
                        type="checkbox" 
                        checked={selectedUsers.includes(user.uid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectUser(user.uid, e as any);
                        }}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                      />
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.photoURL && user.photoURL.trim() !== "" ? (
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
                          user.role === 'content_manager' ? 'bg-indigo-500/10 text-indigo-500' :
                          user.role === 'user_manager' ? 'bg-blue-500/10 text-blue-500' :
                          user.role === 'manager' ? 'bg-emerald-500/10 text-emerald-500' :
                          user.role === 'temporary' ? 'bg-orange-500/10 text-orange-500' : 
                          user.role === 'selected_content' ? 'bg-pink-500/10 text-pink-500' :
                          user.role === 'trial' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-zinc-500/10 text-zinc-500'}`}
                      >
                        {user.role === 'selected_content' ? 'Selected Content' : 
                         user.role === 'content_manager' ? 'Content Manager' :
                         user.role === 'user_manager' ? 'User Manager' :
                         user.role === 'manager' ? 'Manager' :
                         user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ')}
                      </span>
                      {user.role !== 'owner' && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                          ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                            user.status === 'expired' ? 'bg-red-500/10 text-red-500' : 
                            'bg-yellow-500/10 text-yellow-500'}`}
                        >
                          {user.status}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <span className="text-zinc-300">
                      {user.role === 'owner' ? 'Lifetime' : user.expiryDate ? format(new Date(user.expiryDate), 'MMM dd, yyyy') : '-'}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <span className="text-zinc-400 text-xs">
                      {user.lastActive ? formatDistanceToNow(new Date(user.lastActive), { addSuffix: true }) : 'Never'}
                    </span>
                  </td>
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <td className="px-4 md:px-6 py-4">
                      <span className="text-zinc-400 text-sm">
                        {user.managedBy ? managers[user.managedBy] || 'Unknown Manager' : '-'}
                      </span>
                    </td>
                  )}
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
                      {user.role !== 'owner' && user.uid !== profile?.uid && (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(user);
                            }} 
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          {(profile?.role === 'admin' || profile?.role === 'owner') && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(user.uid);
                              }} 
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </>
                      )}
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
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Role</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="user">User</option>
                        <option value="trial">Trial</option>
                        <option value="selected_content">Selected Content</option>
                        {(profile?.role === 'admin' || profile?.role === 'owner') && (
                          <>
                            <option value="temporary">Temporary</option>
                            <option value="content_manager">Content Manager</option>
                            <option value="user_manager">User Manager</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Status })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-5" />

                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Expiry</label>
                      <input
                        type="date"
                        value={editForm.expiryDate || ''}
                        onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 md:p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    {selectedUser.photoURL && selectedUser.photoURL.trim() !== "" ? (
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

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Role</div>
                        <div className="font-bold text-emerald-400 text-sm">
                          {selectedUser.role === 'selected_content' ? 'Selected Content' : 
                           selectedUser.role === 'content_manager' ? 'Content Manager' :
                           selectedUser.role === 'user_manager' ? 'User Manager' :
                           selectedUser.role === 'manager' ? 'Manager' :
                           selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1).replace('_', ' ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Status</div>
                        <div className="capitalize font-bold text-white text-sm">{selectedUser.status}</div>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Joined</div>
                        <div className="font-bold text-white text-sm">{format(new Date(selectedUser.createdAt), 'MMM dd, yyyy')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Expiry Date</div>
                        <div className="font-bold text-white text-sm">{selectedUser.role === 'owner' ? 'Lifetime' : selectedUser.expiryDate ? format(new Date(selectedUser.expiryDate), 'MMM dd, yyyy') : 'N/A'}</div>
                      </div>
                    </div>

                    {selectedUser.permissions && selectedUser.permissions.length > 0 && (
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Management Access</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedUser.permissions.map(perm => (
                            <span key={perm} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-md border border-emerald-500/20">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {(selectedUser.role === 'selected_content' || selectedUser.role === 'temporary') && (
                    <div className="border-t border-zinc-800 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Assigned Content</h4>
                        <button 
                          onClick={() => setIsContentPickerOpen(true)}
                          className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Manage
                        </button>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {selectedUser.assignedContent?.map(id => {
                          const content = allContent.find(c => c.id === id);
                          return (
                            <div key={id} className="flex items-center gap-2 bg-zinc-800 px-2 py-1 rounded-lg border border-zinc-700">
                              <span className="text-[10px] text-zinc-300">{content?.title || id}</span>
                              <button 
                                onClick={async () => {
                                  const nextAssigned = (selectedUser.assignedContent || []).filter(cid => cid !== id);
                                  await updateDoc(doc(db, 'users', selectedUser.uid), {
                                    assignedContent: nextAssigned
                                  });
                                  setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
                                  setAssignedIds(new Set(nextAssigned));
                                  // Update titles
                                  setAssignedContentTitles(prev => prev.filter(t => t !== content?.title));
                                }} 
                                className="text-zinc-500 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                        {(!selectedUser.assignedContent || selectedUser.assignedContent.length === 0) && (
                          <p className="text-[10px] text-zinc-500 italic">No content assigned yet.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {profile?.role !== 'user_manager' && (
                    <>
                      <div className="border-t border-zinc-800 pt-6">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Movie Requests</h4>
                        <div className="space-y-2">
                          {userRequests.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">No requests submitted yet.</p>
                          ) : (
                            userRequests.map(req => (
                              <div key={req.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={clsx(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                    req.type === 'movie' ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
                                  )}>
                                    {req.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-zinc-200">{req.title}</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold">{req.type}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={clsx(
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                                    req.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                                    req.status === 'completed' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                    req.status === 'rejected' && "bg-red-500/10 text-red-500 border-red-500/20"
                                  )}>
                                    {req.status}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {req.status === 'pending' && (
                                      <>
                                        <button 
                                          onClick={() => handleUpdateRequestStatus(req.id, 'completed')}
                                          className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                          title="Complete"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                          onClick={() => handleUpdateRequestStatus(req.id, 'rejected')}
                                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                          title="Reject"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                    <button 
                                      onClick={() => handleDeleteRequest(req.id)}
                                      className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="border-t border-zinc-800 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Activity Overview</h4>
                          {isAnalyticsLoading && (
                            <div className="flex items-center gap-2 text-emerald-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Scanning</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center gap-3 text-zinc-300">
                              <Calendar className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium">Last Active</span>
                            </div>
                            <span className="font-bold text-white text-xs">
                              {selectedUser.lastActive ? format(new Date(selectedUser.lastActive), 'MMM dd, HH:mm') : 'Never'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center gap-3 text-zinc-300">
                              <Clock className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium">Time in App</span>
                            </div>
                            <span className="font-bold text-white text-xs">{selectedUser.timeSpent || 0} mins</span>
                          </div>
                          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-300">
                                <Film className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Movies Clicked</span>
                              </div>
                              <span className="font-bold text-white text-xs">{userAnalytics.moviesClicked}</span>
                            </div>
                            {userAnalytics.viewedMovies.length > 0 && (
                              <div className="text-[10px] text-zinc-500 mt-1 pl-7 line-clamp-2">
                                {userAnalytics.viewedMovies.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-300">
                                <MousePointerClick className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Links Clicked</span>
                              </div>
                              <span className="font-bold text-white text-xs">{userAnalytics.linksClicked}</span>
                            </div>
                            {userAnalytics.clickedLinks.length > 0 && (
                              <div className="text-[10px] text-zinc-500 mt-1 pl-7 line-clamp-2">
                                {userAnalytics.clickedLinks.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-300">
                                <Heart className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Favorites</span>
                              </div>
                              <span className="font-bold text-white text-xs">{(selectedUser.favorites || []).length}</span>
                            </div>
                          </div>
                          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-300">
                                <Bookmark className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Watch Later</span>
                              </div>
                              <span className="font-bold text-white text-xs">{(selectedUser.watchLater || []).length}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
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
                  {selectedUser.role !== 'owner' && (
                    <button
                      onClick={() => {
                        handleEdit(selectedUser);
                      }}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-5 h-5" />
                      Edit User
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content Picker Modal */}
      {isContentPickerOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Manage Access</h2>
                <p className="text-zinc-400 text-sm">Select content for {selectedUser.displayName || selectedUser.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search content..."
                    value={contentSearchTerm}
                    onChange={(e) => setContentSearchTerm(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button onClick={() => setIsContentPickerOpen(false)} className="text-zinc-400 hover:text-white p-2">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {smartSearch(allContent, contentSearchTerm)
                  .map((content) => {
                    const isSeries = content.type === 'series';
                    const seasons = isSeries && content.seasons ? (typeof content.seasons === 'string' ? JSON.parse(content.seasons) : content.seasons) : [];
                    const isFullyAssigned = assignedIds.has(content.id);
                    const isPartiallyAssigned = !isFullyAssigned && seasons.some((s: any) => assignedIds.has(`${content.id}:${s.id}`));

                    return (
                      <div key={content.id} className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                        <label
                          className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                            isFullyAssigned
                              ? 'bg-emerald-500/10'
                              : isPartiallyAssigned ? 'bg-emerald-500/5' : 'hover:bg-zinc-900'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={isFullyAssigned}
                            onChange={() => toggleContent(content.id, seasons)}
                          />
                          <div className={`w-6 h-6 rounded flex items-center justify-center border ${
                            isFullyAssigned ? 'bg-emerald-500 border-emerald-500' : isPartiallyAssigned ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-600'
                          }`}>
                            {isFullyAssigned && <Check className="w-4 h-4 text-white" />}
                            {!isFullyAssigned && isPartiallyAssigned && <div className="w-3 h-3 bg-emerald-500 rounded-sm" />}
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img src={content.posterUrl} className="w-8 h-12 object-cover rounded" referrerPolicy="no-referrer" />
                              <div>
                                <h4 className="font-medium">{content.title}</h4>
                                <p className="text-xs text-zinc-500 capitalize">{content.type} • {content.year}</p>
                              </div>
                            </div>
                            {content.status === 'draft' && (
                              <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded font-medium">Draft</span>
                            )}
                          </div>
                        </label>
                        
                        {isSeries && seasons.length > 0 && (
                          <div className="border-t border-zinc-800/50 bg-zinc-900/30 p-2 pl-14 space-y-1">
                            {seasons.map((season: any) => {
                              const isSeasonAssigned = isFullyAssigned || assignedIds.has(`${content.id}:${season.id}`);
                              return (
                                <label key={season.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-800/50">
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={isSeasonAssigned}
                                    onChange={() => toggleSeason(content.id, season.id, seasons)}
                                  />
                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                                    isSeasonAssigned ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                                  }`}>
                                    {isSeasonAssigned && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <span className="text-sm text-zinc-300">Season {season.seasonNumber}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 flex justify-end gap-4">
              <button
                onClick={() => setIsContentPickerOpen(false)}
                className="px-6 py-2 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccess}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-medium transition-colors"
              >
                Save Changes
              </button>
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

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-6 border-b border-zinc-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{(profile?.role === 'user_manager' || profile?.role === 'manager' || profile?.role === 'owner') ? 'Search Pending User' : 'Add Pending User'}</h2>
              <button onClick={() => { setIsAddUserModalOpen(false); setSearchedPendingUser(null); setSearchPendingQuery(''); setSearchPendingError(null); }} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
              {(profile?.role === 'user_manager' || profile?.role === 'manager' || profile?.role === 'owner') && !searchedPendingUser && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Search by Email or WhatsApp</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchPendingQuery}
                        onChange={(e) => setSearchPendingQuery(e.target.value)}
                        placeholder="user@example.com or +1234567890"
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchPendingUser()}
                      />
                    </div>
                    {searchPendingError && (
                      <p className="text-red-500 text-sm mt-2">{searchPendingError}</p>
                    )}
                  </div>
                </div>
              )}

              {(!profile || (profile.role !== 'user_manager' && profile.role !== 'manager') || searchedPendingUser) && (
                <>
                  {(profile?.role === 'user_manager' || profile?.role === 'manager' || profile?.role === 'owner') && searchedPendingUser && (
                    <div className="bg-zinc-800/50 p-4 rounded-xl mb-4 flex items-center gap-4">
                      {searchedPendingUser.photoURL ? (
                        <img src={searchedPendingUser.photoURL} alt={searchedPendingUser.displayName} className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center text-xl font-bold text-emerald-500 shrink-0">
                          {(searchedPendingUser.displayName || searchedPendingUser.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-zinc-400 mb-0.5 font-bold uppercase tracking-wider text-[10px]">Found Pending User:</p>
                        <p className="font-bold text-white">{searchedPendingUser.displayName || 'No Name'}</p>
                        <p className="text-xs text-zinc-400">{searchedPendingUser.email || searchedPendingUser.phone}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      placeholder="user@example.com"
                      disabled={!!searchedPendingUser}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">WhatsApp Number</label>
                    <input
                      type="text"
                      value={newUserForm.phone}
                      onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                      placeholder="+1234567890"
                      disabled={!!searchedPendingUser}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Role</label>
                      <select
                        value={newUserForm.role}
                        onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as Role })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="user">User</option>
                        <option value="trial">Trial</option>
                        <option value="selected_content">Selected Content</option>
                        {(profile?.role === 'admin' || profile?.role === 'owner') && (
                          <>
                            <option value="temporary">Temporary</option>
                            <option value="content_manager">Content Manager</option>
                            <option value="user_manager">User Manager</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-400 mb-1">Expiry Date</label>
                      <input
                        type="date"
                        value={newUserForm.expiryDate}
                        onChange={(e) => setNewUserForm({ ...newUserForm, expiryDate: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-zinc-800 flex gap-4 shrink-0">
              <button
                onClick={() => { setIsAddUserModalOpen(false); setSearchedPendingUser(null); setSearchPendingQuery(''); setSearchPendingError(null); }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              {(profile?.role === 'user_manager' || profile?.role === 'manager' || profile?.role === 'owner') && !searchedPendingUser ? (
                <button
                  onClick={handleSearchPendingUser}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  Search
                </button>
              ) : (
                (!profile || (profile.role !== 'user_manager' && profile.role !== 'manager') || searchedPendingUser) && (
                  <button
                    onClick={searchedPendingUser ? handleClaimPendingUser : handleAddUser}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    {searchedPendingUser ? 'Claim & Update' : 'Add User'}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
